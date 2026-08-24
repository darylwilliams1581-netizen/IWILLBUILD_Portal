/**
 * POST /api/jobs/:id/progress/sections/reorder
 * Atomically reorder all sections for a job.
 *
 * Body: { ids: number[] }  — complete ordered list of section IDs.
 *
 * Validation:
 *   - Exact set: no duplicates, no unknowns, no missing IDs.
 *   - All IDs must belong to this job + company.
 *   - Runs in a single transaction with full rollback on failure.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../../db/client.js';
import { jobProgressSections, jobs, profiles } from '../../../../../../db/schema.js';
import { eq, and, asc, sql } from 'drizzle-orm';
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
    if (isNaN(jobId)) return res.status(400).json({ error: 'Invalid job ID' });

    const job = await db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.companyId, profile.companyId)),
    });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const { ids } = req.body as { ids?: unknown };
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });

    const parsedIds = ids.map((v) => parseInt(String(v), 10));
    if (parsedIds.some(isNaN)) return res.status(400).json({ error: 'ids must be integers' });

    // Duplicate check
    if (new Set(parsedIds).size !== parsedIds.length) {
      return res.status(400).json({ error: 'Duplicate IDs in reorder list' });
    }

    // Fetch current sections for this job+company
    const existing = await db
      .select({ id: jobProgressSections.id })
      .from(jobProgressSections)
      .where(and(eq(jobProgressSections.jobId, jobId), eq(jobProgressSections.companyId, profile.companyId)));

    const existingSet = new Set(existing.map((s) => s.id));

    // Exact set validation
    if (parsedIds.length !== existingSet.size) {
      return res.status(400).json({ error: 'IDs list length does not match section count' });
    }
    for (const id of parsedIds) {
      if (!existingSet.has(id)) {
        return res.status(400).json({ error: `Unknown or cross-job section ID: ${id}` });
      }
    }

    // Atomic update in transaction
    await db.transaction(async (tx) => {
      for (let i = 0; i < parsedIds.length; i++) {
        await tx.update(jobProgressSections)
          .set({ sortOrder: i + 1 })
          .where(
            and(
              eq(jobProgressSections.id, parsedIds[i]),
              eq(jobProgressSections.jobId, jobId),
              eq(jobProgressSections.companyId, profile.companyId),
            ),
          );
      }
    });

    const sections = await db
      .select()
      .from(jobProgressSections)
      .where(and(eq(jobProgressSections.jobId, jobId), eq(jobProgressSections.companyId, profile.companyId)))
      .orderBy(asc(jobProgressSections.sortOrder), asc(jobProgressSections.id));

    return res.json({ sections });
  } catch (err) {
    console.error('POST /api/jobs/:id/progress/sections/reorder error:', err);
    return res.status(500).json({ error: 'Failed to reorder sections' });
  }
}
