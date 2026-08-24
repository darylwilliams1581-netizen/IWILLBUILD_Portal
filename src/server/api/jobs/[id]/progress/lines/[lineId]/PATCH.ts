/**
 * PATCH /api/jobs/:id/progress/lines/:lineId
 * Edit a progress activity.
 *
 * Accepted fields (all optional):
 *   description, sectionId, progressNote, startDate, endDate, percentComplete,
 *   assignmentType, assignedToName, tradeType, contractorId
 *
 * Financial fields (quantity, unit, rate) are intentionally NOT accepted here —
 * they are preserved internally for historical PO compatibility but not editable
 * through the Program of Works UI.
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

    const body = req.body as {
      description?: string;
      sectionId?: number | null;
      progressNote?: string | null;
      startDate?: string | null;
      endDate?: string | null;
      percentComplete?: number;
      assignmentType?: string | null;
      assignedToName?: string | null;
      tradeType?: string | null;
      contractorId?: number | null;
    };

    const upd: Record<string, unknown> = {};

    if (body.description !== undefined) {
      if (!body.description.trim()) return res.status(400).json({ error: 'description cannot be empty' });
      if (body.description.trim().length > 2000) return res.status(400).json({ error: 'description too long' });
      upd.description = body.description.trim();
    }
    if (body.sectionId !== undefined) upd.sectionId = body.sectionId ?? null;
    if (body.progressNote !== undefined) upd.progressNote = body.progressNote?.trim() || null;
    if (body.startDate !== undefined) {
      if (body.startDate && !/^\d{4}-\d{2}-\d{2}$/.test(body.startDate)) {
        return res.status(400).json({ error: 'startDate must be YYYY-MM-DD' });
      }
      upd.startDate = body.startDate || null;
    }
    if (body.endDate !== undefined) {
      if (body.endDate && !/^\d{4}-\d{2}-\d{2}$/.test(body.endDate)) {
        return res.status(400).json({ error: 'endDate must be YYYY-MM-DD' });
      }
      upd.endDate = body.endDate || null;
    }
    // Date order validation
    if (upd.startDate && upd.endDate && String(upd.endDate) < String(upd.startDate)) {
      return res.status(400).json({ error: 'Finish date cannot be before Start date' });
    }
    if (body.percentComplete !== undefined) {
      const pct = parseInt(String(body.percentComplete), 10);
      if (isNaN(pct) || pct < 0 || pct > 100) return res.status(400).json({ error: 'percentComplete must be 0–100' });
      upd.percentComplete = pct;
    }
    if (body.assignmentType !== undefined) upd.assignmentType = body.assignmentType || null;
    if (body.assignedToName !== undefined) upd.assignedToName = body.assignedToName?.trim() || null;
    if (body.tradeType !== undefined) upd.tradeType = body.tradeType || null;
    if (body.contractorId !== undefined) upd.contractorId = body.contractorId ?? null;

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

    const activities = await db
      .select()
      .from(jobProgressLines)
      .where(and(eq(jobProgressLines.jobId, jobId), eq(jobProgressLines.companyId, profile.companyId)))
      .orderBy(asc(jobProgressLines.sortOrder), asc(jobProgressLines.id));

    return res.json({ activities });
  } catch (err) {
    console.error('PATCH /api/jobs/:id/progress/lines/:lineId error:', err);
    return res.status(500).json({ error: 'Failed to update activity' });
  }
}
