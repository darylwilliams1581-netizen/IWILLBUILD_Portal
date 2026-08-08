/**
 * POST /api/jobs/:id/photos/:photoId/lock
 * ─────────────────────────────────────────────────────────────────────────────
 * Lock a job photo after the editor has saved the final version.
 *
 * Sets:
 *   job_photos.status          = 'locked'
 *   job_photos.locked_at       = NOW()
 *   job_photos.locked_by_user_id = session user id
 *   job_photos.locked_by_name  = profile display name
 *
 * If the photo has a media_asset_id, also updates:
 *   media_assets.status          = 'locked'
 *   media_assets.locked_at       = NOW()
 *   media_assets.locked_by_user_id = session user id
 *
 * Returns 409 if already locked.
 * Returns 403 if the photo does not belong to the session company.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../../db/client.js';
import { jobPhotos, profiles, jobs } from '../../../../../../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../../lib/auth/auth.js';
import { getSignedUrl } from '../../../../../../storage/storage-service.js';

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

    const jobId   = parseInt(String(req.params.id), 10);
    const photoId = parseInt(String(req.params.photoId), 10);
    if (isNaN(jobId) || isNaN(photoId)) return res.status(400).json({ error: 'Invalid ID' });

    // Ownership check
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

    // Already locked — idempotent guard
    if (photo.status === 'locked') {
      return res.status(409).json({
        error: 'Photo is already locked',
        lockedAt: photo.lockedAt,
        lockedByName: photo.lockedByName,
      });
    }

    const lockedByName =
      profile.firstName && profile.lastName
        ? `${profile.firstName} ${profile.lastName}`.trim()
        : (profile.firstName ?? profile.email ?? session.user.email ?? 'Unknown');

    const nowSql = sql`NOW()`;

    // Update job_photos
    await db.update(jobPhotos).set({
      status: 'locked',
      lockedAt: nowSql as unknown as Date,
      lockedByUserId: session.user.id,
      lockedByName,
    }).where(eq(jobPhotos.id, photoId));

    // Update canonical media_assets row if linked
    if (photo.mediaAssetId) {
      try {
        await db.execute(
          sql`UPDATE media_assets
              SET status = 'locked',
                  locked_at = NOW(),
                  locked_by_user_id = ${session.user.id}
              WHERE id = ${photo.mediaAssetId}
                AND company_id = ${profile.companyId}`
        );
      } catch (e) {
        // Non-fatal — columns may not exist on older DBs yet (migration runs async)
        console.warn('[lock] media_assets update skipped:', e instanceof Error ? e.message : e);
      }
    }

    const updated = await db.query.jobPhotos.findFirst({ where: eq(jobPhotos.id, photoId) });

    // Generate fresh signed URLs so the client can immediately display the
    // locked photo without waiting for the next full photo list reload.
    let url: string | null = null;
    let thumbnailUrl: string | null = null;
    let previewUrl: string | null = null;
    if (updated) {
      try { url = await getSignedUrl(updated.filename, PHOTO_BUCKET, 3600); } catch { /* best-effort */ }
      if (updated.thumbnailKey) {
        try { thumbnailUrl = await getSignedUrl(updated.thumbnailKey, PHOTO_BUCKET, 3600); } catch { /* best-effort */ }
      }
      if (updated.previewKey) {
        try { previewUrl = await getSignedUrl(updated.previewKey, PHOTO_BUCKET, 3600); } catch { /* best-effort */ }
      }
    }

    return res.json({
      ok: true,
      photo: updated ? { ...updated, url, thumbnailUrl, previewUrl } : null,
    });
  } catch (error) {
    console.error('POST lock error:', error);
    return res.status(500).json({ error: 'Failed to lock photo' });
  }
}
