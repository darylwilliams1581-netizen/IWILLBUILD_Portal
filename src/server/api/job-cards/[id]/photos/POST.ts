/**
 * POST /api/job-cards/:id/photos
 * Upload one or more photos to a Job Card.
 * Reuses the same multipart + storage-service pattern as job photos.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { parseMultipartForm } from '../../../../lib/file-upload.js';
import {
  compressImageIfNeeded,
  saveFile,
  ALLOWED_IMAGE_MIMES,
} from '../../../../storage/storage-service.js';

const BUCKET = 'job-card-photos';
const MAX_BYTES = 20 * 1024 * 1024;

export default async function handler(req: Request, res: Response) {
  let parsed;
  try {
    parsed = await parseMultipartForm(req, { maxFileSize: MAX_BYTES, maxFiles: 10 });
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'Upload error' });
  }
  if (parsed.limitError) return res.status(400).json({ error: parsed.limitError });

  console.log(`[job-card-photos POST] cardId=${req.params.id} files=${parsed.files.length}`);
  for (const f of parsed.files) {
    console.log(`[job-card-photos POST] file: name="${f.originalname}" mime="${f.mimetype}" size=${f.size}`);
  }

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

    const cardId = Number(req.params.id);
    if (!cardId) return res.status(400).json({ error: 'Invalid id' });

    // Verify ownership
    const ownerResult = await db.execute(
      sql`SELECT id FROM job_cards WHERE id = ${cardId} AND company_id = ${profile.companyId}`
    );
    const ownerRows = ownerResult[0] as Array<{ id: number }>;
    if (!ownerRows?.length) return res.status(404).json({ error: 'Job card not found' });

    const caption = String(parsed.fields.caption ?? '').trim() || null;
    const saved: Array<{ id: number; file_path: string; file_name: string; caption: string | null }> = [];

    for (const file of parsed.files) {
      // MIME reclassification (same as job photos)
      const ext = (file.originalname.split('.').pop() ?? '').toLowerCase();
      if (file.mimetype === 'application/octet-stream' || !file.mimetype) {
        if (ext === 'heic' || ext === 'heif') file.mimetype = 'image/heic';
        else if (ext === 'jpg' || ext === 'jpeg') file.mimetype = 'image/jpeg';
        else if (ext === 'png') file.mimetype = 'image/png';
        else if (ext === 'webp') file.mimetype = 'image/webp';
        else {
          const sig = file.buffer.slice(0, 4);
          if (sig[0] === 0xFF && sig[1] === 0xD8) file.mimetype = 'image/jpeg';
          else if (sig[0] === 0x89 && sig[1] === 0x50) file.mimetype = 'image/png';
          else file.mimetype = 'image/jpeg';
        }
      }

      if (!ALLOWED_IMAGE_MIMES[file.mimetype]) continue;

      const compressed = await compressImageIfNeeded(file.buffer, file.mimetype);
      const fileName = `jc-${cardId}-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
      const result = await saveFile({
        buffer: compressed.buffer,
        originalName: fileName,
        mimeType: compressed.mimeType,
        bucket: BUCKET,
      });

      const insResult = await db.execute(sql`
        INSERT INTO job_card_photos (job_card_id, company_id, file_path, file_name, mime_type, caption, uploaded_by)
        VALUES (${cardId}, ${profile.companyId}, ${result.publicUrl}, ${file.originalname}, ${compressed.mimeType}, ${caption}, ${session.user.id})
      `);
      const ins = insResult[0] as { insertId?: number };
      const insertId = Number(ins?.insertId ?? 0);
      saved.push({ id: insertId, file_path: result.publicUrl, file_name: file.originalname, caption });
    }

    res.status(201).json({ photos: saved });
  } catch (err) {
    console.error('POST /api/job-cards/:id/photos error:', err);
    res.status(500).json({ error: 'Failed to upload photos' });
  }
}
