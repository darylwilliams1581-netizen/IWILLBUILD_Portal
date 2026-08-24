/**
 * PATCH /api/jobs/:id/progress/lines/:lineId
 * Edit a progress line's description, qty, unit, rate, start_date, end_date.
 * (percentComplete + progressNote are handled by the existing PUT bulk endpoint.)
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../../db/client.js';
import { jobProgressLines, jobs, profiles } from '../../../../../../db/schema.js';
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
    const lineId = parseInt(String(req.params.lineId), 10);
    if (isNaN(jobId) || isNaN(lineId)) return res.status(400).json({ error: 'Invalid ID' });

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

    const upd: Record<string, unknown> = {};
    if (description !== undefined) {
      if (!description.trim()) return res.status(400).json({ error: 'description cannot be empty' });
      upd.description = description.trim();
    }
    if (quantity !== undefined) upd.quantity = quantity.trim() || '1';
    if (unit !== undefined) upd.unit = unit?.trim() || null;
    if (rate !== undefined) upd.rate = rate.trim() || '0';
    if (startDate !== undefined) upd.startDate = startDate || null;
    if (endDate !== undefined) upd.endDate = endDate || null;

    if (Object.keys(upd).length > 0) {
      await db.update(jobProgressLines)
        .set(upd)
        .where(
          and(
            eq(jobProgressLines.id, lineId),
            eq(jobProgressLines.jobId, jobId),
            eq(jobProgressLines.companyId, profile.companyId),
          ),
        );
    }

    const lines = await db
      .select()
      .from(jobProgressLines)
      .where(and(eq(jobProgressLines.jobId, jobId), eq(jobProgressLines.companyId, profile.companyId)))
      .orderBy(asc(jobProgressLines.sortOrder), asc(jobProgressLines.id));

    return res.json({ lines });
  } catch (err) {
    console.error('PATCH /api/jobs/:id/progress/lines/:lineId error:', err);
    return res.status(500).json({ error: 'Failed to update progress line' });
  }
}
