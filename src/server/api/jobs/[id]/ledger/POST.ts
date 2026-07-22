/**
 * POST /api/jobs/:id/ledger
 * Manually add a ledger entry.
 * Accepts both JSON and multipart/form-data (for optional receipt photo).
 */
import type { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { db } from '../../../../db/client.js';
import { jobs, profiles } from '../../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import type { ResultSetHeader } from 'mysql2';

const UPLOAD_DIR = '/shared-storage/public/assets/uploads/ledger-photos';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, '/tmp'),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.bin';
    cb(null, `ledger-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ok = /^(image\/(jpeg|png|webp|heic)|application\/pdf)$/.test(file.mimetype);
    cb(null, ok);
  },
}).single('photo');

const VALID_EVENT_TYPES = [
  'LABOUR', 'MATERIAL', 'PLANT', 'SUBCONTRACTOR', 'RECEIPT',
  'PURCHASE', 'VARIATION', 'INVOICE_LINE', 'CREDIT', 'ADJUSTMENT',
];

export default async function handler(req: Request, res: Response) {
  // Run multer (handles both multipart and json — multer is a no-op for json)
  await new Promise<void>((resolve, reject) => {
    upload(req, res, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const jobId = parseInt(String(req.params.id), 10);
    if (isNaN(jobId)) return res.status(400).json({ error: 'Invalid job ID' });

    const job = await db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.companyId, profile.companyId)),
    });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const body = req.body as Record<string, string | number | boolean>;
    const {
      entryDate, eventType, sourceModule, sourceId,
      description, qty, unit, rate,
      gstInclusive, accountCode, taxCode,
      contactName, contactType, reference, status,
    } = body;

    if (!description) return res.status(400).json({ error: 'Description is required' });
    if (!entryDate) return res.status(400).json({ error: 'Entry date is required' });

    const evType = VALID_EVENT_TYPES.includes(String(eventType)) ? String(eventType) : 'MATERIAL';
    const qtyNum = parseFloat(String(qty)) || 1;
    const rateNum = parseFloat(String(rate)) || 0;
    const subtotal = Math.round(qtyNum * rateNum * 100) / 100;
    const gstIncl = gstInclusive === true || gstInclusive === 'true' || gstInclusive === 1;
    const gstAmt = Math.round(subtotal * 0.1 * 100) / 100;
    const total = subtotal + gstAmt;

    // Handle optional photo upload
    let photoUrl: string | null = null;
    const photoFile = req.file as Express.Multer.File | undefined;
    if (photoFile) {
      await fs.mkdir(UPLOAD_DIR, { recursive: true });
      const dest = path.join(UPLOAD_DIR, photoFile.filename);
      await fs.rename(photoFile.path, dest).catch(() => fs.copyFile(photoFile.path, dest));
      photoUrl = `/airo-assets/uploads/ledger-photos/${photoFile.filename}`;
    }

    const [result] = await db.execute(sql`
      INSERT INTO job_cost_ledger
        (company_id, job_id, job_number, job_title, entry_date, event_type, source_module, source_id,
         description, qty, unit, rate, subtotal, gst, total, gst_inclusive,
         account_code, tax_code, contact_name, contact_type, reference, status,
         created_by_user_id, created_by_name, photo_url)
      VALUES
        (${profile.companyId}, ${jobId}, ${job.jobNumber ?? null}, ${job.name ?? null},
         ${String(entryDate)}, ${evType},
         ${String(sourceModule ?? 'manual')}, ${sourceId ? String(sourceId) : null},
         ${String(description)}, ${qtyNum}, ${unit ? String(unit) : null}, ${rateNum},
         ${subtotal}, ${gstAmt}, ${total}, ${gstIncl ? 1 : 0},
         ${accountCode ? String(accountCode) : null},
         ${taxCode ? String(taxCode) : 'GST'},
         ${contactName ? String(contactName) : null},
         ${contactType ? String(contactType) : null},
         ${reference ? String(reference) : null},
         ${['pending', 'approved'].includes(String(status)) ? String(status) : 'pending'},
         ${session.user.id}, ${session.user.name ?? null},
         ${photoUrl})
    `) as unknown as [ResultSetHeader, unknown];

    const [rows] = await db.execute(
      sql`SELECT * FROM job_cost_ledger WHERE id = ${result.insertId}`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    res.status(201).json({ entry: rows?.[0] ?? null });
  } catch (err) {
    console.error('POST /api/jobs/:id/ledger error:', err);
    res.status(500).json({ error: 'Failed to create ledger entry' });
  }
}
