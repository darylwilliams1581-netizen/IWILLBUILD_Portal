/**
 * GET /api/lens/photos/:photoId/download
 * ─────────────────────────────────────────────────────────────────────────────
 * Download a single job photo by ID, scoped to the authenticated company.
 * No jobId required — Lens photos may come from any job.
 *
 * Security:
 *   - Authentication required
 *   - Company ID resolved from session only
 *   - Photo must belong to the authenticated company
 *   - Storage key never exposed in the response
 */

import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { jobPhotos, profiles } from '../../../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { getDownloadStream, BUCKET_JOB_PHOTOS } from '../../../../../storage/storage-service.js';

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

    const photoId = parseInt(String(req.params.photoId), 10);
    if (isNaN(photoId)) return res.status(400).json({ error: 'Invalid photo ID' });

    const photo = await db.query.jobPhotos.findFirst({
      where: and(
        eq(jobPhotos.id, photoId),
        eq(jobPhotos.companyId, profile.companyId),
      ),
    });
    if (!photo) return res.status(404).json({ error: 'Photo not found' });

    const { stream, mimeType, sizeBytes } = await getDownloadStream(photo.filename, BUCKET_JOB_PHOTOS);

    const resolvedMime = photo.mimeType ?? mimeType ?? 'image/jpeg';
    const ext = resolvedMime.includes('png') ? '.png'
      : resolvedMime.includes('webp') ? '.webp'
      : '.jpg';

    const rawName = (photo.label ?? '').trim()
      || (photo.originalName ?? '').trim()
      || `photo-${photoId}${ext}`;

    const hasExt = /\.[a-zA-Z0-9]{2,5}$/.test(rawName);
    const downloadName = hasExt ? rawName : `${rawName}${ext}`;

    const encodedName = encodeURIComponent(downloadName).replace(/'/g, '%27');
    const safeName    = downloadName.replace(/"/g, '_');

    res.setHeader('Content-Type', resolvedMime);
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"; filename*=UTF-8''${encodedName}`);
    if (sizeBytes > 0) res.setHeader('Content-Length', String(sizeBytes));

    stream.on('error', () => {
      if (!res.headersSent) res.status(404).json({ error: 'File not found' });
    });
    stream.pipe(res);
  } catch (error) {
    console.error('GET /api/lens/photos/:photoId/download error:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Failed to download photo' });
  }
}
