/**
 * POST /api/asset-manager/assets/:id/photos
 * Multipart upload — stores to /shared-storage/public/assets/am-asset-photos/
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../../lib/auth-middleware.js';
import { parseMultipartForm } from '../../../../../lib/file-upload.js';
import path from 'path';
import fs from 'fs/promises';

const ALLOWED_MIME: Record<string, boolean> = {
  'image/jpeg': true,
  'image/png': true,
  'image/webp': true,
  'image/gif': true,
};
const MAX_SIZE = 20 * 1024 * 1024;

export default async function handler(req: Request, res: Response) {
  let parsed;
  try {
    parsed = await parseMultipartForm(req, { maxFileSize: MAX_SIZE, maxFiles: 10 });
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'Upload error' });
  }
  if (parsed.limitError) return res.status(400).json({ error: parsed.limitError });

  for (const f of parsed.files) {
    if (!ALLOWED_MIME[f.mimetype]) {
      return res.status(400).json({ error: `"${f.originalname}" is not a supported image type.` });
    }
  }

  const sp = await getSessionAndProfile(req, res);
  if (!sp) return;
  const { session, profile } = sp;
  const assetId = parseInt(String(req.params.id), 10);
  if (isNaN(assetId)) return res.status(400).json({ error: 'Invalid id' });

  if (!parsed.files.length) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const [check] = await db.execute(sql`SELECT id FROM am_assets WHERE id = ${assetId} AND company_id = ${profile.companyId}`) as unknown as [unknown[], unknown];
    if (!(check as unknown[]).length) return res.status(404).json({ error: 'Not found' });

    const uploaded: Array<{ id: number; filePath: string; fileName: string }> = [];

    for (const file of parsed.files) {
      const ext = path.extname(file.originalname) || '.jpg';
      const filename = `${crypto.randomUUID()}${ext}`;
      const dir = `/shared-storage/public/assets/am-asset-photos`;
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(`${dir}/${filename}`, file.buffer);

      const filePath = `/airo-assets/uploads/am-asset-photos/${filename}`;
      const caption = (parsed.fields as Record<string, string>).caption ?? '';
      const safeCaption = caption ? `'${caption.replace(/'/g, "''")}'` : 'NULL';

      const [result] = await db.execute(sql.raw(`
        INSERT INTO am_asset_photos (asset_id, company_id, file_path, file_name, mime_type, caption, uploaded_by)
        VALUES (${assetId}, ${profile.companyId}, '${filePath}', '${file.originalname.replace(/'/g, "''")}', '${file.mimetype}', ${safeCaption}, '${session.user.id}')
      `)) as unknown as [{ insertId: number }, unknown];

      uploaded.push({ id: result.insertId, filePath, fileName: file.originalname });
    }

    return res.status(201).json({ ok: true, photos: uploaded });
  } catch (err) {
    console.error('POST asset photo error:', err);
    return res.status(500).json({ error: 'Failed to upload' });
  }
}
