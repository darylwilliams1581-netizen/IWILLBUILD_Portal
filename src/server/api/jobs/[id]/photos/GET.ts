import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { jobPhotos, profiles, jobs } from '../../../../db/schema.js';
import { eq, and, desc, lt, sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { getSignedUrl } from '../../../../storage/storage-service.js';

const PHOTO_BUCKET = 'job-photos';
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

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

    // ── Pagination params ────────────────────────────────────────────────────
    const limitParam = parseInt(String(req.query.limit ?? DEFAULT_LIMIT), 10);
    const limit = isNaN(limitParam) ? DEFAULT_LIMIT : Math.min(Math.max(1, limitParam), MAX_LIMIT);
    // cursor = ISO timestamp of the last item from the previous page
    const cursor = req.query.cursor ? String(req.query.cursor) : null;

    // Build where clause
    const baseWhere = and(
      eq(jobPhotos.jobId, jobId),
      eq(jobPhotos.companyId, profile.companyId),
    );
    const whereClause = cursor
      ? and(baseWhere, lt(jobPhotos.createdAt, cursor))
      : baseWhere;

    // Fetch one extra to know if there's a next page
    const rows = await db
      .select()
      .from(jobPhotos)
      .where(whereClause)
      .orderBy(desc(jobPhotos.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? pageRows[pageRows.length - 1].createdAt : null;

    // Total count (cheap — no joins, indexed)
    const [{ count: totalCount }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(jobPhotos)
      .where(and(eq(jobPhotos.jobId, jobId), eq(jobPhotos.companyId, profile.companyId)));

    // Attach signed URLs for original + thumbnail + preview
    // Sign all URLs in parallel for speed
    const photos = await Promise.all(
      pageRows.map(async (p) => {
        const [url, thumbnailUrl, previewUrl] = await Promise.all([
          getSignedUrl(p.filename, PHOTO_BUCKET, 3600).catch(() =>
            `/api/jobs/${jobId}/photos/${p.id}/download`
          ),
          p.thumbnailKey
            ? getSignedUrl(p.thumbnailKey, PHOTO_BUCKET, 3600).catch(() => null)
            : Promise.resolve(null),
          p.previewKey
            ? getSignedUrl(p.previewKey, PHOTO_BUCKET, 3600).catch(() => null)
            : Promise.resolve(null),
        ]);
        return { ...p, url, thumbnailUrl, previewUrl };
      })
    );

    res.json({ photos, hasMore, nextCursor, totalCount: Number(totalCount) });
  } catch (error) {
    console.error('GET /api/jobs/:id/photos error:', error);
    res.status(500).json({ error: 'Failed to fetch photos' });
  }
}
