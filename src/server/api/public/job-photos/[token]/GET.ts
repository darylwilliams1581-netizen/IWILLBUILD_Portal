/**
 * GET /api/public/job-photos/:token
 * Returns job info + signed photo URLs for a valid share token.
 * No auth required — the token IS the credential.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { jobPhotoShares, jobPhotos, jobs } from '../../../../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { hashToken } from '../../../../lib/share-tokens.js';
import { getSignedUrl, BUCKET_JOB_PHOTOS } from '../../../../storage/storage-service.js';

export default async function handler(req: Request, res: Response) {
  try {
    const { token } = req.params;
    if (!token) return res.status(400).json({ error: 'Missing token' });

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

    const [job] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, share.jobId))
      .limit(1);

    if (!job) return res.status(404).json({ error: 'Job not found' });

    const rows = await db
      .select()
      .from(jobPhotos)
      .where(and(eq(jobPhotos.jobId, share.jobId), eq(jobPhotos.companyId, share.companyId)))
      .orderBy(desc(jobPhotos.createdAt));

    const photos = await Promise.all(
      rows.map(async (p) => {
        let url: string | null = null;
        try {
          url = await getSignedUrl(p.filename, BUCKET_JOB_PHOTOS, 86400); // 24h for public share links
        } catch (urlErr) {
          console.error(`[public job-photos] getSignedUrl failed for ${p.filename}:`, urlErr);
          url = `/api/public/job-photos/${req.params.token}/photo/${p.id}`;
        }

        let thumbnailUrl: string | null = null;
        if (p.thumbnailKey) {
          try { thumbnailUrl = await getSignedUrl(p.thumbnailKey, BUCKET_JOB_PHOTOS, 86400); } catch { /* ignore */ }
        }

        let previewUrl: string | null = null;
        if (p.previewKey) {
          try { previewUrl = await getSignedUrl(p.previewKey, BUCKET_JOB_PHOTOS, 86400); } catch { /* ignore */ }
        }

        return { ...p, url, thumbnailUrl, previewUrl };
      })
    );

    res.json({
      job: { id: job.id, name: job.name, jobNumber: job.jobNumber },
      photos,
      expiresAt: share.expiresAt,
    });
  } catch (error) {
    console.error('GET /api/public/job-photos/:token error:', error);
    res.status(500).json({ error: 'Failed to load shared photos' });
  }
}
