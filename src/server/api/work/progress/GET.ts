/**
 * GET /api/work/progress
 *
 * Company-wide progress register — one summary row per job that has
 * progress lines. Read-only. Additive — does not replace
 * GET /api/jobs/:id/progress.
 *
 * Query params:
 *   cursor   — last seen job_id (opaque integer)
 *   limit    — 1-100, default 50
 *   jobId    — filter to a single job (returns that job's lines directly)
 *   q        — free-text search on job name
 *   dateFrom / dateTo — filter on job scheduled_start_date
 *
 * Response: { jobs: [...], nextCursor, hasMore }
 *   Each job entry: { jobId, jobName, jobNumber, jobStatus, lineCount,
 *                     avgPercent, scheduledStartDate, expectedCompletionDate,
 *                     updatedAt }
 *
 * Security:
 *   - Auth required
 *   - companyId server-side only
 *   - Tenant-scoped via company_id on both tables
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { jobProgressLines, jobs, profiles } from '../../../db/schema.js';
import { eq, and, lt, desc, like, sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, session.user.id),
    });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const companyId = profile.companyId;

    // ── Parse & validate params ───────────────────────────────────────────────
    const rawLimit = parseInt(String(req.query.limit ?? DEFAULT_LIMIT), 10);
    const limit = isNaN(rawLimit) || rawLimit < 1 ? DEFAULT_LIMIT : Math.min(rawLimit, MAX_LIMIT);

    const rawCursor = req.query.cursor ? parseInt(String(req.query.cursor), 10) : null;
    if (req.query.cursor && (rawCursor === null || isNaN(rawCursor))) {
      return res.status(400).json({ error: 'Invalid cursor' });
    }

    const rawJobId = req.query.jobId ? parseInt(String(req.query.jobId), 10) : null;
    if (req.query.jobId && (rawJobId === null || isNaN(rawJobId))) {
      return res.status(400).json({ error: 'Invalid jobId' });
    }

    const q = req.query.q ? String(req.query.q).trim().slice(0, 200) : null;

    // ── Single-job mode: return lines directly ────────────────────────────────
    if (rawJobId !== null) {
      const job = await db.query.jobs.findFirst({
        where: and(eq(jobs.id, rawJobId), eq(jobs.companyId, companyId)),
      });
      if (!job) return res.status(404).json({ error: 'Job not found' });

      const lines = await db
        .select()
        .from(jobProgressLines)
        .where(and(eq(jobProgressLines.jobId, rawJobId), eq(jobProgressLines.companyId, companyId)))
        .orderBy(jobProgressLines.id);

      return res.json({
        mode: 'single',
        job: {
          id: job.id,
          name: job.name,
          jobNumber: job.jobNumber,
          status: job.status,
          scheduledStartDate: job.scheduledStartDate,
          expectedCompletionDate: job.expectedCompletionDate,
        },
        lines,
        nextCursor: null,
        hasMore: false,
      });
    }

    // ── Company-wide mode: one summary row per job ────────────────────────────
    const jobConditions = [eq(jobs.companyId, companyId)];
    if (rawCursor !== null) jobConditions.push(lt(jobs.id, rawCursor));
    if (q) jobConditions.push(like(jobs.name, `%${q}%`));

    // Get jobs that have progress lines, with aggregate stats
    const jobsWithProgress = await db
      .select({
        jobId: jobs.id,
        jobName: jobs.name,
        jobNumber: jobs.jobNumber,
        jobStatus: jobs.status,
        scheduledStartDate: jobs.scheduledStartDate,
        expectedCompletionDate: jobs.expectedCompletionDate,
        lineCount: sql<number>`COUNT(${jobProgressLines.id})`,
        avgPercent: sql<number>`ROUND(AVG(${jobProgressLines.percentComplete}), 1)`,
        maxUpdatedAt: sql<string>`MAX(${jobProgressLines.updatedAt})`,
      })
      .from(jobs)
      .innerJoin(
        jobProgressLines,
        and(
          eq(jobProgressLines.jobId, jobs.id),
          eq(jobProgressLines.companyId, companyId)
        )
      )
      .where(and(...jobConditions))
      .groupBy(
        jobs.id, jobs.name, jobs.jobNumber, jobs.status,
        jobs.scheduledStartDate, jobs.expectedCompletionDate
      )
      .orderBy(desc(jobs.id))
      .limit(limit + 1);

    const hasMore = jobsWithProgress.length > limit;
    const page = hasMore ? jobsWithProgress.slice(0, limit) : jobsWithProgress;
    const nextCursor = hasMore ? String(page[page.length - 1].jobId) : null;

    const result = page.map((r) => ({
      jobId: r.jobId,
      jobName: r.jobName,
      jobNumber: r.jobNumber,
      jobStatus: r.jobStatus,
      scheduledStartDate: r.scheduledStartDate,
      expectedCompletionDate: r.expectedCompletionDate,
      lineCount: Number(r.lineCount),
      avgPercent: Number(r.avgPercent ?? 0),
      updatedAt: r.maxUpdatedAt ?? null,
    }));

    return res.json({ mode: 'company', jobs: result, nextCursor, hasMore });
  } catch (err) {
    console.error('[GET /api/work/progress]', err);
    return res.status(500).json({ error: 'Failed to load progress' });
  }
}
