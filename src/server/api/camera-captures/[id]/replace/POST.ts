/**
 * POST /api/camera-captures/:id/replace
 * Replace the image file for an existing camera capture.
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
  deleteFile,
} from '../../../../storage/storage-service.js';

const BUCKET = 'camera-captures';

export default async function handler(req: Request, res: Response) {
  let parsed;
  try {
    parsed = await parseMultipartForm(req, { maxFileSize: 20 * 1024 * 1024, maxFiles: 1 });
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'Upload error' });
  }
  if (parsed.limitError) return res.status(400).json({ error: parsed.limitError });

  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, session.user.id),
    });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const captureId = parseInt(String(req.params.id), 10);
    if (isNaN(captureId)) return res.status(400).json({ error: 'Invalid ID' });

    const file = parsed.files?.[0];
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    // MIME reclassification
    const ext = (file.originalname.split('.').pop() ?? '').toLowerCase();
    if (file.mimetype === 'application/octet-stream' || !file.mimetype) {
      if (ext === 'heic' || ext === 'heif') file.mimetype = 'image/heic';
      else if (ext === 'jpg' || ext === 'jpeg') file.mimetype = 'image/jpeg';
      else if (ext === 'png') file.mimetype = 'image/png';
      else file.mimetype = 'image/jpeg';
    }
    if (file.mimetype === 'image/jpg') file.mimetype = 'image/jpeg';
    if (!ALLOWED_IMAGE_MIMES[file.mimetype]) {
      return res.status(400).json({ error: `Unsupported image type: ${file.mimetype}` });
    }

    // Fetch existing capture to get old storage key
    const [rows] = await db.execute(sql`
      SELECT storage_key FROM camera_captures
      WHERE id = ${captureId} AND company_id = ${profile.companyId} AND user_id = ${session.user.id}
    `) as unknown as [Array<{ storage_key: string }>, unknown];
    const existing = rows?.[0];
    if (!existing) return res.status(404).json({ error: 'Capture not found' });

    // Compress
    let compressed = file.buffer;
    let outMime = file.mimetype;
    try {
      const result = await compressImageIfNeeded(file.buffer, file.mimetype);
      compressed = result.buffer;
      outMime = result.mimeType;
    } catch { /* use raw */ }

    // Save to same storage key (overwrites in place)
    const result = await saveFile({
      buffer: compressed,
      originalName: file.originalname,
      mimeType: outMime,
      bucket: BUCKET,
      storageKey: existing.storage_key,
    });

    // Update DB
    await db.execute(sql`
      UPDATE camera_captures
      SET mime_type = ${outMime}, size_bytes = ${result.sizeBytes}
      WHERE id = ${captureId} AND company_id = ${profile.companyId}
    `);

    res.json({ ok: true, capture: { url: result.publicUrl } });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('POST /api/camera-captures/:id/replace error:', msg);
    res.status(500).json({ error: msg });
  }
}
