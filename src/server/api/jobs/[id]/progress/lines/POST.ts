/**
 * POST /api/jobs/:id/progress/lines
 * Create a new progress line for a job.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { jobProgressLines, jobs, profiles } from '../../../../../db/schema.js';
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

    const { description, quantity, unit, rate, startDate, endDate } = req.body as {
      description?: string;
      quantity?: string;
      unit?: string;
      rate?: string;
      startDate?: string | null;
      endDate?: string | null;
    };

    if (!description?.trim()) return res.status(400).json({ error: 'description is required' });

    // Place new line at the end
    const [maxRow] = await db
      .select({ maxOrder: max(jobProgressLines.sortOrder) })
      .from(jobProgressLines)
      .where(and(eq(jobProgressLines.jobId, jobId), eq(jobProgressLines.companyId, profile.companyId)));
    const nextOrder = (maxRow?.maxOrder ?? 0) + 1;

    await db.insert(jobProgressLines).values({
      jobId,
      companyId: profile.companyId,
      description: description.trim(),
      quantity: quantity?.trim() || '1',
      unit: unit?.trim() || null,
      rate: rate?.trim() || '0',
      percentComplete: 0,
      sortOrder: nextOrder,
      startDate: startDate || null,
      endDate: endDate || null,
    });

    const lines = await db
      .select()
      .from(jobProgressLines)
      .where(and(eq(jobProgressLines.jobId, jobId), eq(jobProgressLines.companyId, profile.companyId)))
      .orderBy(asc(jobProgressLines.sortOrder), asc(jobProgressLines.id));

    return res.status(201).json({ lines });
  } catch (err) {
    console.error('POST /api/jobs/:id/progress/lines error:', err);
    return res.status(500).json({ error: 'Failed to create progress line' });
  }
}
