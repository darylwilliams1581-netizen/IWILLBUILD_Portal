/**
 * GET /api/public/job-photos/:token
 * Returns job info + signed photo URLs for a valid share token.
 * No auth required — token is the credential.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { jobPhotos, jobs } from '../../../../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { hashToken } from '../../../../lib/share-tokens.js';
import { getSignedUrl } from '../../../../storage/storage-service.js';

const PHOTO_BUCKET = 'job-photos';

export default async function handler(req: Request, res: Response) {
  try {
    const { token } = req.params;
    if (!token) return res.status(400).json({ error: 'Missing token' });

    const hash = hashToken(token);

    // Look up share record
    const share = await db.get<{ job_id: number; company_id: number; expires_at: string }>(
      `SELECT job_id, company_id, expires_at FROM job_photo_shares WHERE token_hash = ?`,
      [hash]
    );

    if (!share) return res.status(404).json({ error: 'Share link not found or expired' });
    if (new Date(share.expires_at) < new Date()) return res.status(410).json({ error: 'Share link has expired' });

    const job = await db.query.jobs.findFirst({ where: eq(jobs.id, share.job_id) });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const rows = await db.select().from(jobPhotos)
      .where(and(eq(jobPhotos.jobId, share.job_id), eq(jobPhotos.companyId, share.company_id)))
      .orderBy(desc(jobPhotos.createdAt));

    const photos = await Promise.all(rows.map(async (p) => {
      let url: string | null = null;
      try { url = await getSignedUrl(p.filename, PHOTO_BUCKET, 3600); } catch { /* best-effort */ }
      return { ...p, url };
    }));

    res.json({
      job: { id: job.id, name: job.name, jobNumber: job.jobNumber },
      photos,
      expiresAt: share.expires_at,
    });
  } catch (error) {
    console.error('GET /api/public/job-photos/:token error:', error);
    res.status(500).json({ error: 'Failed to load shared photos' });
  }
}
