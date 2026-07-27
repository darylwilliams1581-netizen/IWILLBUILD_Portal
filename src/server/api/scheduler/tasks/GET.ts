/**
 * GET /api/scheduler/tasks
 *
 * Returns all non-cancelled job tasks for the caller's company,
 * joined with job name and job number. Used by the Scheduler Tasks view.
 *
 * Response: { tasks: SchedulerTask[] }
 *
 * SchedulerTask shape:
 *   id, jobId, jobName, jobNumber,
 *   title, description,
 *   startDate, dueDate,
 *   status, assignedUserId, assignedName,
 *   notes, createdAt
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { jobTodos, jobs, profiles } from '../../../db/schema.js';
import { eq, and, ne, asc } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';

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

    const rows = await db
      .select({
        id:             jobTodos.id,
        jobId:          jobTodos.jobId,
        jobName:        jobs.name,
        jobNumber:      jobs.jobNumber,
        title:          jobTodos.title,
        description:    jobTodos.description,
        startDate:      jobTodos.startDate,
        dueDate:        jobTodos.dueDate,
        status:         jobTodos.status,
        assignedUserId: jobTodos.assignedUserId,
        assignedName:   jobTodos.assignedName,
        notes:          jobTodos.notes,
        createdAt:      jobTodos.createdAt,
      })
      .from(jobTodos)
      .innerJoin(jobs, eq(jobTodos.jobId, jobs.id))
      .where(
        and(
          eq(jobTodos.companyId, profile.companyId),
          ne(jobTodos.status, 'Cancelled'),
        )
      )
      .orderBy(asc(jobTodos.dueDate), asc(jobTodos.startDate), asc(jobTodos.id));

    return res.json({ tasks: rows });
  } catch (err) {
    console.error('GET /api/scheduler/tasks error:', err);
    return res.status(500).json({ error: 'Failed to load tasks' });
  }
}
