/**
 * POST /api/jobs/:id/progress/lines
 * Create a new Program of Works activity.
 *
 * Financial fields (quantity, unit, rate) are NOT accepted — they default to
 * '1', null, '0' for historical compatibility but are not shown in the PoW UI.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { jobProgressLines, jobProgressSections, jobs, profiles } from '../../../../../db/schema.js';
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
      // duplicate flag — internal use
      _duplicate?: boolean;
    };

    if (!body.description?.trim()) return res.status(400).json({ error: 'description is required' });
    if (body.description.trim().length > 2000) return res.status(400).json({ error: 'description too long' });

    if (body.startDate && !/^\d{4}-\d{2}-\d{2}$/.test(body.startDate)) {
      return res.status(400).json({ error: 'startDate must be YYYY-MM-DD' });
    }
    if (body.endDate && !/^\d{4}-\d{2}-\d{2}$/.test(body.endDate)) {
      return res.status(400).json({ error: 'endDate must be YYYY-MM-DD' });
    }
    if (body.startDate && body.endDate && body.endDate < body.startDate) {
      return res.status(400).json({ error: 'Finish date cannot be before Start date' });
    }

    // Validate sectionId belongs to this job+company
    if (body.sectionId != null) {
      const sec = await db.query.jobProgressSections.findFirst({
        where: and(
          eq(jobProgressSections.id, body.sectionId),
          eq(jobProgressSections.jobId, jobId),
          eq(jobProgressSections.companyId, profile.companyId),
        ),
      });
      if (!sec) return res.status(400).json({ error: 'Invalid sectionId' });
    }

    const pct = body.percentComplete !== undefined
      ? Math.max(0, Math.min(100, parseInt(String(body.percentComplete), 10) || 0))
      : 0;

    // Place new activity at the end
    const [maxRow] = await db
      .select({ maxOrder: max(jobProgressLines.sortOrder) })
      .from(jobProgressLines)
      .where(and(eq(jobProgressLines.jobId, jobId), eq(jobProgressLines.companyId, profile.companyId)));
    const nextOrder = (maxRow?.maxOrder ?? 0) + 1;

    await db.insert(jobProgressLines).values({
      jobId,
      companyId: profile.companyId,
      sectionId: body.sectionId ?? null,
      description: body.description.trim(),
      // Financial defaults — preserved for PO compatibility, not shown in PoW UI
      quantity: '1',
      unit: null,
      rate: '0',
      percentComplete: pct,
      progressNote: body.progressNote?.trim() || null,
      startDate: body.startDate || null,
      endDate: body.endDate || null,
      sortOrder: nextOrder,
      assignmentType: body.assignmentType || null,
      assignedToName: body.assignedToName?.trim() || null,
      tradeType: body.tradeType || null,
      contractorId: body.contractorId ?? null,
    });

    const activities = await db
      .select()
      .from(jobProgressLines)
      .where(and(eq(jobProgressLines.jobId, jobId), eq(jobProgressLines.companyId, profile.companyId)))
      .orderBy(asc(jobProgressLines.sortOrder), asc(jobProgressLines.id));

    return res.status(201).json({ activities });
  } catch (err) {
    console.error('POST /api/jobs/:id/progress/lines error:', err);
    return res.status(500).json({ error: 'Failed to create activity' });
  }
}
