/**
 * POST /api/jobs/:id/progress/sections
 * Create a new Program of Works section.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { jobProgressSections, jobs, profiles } from '../../../../../db/schema.js';
import { eq, and, asc, max } from 'drizzle-orm';
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

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const jobId = parseInt(String(req.params.id), 10);
    if (isNaN(jobId)) return res.status(400).json({ error: 'Invalid job ID' });

    const job = await db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.companyId, profile.companyId)),
    });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const { title, description } = req.body as { title?: string; description?: string };
    if (!title?.trim()) return res.status(400).json({ error: 'title is required' });
    if (title.trim().length > 255) return res.status(400).json({ error: 'title too long (max 255)' });

    const [maxRow] = await db
      .select({ maxOrder: max(jobProgressSections.sortOrder) })
      .from(jobProgressSections)
      .where(and(eq(jobProgressSections.jobId, jobId), eq(jobProgressSections.companyId, profile.companyId)));
    const nextOrder = (maxRow?.maxOrder ?? 0) + 1;

    await db.insert(jobProgressSections).values({
      jobId,
      companyId: profile.companyId,
      title: title.trim(),
      description: description?.trim() || null,
      sortOrder: nextOrder,
    });

    const sections = await db
      .select()
      .from(jobProgressSections)
      .where(and(eq(jobProgressSections.jobId, jobId), eq(jobProgressSections.companyId, profile.companyId)))
      .orderBy(asc(jobProgressSections.sortOrder), asc(jobProgressSections.id));

    return res.status(201).json({ sections });
  } catch (err) {
    console.error('POST /api/jobs/:id/progress/sections error:', err);
    return res.status(500).json({ error: 'Failed to create section' });
  }
}
