/**
 * POST /api/job-costs
 *
 * Creates a job cost entry from the driver app.
 * Accepts multipart/form-data so receipts can be uploaded in the same request.
 *
 * Fields:
 *   jobId        (required) — job to attach cost to
 *   description  (required) — what was purchased
 *   amount       (optional) — dollar amount
 *   category     (optional) — materials | labour | equipment | subcontract | other
 *   source       (optional) — e.g. "driver_app"
 *   receipts     (optional) — up to 5 image/pdf files
 */
import type { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../lib/auth-middleware.js';
import type { ResultSetHeader } from 'mysql2';

const UPLOAD_DIR = '/shared-storage/public/assets/uploads/job-costs';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, '/tmp'),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.bin';
    cb(null, `jc-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    const ok = /^(image\/(jpeg|png|webp|heic)|application\/pdf)$/.test(file.mimetype);
    cb(null, ok);
  },
}).array('receipts', 5);

export default async function handler(req: Request, res: Response) {
  // Run multer first
  await new Promise<void>((resolve, reject) => {
    upload(req, res, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  const { jobId, description, amount, category = 'materials', source = 'portal' } = req.body as {
    jobId?: string;
    description?: string;
    amount?: string;
    category?: string;
    source?: string;
  };

  const jobIdNum = parseInt(jobId ?? '');
  if (!jobIdNum) return res.status(400).json({ error: 'Invalid jobId' });
  if (!description?.trim()) return res.status(400).json({ error: 'Description is required' });

  const companyId = auth.profile.companyId;
  const userId    = auth.session.user.id;
  const amountNum = parseFloat(amount ?? '0') || 0;

  try {
    // Verify job belongs to company
    const [jobRows] = await db.execute(
      sql.raw(`SELECT id FROM jobs WHERE id = ${jobIdNum} AND company_id = ${companyId} LIMIT 1`)
    ) as unknown as [Array<{ id: number }>, unknown];
    if (!jobRows?.[0]) return res.status(404).json({ error: 'Job not found' });

    // Insert cost record
    const safeDesc     = description.trim().replace(/'/g, "''").slice(0, 500);
    const safeCat      = (category ?? 'materials').replace(/'/g, '').slice(0, 60);
    const safeSource   = (source ?? 'portal').replace(/'/g, '').slice(0, 30);
    const safeUserId   = userId.replace(/'/g, '');

    const [result] = await db.execute(sql.raw(
      `INSERT INTO job_costs (company_id, job_id, user_id, description, amount, category, notes, created_at, updated_at)
       VALUES (${companyId}, ${jobIdNum}, '${safeUserId}', '${safeDesc}', ${amountNum}, '${safeCat}', '${safeSource}', NOW(), NOW())`
    )) as unknown as [ResultSetHeader, unknown];

    const costId = result.insertId;

    // Move uploaded files to persistent storage and record them
    const files = (req.files ?? []) as Express.Multer.File[];
    const savedFiles: string[] = [];

    if (files.length > 0) {
      await fs.mkdir(UPLOAD_DIR, { recursive: true });
      for (const file of files) {
        const dest = path.join(UPLOAD_DIR, `${costId}-${file.filename}`);
        await fs.rename(file.path, dest).catch(() => fs.copyFile(file.path, dest));
        savedFiles.push(`/airo-assets/uploads/job-costs/${costId}-${file.filename}`);
      }
    }

    return res.status(201).json({
      ok: true,
      costId,
      receipts: savedFiles,
      message: 'Cost saved successfully.',
    });
  } catch (err) {
    console.error('POST /api/job-costs error:', err);
    return res.status(500).json({ error: 'Failed to save cost' });
  }
}
