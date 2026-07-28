/**
 * GET /api/scheduler/tasks
 *
 * Returns all non-cancelled tasks for the caller's company.
 * Tasks may be linked to a job (jobId set) or general (jobId null).
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
import { profiles } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
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

    // LEFT JOIN so tasks with no job_id are included
    const [rows] = await db.execute(sql`
      SELECT
        t.id,
        t.job_id          AS jobId,
        j.name            AS jobName,
        j.job_number      AS jobNumber,
        t.title,
        t.description,
        t.start_date      AS startDate,
        t.due_date        AS dueDate,
        t.status,
        t.assigned_user_id AS assignedUserId,
        t.assigned_name   AS assignedName,
        t.notes,
        t.created_at      AS createdAt
      FROM job_todos t
      LEFT JOIN jobs j ON j.id = t.job_id
      WHERE t.company_id = ${profile.companyId}
        AND t.status != 'Cancelled'
      ORDER BY
        t.due_date   ASC,
        t.start_date ASC,
        t.id         ASC
    `) as unknown as [Array<Record<string, unknown>>, unknown];

    return res.json({ tasks: rows ?? [] });
  } catch (err) {
    console.error('GET /api/scheduler/tasks error:', err);
    return res.status(500).json({ error: 'Failed to load tasks' });
  }
}
