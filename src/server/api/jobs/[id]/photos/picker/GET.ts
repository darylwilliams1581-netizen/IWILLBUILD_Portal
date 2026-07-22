/**
 * GET /api/jobs/:id/photos/picker
 * Lightweight list of job photos for the Doc Studio "Pick from job" picker
 * and the Generate Job Report modal.
 *
 * Returns up to 200 photos with:
 *   - thumbUrl   — ~300px thumbnail (fast grid display)
 *   - reportImageUrl — preview (~1000px) or thumbnail; used for PDF embedding
 *   - caption, category — user-editable metadata
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { jobPhotos, profiles, jobs } from '../../../../../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { getSignedUrl } from '../../../../../storage/storage-service.js';

const PHOTO_BUCKET = 'job-photos';
const SIGNED_URL_TTL = 3600; // 1 hour

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
    if (isNaN(jobId)) return res.status(400).json({ error: 'Invalid job ID' });

    const job = await db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.companyId, profile.companyId)),
    });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const rows = await db
      .select()
      .from(jobPhotos)
      .where(and(eq(jobPhotos.jobId, jobId), eq(jobPhotos.companyId, profile.companyId)))
      .orderBy(desc(jobPhotos.createdAt))
      .limit(200);

    const photos = await Promise.all(
      rows.map(async (p) => {
        // Thumbnail for grid display (~300px)
        const thumbKey = p.thumbnailKey ?? null;
        // Report image: prefer preview (~1000px), fall back to thumbnail, then original
        const reportKey = p.previewKey ?? p.thumbnailKey ?? null;

        const [thumbUrl, reportImageUrl] = await Promise.all([
          thumbKey
            ? getSignedUrl(thumbKey, PHOTO_BUCKET, SIGNED_URL_TTL).catch(() => null)
            : Promise.resolve(null),
          reportKey
            ? getSignedUrl(reportKey, PHOTO_BUCKET, SIGNED_URL_TTL).catch(() => null)
            : Promise.resolve(null),
        ]);

        // Fallback: authenticated download endpoint (works even without signed URLs)
        const fallbackUrl = `/api/jobs/${jobId}/photos/${p.id}/report-image`;

        return {
          id: p.id,
          label: p.label ?? p.originalName ?? `Photo ${p.id}`,
          caption: p.caption ?? null,
          category: p.category ?? null,
          thumbUrl: thumbUrl ?? fallbackUrl,
          reportImageUrl: reportImageUrl ?? fallbackUrl,
          downloadUrl: `/api/jobs/${jobId}/photos/${p.id}/download`,
          createdAt: p.createdAt,
          imageWidth: p.imageWidth ?? null,
          imageHeight: p.imageHeight ?? null,
        };
      })
    );

    res.json({ photos });
  } catch (error) {
    console.error('GET /api/jobs/:id/photos/picker error:', error);
    res.status(500).json({ error: 'Failed to fetch photos' });
  }
}
