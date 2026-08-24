/**
 * GET /api/jobs/:id/progress
 * Returns the full Program of Works payload for a job:
 *   { sections: ProgressSection[], activities: ProgressActivity[] }
 *
 * Sections are ordered by sort_order, id.
 * Activities are ordered by sort_order, id.
 * Activities with sectionId = null appear in the "Unsectioned" group.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { jobProgressLines, jobProgressSections, jobs, profiles } from '../../../../db/schema.js';
import { eq, and, asc } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';

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

    const [sections, activities] = await Promise.all([
      db
        .select()
        .from(jobProgressSections)
        .where(and(eq(jobProgressSections.jobId, jobId), eq(jobProgressSections.companyId, profile.companyId)))
        .orderBy(asc(jobProgressSections.sortOrder), asc(jobProgressSections.id)),
      db
        .select()
        .from(jobProgressLines)
        .where(and(eq(jobProgressLines.jobId, jobId), eq(jobProgressLines.companyId, profile.companyId)))
        .orderBy(asc(jobProgressLines.sortOrder), asc(jobProgressLines.id)),
    ]);

    // Legacy compatibility: also expose as `lines` for any existing consumers
    res.json({ sections, activities, lines: activities });
  } catch (err) {
    console.error('GET /api/jobs/:id/progress error:', err);
    res.status(500).json({ error: 'Failed to fetch progress' });
  }
}
