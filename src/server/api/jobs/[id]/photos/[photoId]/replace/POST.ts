/**
 * POST /api/jobs/:id/photos/:photoId/replace
 * ─────────────────────────────────────────────────────────────────────────────
 * Replace the stored image for a job photo with a new version.
 *
 * Used by:
 *  - The photo editor (Save & Lock flow) — sends the flattened canvas JPEG
 *  - The legacy "Upload edited version" button in EditModal
 *
 * Behaviour:
 *  - Rejects if the photo is already locked (status = 'locked')
 *  - Compresses the incoming image
 *  - Saves to storage, deletes the old file
 *  - Updates job_photos row (filename, mime, size)
 *  - If photo has a media_asset_id, also updates media_assets (storage_key,
 *    mime_type, size_bytes, checksum) so the canonical record stays in sync
 *  - Does NOT lock — caller must POST .../lock separately after replace
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../../db/client.js';
import { jobPhotos, profiles, jobs } from '../../../../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../../lib/auth/auth.js';
import { randomUUID, createHash } from 'node:crypto';
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

    const jobId   = parseInt(String(req.params.id), 10);
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

    // Locked photos cannot be replaced
    if (photo.status === 'locked') {
      return res.status(409).json({ error: 'Photo is locked and cannot be replaced.' });
    }

    const { buffer: compressed, mimeType: outMime } = await compressImageIfNeeded(
      file.buffer,
      file.mimetype,
    );

    const ext = outMime === 'image/png' ? 'png' : 'jpg';
    const storageKey = `${randomUUID()}.${ext}`;
    const checksum = createHash('sha256').update(compressed).digest('hex');

    const result = await saveFile({
      buffer: compressed,
      originalName: file.originalname,
      mimeType: outMime,
      bucket: PHOTO_BUCKET,
      storageKey,
    });

    // Delete old storage file (best-effort)
    try { await deleteFile(photo.filename, PHOTO_BUCKET); } catch { /* ignore */ }

    // Update job_photos
    await db.update(jobPhotos).set({
      filename: result.storageKey,
      originalName: file.originalname,
      mimeType: outMime,
      sizeBytes: result.sizeBytes,
    }).where(eq(jobPhotos.id, photoId));

    // Update canonical media_assets row if linked
    if (photo.mediaAssetId) {
      try {
        await db.execute(
          sql`UPDATE media_assets
              SET storage_key  = ${result.storageKey},
                  mime_type    = ${outMime},
                  size_bytes   = ${result.sizeBytes},
                  checksum     = ${checksum}
              WHERE id = ${photo.mediaAssetId}
                AND company_id = ${profile.companyId}`
        );
      } catch (e) {
        console.warn('[replace] media_assets update skipped:', e instanceof Error ? e.message : e);
      }
    }

    const updated = await db.query.jobPhotos.findFirst({ where: eq(jobPhotos.id, photoId) });
    let url: string | null = null;
    let thumbnailUrl: string | null = null;
    let previewUrl: string | null = null;
    try { url = await getSignedUrl(result.storageKey, PHOTO_BUCKET, 3600); } catch { /* best-effort */ }
    if (updated?.thumbnailKey) {
      try { thumbnailUrl = await getSignedUrl(updated.thumbnailKey, PHOTO_BUCKET, 3600); } catch { /* best-effort */ }
    }
    if (updated?.previewKey) {
      try { previewUrl = await getSignedUrl(updated.previewKey, PHOTO_BUCKET, 3600); } catch { /* best-effort */ }
    }
    return res.json({ ok: true, photo: { ...updated, url, thumbnailUrl, previewUrl } });
  } catch (error) {
    console.error('POST replace error:', error);
    return res.status(500).json({ error: 'Failed to replace photo' });
  }
}
