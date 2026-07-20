import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { jobPhotos, profiles, jobs } from '../../../../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { getSignedUrl } from '../../../../storage/storage-service.js';

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
    if (isNaN(jobId)) return res.status(400).json({ error: 'Invalid job ID' });

    // Ownership check
    const job = await db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.companyId, profile.companyId)),
    });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const rows = await db
      .select()
      .from(jobPhotos)
      .where(and(eq(jobPhotos.jobId, jobId), eq(jobPhotos.companyId, profile.companyId)))
      .orderBy(desc(jobPhotos.createdAt));

    // Attach signed URLs for original + thumbnail + preview
    const photos = await Promise.all(
      rows.map(async (p) => {
        // Original URL
        let url: string | null = null;
        try {
          url = await getSignedUrl(p.filename, PHOTO_BUCKET, 3600);
        } catch (urlErr) {
          console.error(`[photos GET] getSignedUrl failed for ${p.filename}:`, urlErr);
          url = `/api/jobs/${jobId}/photos/${p.id}/download`;
        }

        // Thumbnail URL (if thumbnail was generated)
        let thumbnailUrl: string | null = null;
        if (p.thumbnailKey) {
          try {
            thumbnailUrl = await getSignedUrl(p.thumbnailKey, PHOTO_BUCKET, 3600);
          } catch {
            thumbnailUrl = null;
          }
        }

        // Preview URL (if preview was generated)
        let previewUrl: string | null = null;
        if (p.previewKey) {
          try {
            previewUrl = await getSignedUrl(p.previewKey, PHOTO_BUCKET, 3600);
          } catch {
            previewUrl = null;
          }
        }

        return { ...p, url, thumbnailUrl, previewUrl };
      })
    );

    res.json({ photos });
  } catch (error) {
    console.error('GET /api/jobs/:id/photos error:', error);
    res.status(500).json({ error: 'Failed to fetch photos' });
  }
}

