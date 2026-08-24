/**
 * PATCH /api/jobs/:id/progress/sections/:sectionId
 * Edit a section's title and/or description.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../../db/client.js';
import { jobProgressSections, jobs, profiles } from '../../../../../../db/schema.js';
import { eq, and, asc } from 'drizzle-orm';
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

    const { title, description } = req.body as { title?: string; description?: string };
    const upd: Record<string, unknown> = {};
    if (title !== undefined) {
      if (!title.trim()) return res.status(400).json({ error: 'title cannot be empty' });
      if (title.trim().length > 255) return res.status(400).json({ error: 'title too long (max 255)' });
      upd.title = title.trim();
    }
    if (description !== undefined) upd.description = description?.trim() || null;

    if (Object.keys(upd).length > 0) {
      await db.update(jobProgressSections)
        .set(upd)
        .where(
          and(
            eq(jobProgressSections.id, sectionId),
            eq(jobProgressSections.jobId, jobId),
            eq(jobProgressSections.companyId, profile.companyId),
          ),
        );
    }

    const sections = await db
      .select()
      .from(jobProgressSections)
      .where(and(eq(jobProgressSections.jobId, jobId), eq(jobProgressSections.companyId, profile.companyId)))
      .orderBy(asc(jobProgressSections.sortOrder), asc(jobProgressSections.id));

    return res.json({ sections });
  } catch (err) {
    console.error('PATCH /api/jobs/:id/progress/sections/:sectionId error:', err);
    return res.status(500).json({ error: 'Failed to update section' });
  }
}
