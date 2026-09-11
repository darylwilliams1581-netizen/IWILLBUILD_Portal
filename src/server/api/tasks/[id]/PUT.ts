/**
 * PUT /api/tasks/:id
 *
 * Update any task (job-linked or general).
 * Company-scoped — caller must own the task.
 * If assignedUserId is provided it must be an active member of the caller's company.
 * If status is set to 'Completed', any linked hazard is closed (idempotent).
 *
 * Body: { title?, description?, startDate?, dueDate?, status?,
 *          notes?, assignedUserId?, assignedName?, jobId? }
 *
 * Response: { task }
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { jobTodos, jobs, profiles } from '../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { sql } from 'drizzle-orm';
import { validateCompanyUser, closeLinkedHazard } from '../../../lib/hazardTaskService.js';

const VALID_STATUSES = new Set(['Open', 'In Progress', 'Completed', 'Cancelled']);

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

    const taskId = parseInt(String(req.params.id), 10);
    if (isNaN(taskId)) return res.status(400).json({ error: 'Invalid task ID' });

    const existing = await db.query.jobTodos.findFirst({
      where: and(eq(jobTodos.id, taskId), eq(jobTodos.companyId, profile.companyId)),
    });
    if (!existing) return res.status(404).json({ error: 'Task not found' });

    const {
      title,
      description,
      startDate,
      dueDate,
      status,
      notes,
      assignedUserId,
      assignedName,
      jobId: rawJobId,
    } = req.body as {
      title?: string;
      description?: string;
      startDate?: string | null;
      dueDate?: string | null;
      status?: string;
      notes?: string | null;
      assignedUserId?: string | null;
      assignedName?: string | null;
      jobId?: number | string | null;
    };

    if (status !== undefined && !VALID_STATUSES.has(status)) {
      return res.status(400).json({ error: `Invalid status` });
    }

    // Validate assignedUserId: must be an active member of the caller's company
    let resolvedAssignedUserId: string | null | undefined = undefined;
    let resolvedAssignedName: string | null | undefined = undefined;
    if (assignedUserId !== undefined) {
      const uid = assignedUserId?.trim() || null;
      if (uid) {
        const validated = await validateCompanyUser(uid, profile.companyId);
        if (!validated) {
          return res.status(400).json({ error: 'assignedUserId is not a valid active member of your company' });
        }
        resolvedAssignedUserId = validated.userId;
        resolvedAssignedName = assignedName?.trim() || validated.name;
      } else {
        resolvedAssignedUserId = null;
        resolvedAssignedName = null;
      }
    }

    const update: Record<string, unknown> = {};
    if (title !== undefined)          update.title          = title.trim();
    if (description !== undefined)    update.description    = description?.trim() || null;
    if (startDate !== undefined)      update.startDate      = startDate?.trim() || null;
    if (dueDate !== undefined)        update.dueDate        = dueDate?.trim() || null;
    if (status !== undefined)         update.status         = status;
    if (notes !== undefined)          update.notes          = notes?.trim() || null;
    if (resolvedAssignedUserId !== undefined) update.assignedUserId = resolvedAssignedUserId;
    if (resolvedAssignedName !== undefined)   update.assignedName   = resolvedAssignedName;

    // Handle jobId change (including clearing it)
    if ('jobId' in req.body) {
      if (rawJobId == null || rawJobId === '' || rawJobId === 0) {
        update.jobId = null;
      } else {
        const jid = parseInt(String(rawJobId), 10);
        if (!isNaN(jid)) {
          const job = await db.query.jobs.findFirst({
            where: and(eq(jobs.id, jid), eq(jobs.companyId, profile.companyId)),
          });
          if (!job) return res.status(404).json({ error: 'Job not found' });
          update.jobId = jid;
        }
      }
    }

    if (Object.keys(update).length > 0) {
      await db.update(jobTodos).set(update).where(eq(jobTodos.id, taskId));
    }

    // Bidirectional sync: completing a task closes its linked hazard (idempotent)
    if (status === 'Completed') {
      try {
        await closeLinkedHazard(taskId, profile.companyId);
      } catch (syncErr) {
        console.warn('[PUT /api/tasks/:id] closeLinkedHazard failed (non-fatal):', syncErr);
      }
    }

    // Fetch updated task with job info
    const [rows] = await db.execute(sql`
      SELECT t.*,
             j.name       AS job_name,
             j.job_number AS job_number
      FROM job_todos t
      LEFT JOIN jobs j ON j.id = t.job_id
      WHERE t.id = ${taskId}
    `) as unknown as [Array<Record<string, unknown>>, unknown];

    const row = rows?.[0];
    if (!row) return res.status(404).json({ error: 'Task not found after update' });

    return res.json({
      task: {
        id:             row.id,
        jobId:          row.job_id ?? null,
        jobName:        row.job_name ?? null,
        jobNumber:      row.job_number ?? null,
        title:          row.title,
        description:    row.description ?? null,
        startDate:      row.start_date ?? null,
        dueDate:        row.due_date ?? null,
        status:         row.status,
        assignedUserId: row.assigned_user_id ?? null,
        assignedName:   row.assigned_name ?? null,
        notes:          row.notes ?? null,
        createdAt:      row.created_at ?? null,
      },
    });
  } catch (err) {
    console.error('PUT /api/tasks/:id error:', err);
    return res.status(500).json({ error: 'Failed to update task' });
  }
}
