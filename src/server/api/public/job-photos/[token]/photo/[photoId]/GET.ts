/**
 * GET /api/public/job-photos/:token/photo/:photoId
 * Streams a single photo for a valid share token — no auth required.
 * Used as fallback when R2 signed URLs are unavailable.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../../db/client.js';
import { jobPhotoShares, jobPhotos } from '../../../../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { hashToken } from '../../../../../../lib/share-tokens.js';
import { getDownloadStream, BUCKET_JOB_PHOTOS } from '../../../../../../storage/storage-service.js';

export default async function handler(req: Request, res: Response) {
  try {
    const { token, photoId } = req.params;
    if (!token || !photoId) return res.status(400).json({ error: 'Missing params' });

    // Validate share token
    const hash = hashToken(token);
    const [share] = await db
      .select()
      .from(jobPhotoShares)
      .where(eq(jobPhotoShares.tokenHash, hash))
      .limit(1);

    if (!share) return res.status(404).json({ error: 'Share link not found' });
    if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
      return res.status(410).json({ error: 'Share link has expired' });
    }

    const pid = parseInt(photoId, 10);
    if (isNaN(pid)) return res.status(400).json({ error: 'Invalid photo ID' });

    const photo = await db.query.jobPhotos.findFirst({
      where: and(
        eq(jobPhotos.id, pid),
        eq(jobPhotos.jobId, share.jobId),
        eq(jobPhotos.companyId, share.companyId),
      ),
    });
    if (!photo) return res.status(404).json({ error: 'Photo not found' });

    const { stream, mimeType, sizeBytes } = await getDownloadStream(photo.filename, BUCKET_JOB_PHOTOS);

    res.setHeader('Content-Type', photo.mimeType ?? mimeType ?? 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    if (sizeBytes > 0) res.setHeader('Content-Length', String(sizeBytes));

    stream.on('error', () => {
      if (!res.headersSent) res.status(404).json({ error: 'File not found' });
    });
    stream.pipe(res);
  } catch (error) {
    console.error('GET /api/public/job-photos/:token/photo/:photoId error:', error);
    res.status(500).json({ error: 'Failed to load photo' });
  }
}
