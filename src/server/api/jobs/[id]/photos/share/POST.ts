/**
 * POST /api/jobs/:id/photos/share
 * Generate a 90-day view-only share token for a job's photos.
 * Returns { shareUrl, expiresAt }
 *
 * Strategy: DELETE any existing share for this job, then INSERT fresh.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { jobPhotoShares, profiles, jobs } from '../../../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { generateShareToken, hashToken, expiresAt } from '../../../../../lib/share-tokens.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const jobId = parseInt(String(req.params.id), 10);
    if (isNaN(jobId)) return res.status(400).json({ error: 'Invalid job ID' });

    const job = await db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.companyId, profile.companyId)),
    });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    // ── Generate share link ───────────────────────────────────────────────────
    const raw = generateShareToken();
    const hash = hashToken(raw);
    const exp = expiresAt(90);

    // Delete any existing share for this job, then insert fresh.
    await db.delete(jobPhotoShares).where(
      and(
        eq(jobPhotoShares.jobId, jobId),
        eq(jobPhotoShares.companyId, profile.companyId),
      )
    );

    await db.insert(jobPhotoShares).values({
      jobId,
      companyId: profile.companyId,
      tokenHash: hash,
      expiresAt: exp,
      createdByUserId: session.user.id,
    });

    const origin = `${req.protocol}://${req.get('host')}`;
    const shareUrl = `${origin}/photos/share/${raw}`;

    res.json({ shareUrl, expiresAt: exp.toISOString() });
  } catch (error) {
    console.error('POST /api/jobs/:id/photos/share error:', error);
    res.status(500).json({ error: 'Failed to generate share link' });
  }
}
