import type { Request, Response } from 'express';
import { db } from '../../../../../../db/client.js';
import { jobPhotos, profiles, jobs } from '../../../../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { getAuth } from '../../../../../../../lib/auth/auth.js';
import { randomUUID } from 'node:crypto';
import { parseMultipartForm } from '../../../../../../lib/file-upload.js';
import {
  compressImageIfNeeded,
  saveFile,
  deleteFile,
  getSignedUrl,
  ALLOWED_IMAGE_MIMES,
} from '../../../../../../storage/storage-service.js';

const PHOTO_BUCKET = 'job-photos';

export default async function handler(req: Request, res: Response) {
  let parsed;
  try {
    parsed = await parseMultipartForm(req, { maxFileSize: 20 * 1024 * 1024, maxFiles: 1 });
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'Upload error' });
  }
  if (parsed.limitError) return res.status(400).json({ error: parsed.limitError });

  const file = parsed.file;
  if (!file) return res.status(400).json({ error: 'No file uploaded' });

  if (!ALLOWED_IMAGE_MIMES[file.mimetype]) {
    return res.status(400).json({ error: `"${file.originalname}" is not a supported type. Use JPEG, PNG, or WebP.` });
  }

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

    const jobId = parseInt(String(req.params.id), 10);
    const photoId = parseInt(String(req.params.photoId), 10);
    if (isNaN(jobId) || isNaN(photoId)) return res.status(400).json({ error: 'Invalid ID' });

    const job = await db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.companyId, profile.companyId)),
    });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const photo = await db.query.jobPhotos.findFirst({
      where: and(
        eq(jobPhotos.id, photoId),
        eq(jobPhotos.jobId, jobId),
        eq(jobPhotos.companyId, profile.companyId),
      ),
    });
    if (!photo) return res.status(404).json({ error: 'Photo not found' });

    const { buffer: compressed, mimeType: outMime } = await compressImageIfNeeded(
      file.buffer,
      file.mimetype,
    );

    const ext = outMime === 'image/png' ? 'png' : 'jpg';
    const storageKey = `${randomUUID()}.${ext}`;

    const result = await saveFile({
      buffer: compressed,
      originalName: file.originalname,
      mimeType: outMime,
      bucket: PHOTO_BUCKET,
      storageKey,
    });

    await deleteFile(photo.filename, PHOTO_BUCKET);

    await db.update(jobPhotos).set({
      filename: result.storageKey,
      originalName: file.originalname,
      mimeType: outMime,
      sizeBytes: result.sizeBytes,
    }).where(eq(jobPhotos.id, photoId));

    const updated = await db.query.jobPhotos.findFirst({ where: eq(jobPhotos.id, photoId) });
    let url: string | null = null;
    try { url = await getSignedUrl(result.storageKey, PHOTO_BUCKET, 3600); } catch { /* best-effort */ }
    res.json({ ok: true, photo: { ...updated, url } });
  } catch (error) {
    console.error('POST replace error:', error);
    res.status(500).json({ error: 'Failed to replace photo' });
  }
}
