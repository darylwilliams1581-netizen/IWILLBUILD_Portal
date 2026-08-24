/**
 * DELETE /api/jobs/:id/progress/sections/:sectionId
 * Delete a section. Only allowed when the section has no activities assigned to it.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../../db/client.js';
import { jobProgressSections, jobProgressLines, jobs, profiles } from '../../../../../../db/schema.js';
import { eq, and, asc, count } from 'drizzle-orm';
import { getAuth } from '../../../../../../../lib/auth/auth.js';

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
    const sectionId = parseInt(String(req.params.sectionId), 10);
    if (isNaN(jobId) || isNaN(sectionId)) return res.status(400).json({ error: 'Invalid ID' });

    const job = await db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.companyId, profile.companyId)),
    });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    // Guard: section must be empty
    const [countRow] = await db
      .select({ n: count(jobProgressLines.id) })
      .from(jobProgressLines)
      .where(
        and(
          eq(jobProgressLines.sectionId, sectionId),
          eq(jobProgressLines.jobId, jobId),
          eq(jobProgressLines.companyId, profile.companyId),
        ),
      );
    if ((countRow?.n ?? 0) > 0) {
      return res.status(409).json({
        error: 'Section has activities. Move or delete all activities before deleting the section.',
        code: 'SECTION_NOT_EMPTY',
      });
    }

    await db.delete(jobProgressSections).where(
      and(
        eq(jobProgressSections.id, sectionId),
        eq(jobProgressSections.jobId, jobId),
        eq(jobProgressSections.companyId, profile.companyId),
      ),
    );

    const sections = await db
      .select()
      .from(jobProgressSections)
      .where(and(eq(jobProgressSections.jobId, jobId), eq(jobProgressSections.companyId, profile.companyId)))
      .orderBy(asc(jobProgressSections.sortOrder), asc(jobProgressSections.id));

    return res.json({ sections });
  } catch (err) {
    console.error('DELETE /api/jobs/:id/progress/sections/:sectionId error:', err);
    return res.status(500).json({ error: 'Failed to delete section' });
  }
}
