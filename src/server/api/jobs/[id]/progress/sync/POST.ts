/**
 * POST /api/jobs/:id/progress/sync
 *
 * RETIRED — estimate-syncing is no longer supported.
 *
 * This endpoint is kept alive so that old app clients receive a clear
 * machine-readable error instead of a 404. It performs zero database
 * mutations after authentication and job-ownership checks.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { jobs, profiles } from '../../../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';

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

    // ── Retired — no mutations performed ─────────────────────────────────────
    return res.status(200).json({
      code: 'PROGRESS_SYNC_RETIRED',
      error: 'Progress is now managed through the Program of Works.',
    });
  } catch (err) {
    console.error('POST /api/jobs/:id/progress/sync error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
