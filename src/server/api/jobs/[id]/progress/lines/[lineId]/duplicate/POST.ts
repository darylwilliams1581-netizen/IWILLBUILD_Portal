/**
 * POST /api/jobs/:id/progress/lines/:lineId/duplicate
 * Duplicate an activity. The copy is placed immediately after the original
 * (sort_order = original + 0.5, then renormalised via reorder).
 * Financial fields are preserved on the copy for historical compatibility.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../../../db/client.js';
import { jobProgressLines, jobs, profiles } from '../../../../../../../db/schema.js';
import { eq, and, asc, max } from 'drizzle-orm';
import { getAuth } from '../../../../../../../../lib/auth/auth.js';

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

    const source = await db.query.jobProgressLines.findFirst({
      where: and(
        eq(jobProgressLines.id, lineId),
        eq(jobProgressLines.jobId, jobId),
        eq(jobProgressLines.companyId, profile.companyId),
      ),
    });
    if (!source) return res.status(404).json({ error: 'Activity not found' });

    // Place copy at the end
    const [maxRow] = await db
      .select({ maxOrder: max(jobProgressLines.sortOrder) })
      .from(jobProgressLines)
      .where(and(eq(jobProgressLines.jobId, jobId), eq(jobProgressLines.companyId, profile.companyId)));
    const nextOrder = (maxRow?.maxOrder ?? 0) + 1;

    await db.insert(jobProgressLines).values({
      jobId,
      companyId: profile.companyId,
      sectionId: source.sectionId,
      estimateLineId: null, // copy is not linked to an estimate line
      description: `${source.description} (copy)`,
      quantity: source.quantity,
      unit: source.unit,
      rate: source.rate,
      percentComplete: 0, // copy starts fresh
      progressNote: source.progressNote,
      startDate: source.startDate,
      endDate: source.endDate,
      sortOrder: nextOrder,
      assignmentType: source.assignmentType,
      assignedToName: source.assignedToName,
      tradeType: source.tradeType,
      contractorId: source.contractorId,
    });

    const activities = await db
      .select()
      .from(jobProgressLines)
      .where(and(eq(jobProgressLines.jobId, jobId), eq(jobProgressLines.companyId, profile.companyId)))
      .orderBy(asc(jobProgressLines.sortOrder), asc(jobProgressLines.id));

    return res.status(201).json({ activities });
  } catch (err) {
    console.error('POST /api/jobs/:id/progress/lines/:lineId/duplicate error:', err);
    return res.status(500).json({ error: 'Failed to duplicate activity' });
  }
}
