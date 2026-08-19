/**
 * GET /api/work/tasks
 *
 * Company-wide task register. Read-only. Additive — does not replace
 * GET /api/jobs/:id/todos.
 *
 * Query params:
 *   cursor      — last seen id (opaque, integer-based)
 *   limit       — 1-100, default 50
 *   jobId       — filter to a single job
 *   assignedUserId — filter by assignee
 *   status      — Open | In Progress | Completed | Cancelled | overdue
 *   q           — free-text search on title
 *
 * Response: { tasks, nextCursor, total }
 *
 * Security:
 *   - Auth required (401 if missing)
 *   - companyId derived server-side from profile (403 if missing)
 *   - All filters parameterised via Drizzle sql template
 *   - Response field allowlist (no internal tokens)
 *   - Pagination capped at 100
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { jobTodos, jobs, profiles } from '../../../db/schema.js';
import { eq, and, lt, desc, asc, like, sql, inArray } from 'drizzle-orm';
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

    // ── Parse & validate query params ────────────────────────────────────────
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

    const assignedUserId = req.query.assignedUserId ? String(req.query.assignedUserId) : null;
    const statusFilter = req.query.status ? String(req.query.status) : null;
    const q = req.query.q ? String(req.query.q).trim().slice(0, 200) : null;

    // ── Build WHERE conditions ────────────────────────────────────────────────
    const conditions = [eq(jobTodos.companyId, companyId)];

    if (rawCursor !== null) {
      conditions.push(lt(jobTodos.id, rawCursor));
    }

    if (rawJobId !== null) {
      // Verify job belongs to this company before filtering
      const job = await db.query.jobs.findFirst({
        where: and(eq(jobs.id, rawJobId), eq(jobs.companyId, companyId)),
      });
      if (!job) return res.status(404).json({ error: 'Job not found' });
      conditions.push(eq(jobTodos.jobId, rawJobId));
    }

    if (assignedUserId) {
      conditions.push(eq(jobTodos.assignedUserId, assignedUserId));
    }

    if (statusFilter === 'overdue') {
      const today = new Date().toISOString().slice(0, 10);
      conditions.push(
        and(
          inArray(jobTodos.status, ['Open', 'In Progress']),
          sql`${jobTodos.dueDate} IS NOT NULL AND ${jobTodos.dueDate} < ${today}`
        )!
      );
    } else if (statusFilter && ['Open', 'In Progress', 'Completed', 'Cancelled'].includes(statusFilter)) {
      conditions.push(eq(jobTodos.status, statusFilter));
    }

    if (q) {
      conditions.push(like(jobTodos.title, `%${q}%`));
    }

    // ── Query tasks with job name ─────────────────────────────────────────────
    const rows = await db
      .select({
        id: jobTodos.id,
        jobId: jobTodos.jobId,
        companyId: jobTodos.companyId,
        title: jobTodos.title,
        description: jobTodos.description,
        startDate: jobTodos.startDate,
        dueDate: jobTodos.dueDate,
        status: jobTodos.status,
        assignedUserId: jobTodos.assignedUserId,
        assignedName: jobTodos.assignedName,
        notes: jobTodos.notes,
        createdAt: jobTodos.createdAt,
        updatedAt: jobTodos.updatedAt,
        jobName: jobs.name,
        jobNumber: jobs.jobNumber,
      })
      .from(jobTodos)
      .leftJoin(jobs, eq(jobTodos.jobId, jobs.id))
      .where(and(...conditions))
      .orderBy(desc(jobTodos.id))
      .limit(limit + 1); // fetch one extra to determine if there's a next page

    const hasMore = rows.length > limit;
    const tasks = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? String(tasks[tasks.length - 1].id) : null;

    // Allowlisted response fields — no internal tokens
    const safe = tasks.map((t) => ({
      id: t.id,
      jobId: t.jobId,
      jobName: t.jobName ?? null,
      jobNumber: t.jobNumber ?? null,
      title: t.title,
      description: t.description,
      startDate: t.startDate,
      dueDate: t.dueDate,
      status: t.status,
      assignedUserId: t.assignedUserId,
      assignedName: t.assignedName,
      notes: t.notes,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));

    return res.json({ tasks: safe, nextCursor, hasMore });
  } catch (err) {
    console.error('[GET /api/work/tasks]', err);
    return res.status(500).json({ error: 'Failed to load tasks' });
  }
}
