/**
 * POST /api/asset-manager/inspections/:id/photos
 * Multipart upload — stores file to /shared-storage/public/assets/am-media/
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../../lib/auth-middleware.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
const MAX_SIZE = 20 * 1024 * 1024; // 20 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.includes(file.mimetype)) cb(null, true);
    else cb(new Error(`Unsupported file type: ${file.mimetype}`));
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

  try {
    const [check] = await db.execute(sql`SELECT asset_id FROM am_inspections WHERE id = ${id} AND company_id = ${profile.companyId}`) as unknown as [Array<{ asset_id: number }>, unknown];
    if (!check.length) return res.status(404).json({ error: 'Inspection not found' });

    const ext = path.extname(req.file.originalname) || '.bin';
    const filename = `${crypto.randomUUID()}${ext}`;
    const dir = `/shared-storage/public/assets/am-media`;
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(`${dir}/${filename}`, req.file.buffer);

    const filePath = `/airo-assets/uploads/am-media/${filename}`;
    const [result] = await db.execute(sql`
      INSERT INTO am_media (asset_id, inspection_id, company_id, category, file_path, file_name, mime_type, uploaded_by)
      VALUES (${check[0].asset_id}, ${id}, ${profile.companyId}, 'site_photo', ${filePath}, ${req.file.originalname}, ${req.file.mimetype}, ${session.user.id})
    `) as unknown as [{ insertId: number }, unknown];

    return res.status(201).json({ ok: true, id: result.insertId, filePath, fileName: req.file.originalname });
  } catch (err) {
    console.error('POST inspection photos error:', err);
    return res.status(500).json({ error: 'Failed to upload' });
  }
}
