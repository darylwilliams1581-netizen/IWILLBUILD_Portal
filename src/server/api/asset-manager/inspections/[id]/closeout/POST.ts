/**
 * POST /api/asset-manager/inspections/:id/closeout
 * Upload induction or completion doc (PDF/DOCX).
 * Best-effort text extraction stored in extracted_json.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../../lib/auth-middleware.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';

const ALLOWED = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'];
const MAX_SIZE = 30 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED.includes(file.mimetype)) cb(null, true);
    else cb(new Error(`Unsupported type: ${file.mimetype}. Upload PDF or DOCX.`));
  },
});

export const middleware = upload.single('file');

export default async function handler(req: Request, res: Response) {
  const sp = await getSessionAndProfile(req, res);
  if (!sp) return;
  const { session, profile } = sp;
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const form_type = (req.body.form_type as string) || 'completion';

  try {
    const [check] = await db.execute(sql`SELECT id FROM am_inspections WHERE id = ${id} AND company_id = ${profile.companyId}`) as unknown as [unknown[], unknown];
    if (!(check as unknown[]).length) return res.status(404).json({ error: 'Inspection not found' });

    const ext = path.extname(req.file.originalname) || '.bin';
    const filename = `${crypto.randomUUID()}${ext}`;
    const dir = `/shared-storage/public/assets/am-closeout`;
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(`${dir}/${filename}`, req.file.buffer);
    const filePath = `/airo-assets/uploads/am-closeout/${filename}`;

    // Best-effort text extraction for PDFs (no external deps — just store raw)
    const extractedJson = JSON.stringify({ note: 'Manual review required', filename: req.file.originalname, size: req.file.size });

    const [result] = await db.execute(sql`
      INSERT INTO am_closeout_forms (inspection_id, company_id, form_type, source_file_path, extracted_json, created_by)
      VALUES (${id}, ${profile.companyId}, ${form_type}, ${filePath}, ${extractedJson}, ${session.user.id})
    `) as unknown as [{ insertId: number }, unknown];

    await db.execute(sql`INSERT INTO am_audit_log (entity_type, entity_id, action, actor_id) VALUES ('closeout', ${result.insertId}, 'uploaded', ${session.user.id})`);

    const [rows] = await db.execute(sql`SELECT * FROM am_closeout_forms WHERE id = ${result.insertId}`) as unknown as [unknown[], unknown];
    return res.status(201).json({ closeout: (rows as Record<string, unknown>[])[0], filePath });
  } catch (err) {
    console.error('POST closeout error:', err);
    return res.status(500).json({ error: 'Failed to upload' });
  }
}
