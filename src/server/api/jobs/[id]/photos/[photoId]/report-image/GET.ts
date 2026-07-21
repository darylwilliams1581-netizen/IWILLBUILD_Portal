/**
 * GET /api/jobs/:id/photos/:photoId/report-image
 *
 * Serves the compressed preview image (~1000px wide) for a job photo,
 * falling back to the thumbnail (~300px) then the full original.
 *
 * This endpoint is used by:
 *   - The Doc Studio image blocks in job reports (src attribute)
 *   - The server-side PDF generator (fetches this URL to embed images)
 *
 * Originals are never served here — they remain accessible only via
 * /download for evidence/archival purposes.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../../db/client.js';
import { jobPhotos, profiles, jobs } from '../../../../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { getAuth } from '../../../../../../../lib/auth/auth.js';
import { getDownloadStream } from '../../../../../../storage/storage-service.js';

const PHOTO_BUCKET = 'job-photos';

export default async function handler(req: Request, res: Response) {
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

    // Prefer preview (~1000px) → thumbnail (~300px) → original
    const storageKey = photo.previewKey ?? photo.thumbnailKey ?? photo.filename;
    const mimeType = (photo.previewKey ?? photo.thumbnailKey)
      ? (photo.previewMimeType ?? photo.thumbnailMimeType ?? 'image/jpeg')
      : (photo.mimeType ?? 'image/jpeg');

    const { stream, sizeBytes } = await getDownloadStream(storageKey, PHOTO_BUCKET);

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    if (sizeBytes > 0) res.setHeader('Content-Length', String(sizeBytes));

    stream.on('error', () => {
      if (!res.headersSent) res.status(404).json({ error: 'Image not found' });
    });
    stream.pipe(res);
  } catch (error) {
    console.error('GET /api/jobs/:id/photos/:photoId/report-image error:', error);
    res.status(500).json({ error: 'Failed to serve report image' });
  }
}
