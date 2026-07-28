/**
 * PATCH /api/tag-tasks/:id
 * Complete, reopen, or update a tag task.
 * Allowed:
 *   - assignee can complete/reopen their own task
 *   - admin/owner/supervisor can complete/reopen any task
 */
import type { Request, Response } from 'express';
import { getAuth } from '@/lib/auth/auth.js';
import { db } from '../../../db/client.js';
import { profiles, user } from '../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';

const ADMIN_ROLES = new Set(['admin', 'owner', 'supervisor']);

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v ?? '']));
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const authorUser = await db.query.user.findFirst({ where: eq(user.id, session.user.id) });
    const actorName = authorUser?.name ?? session.user.email ?? 'Unknown';

    const taskId = Number(req.params.id);
    if (!taskId) return res.status(400).json({ error: 'Invalid task id' });

    const [taskRows] = await db.execute(sql.raw(
      `SELECT * FROM note_tag_tasks WHERE id=${taskId} AND company_id=${profile.companyId} LIMIT 1`
    )) as unknown as [Record<string, unknown>[], unknown];

    const task = Array.isArray(taskRows) ? taskRows[0] : null;
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const isAssignee = task.assignee_user_id === session.user.id;
    const isAdmin = ADMIN_ROLES.has(profile.role ?? '');
    if (!isAssignee && !isAdmin) return res.status(403).json({ error: 'Not authorised to update this task' });

    const { action, dueDate } = req.body as { action?: 'complete' | 'reopen'; dueDate?: string };

    const actorIdEsc = session.user.id.replace(/'/g, "''");
    const actorNameEsc = actorName.replace(/'/g, "''");

    if (action === 'complete') {
      await db.execute(sql.raw(
        `UPDATE note_tag_tasks SET status='completed', completed_at=NOW(),
         completed_by_user_id='${actorIdEsc}', completed_by_name='${actorNameEsc}' WHERE id=${taskId}`
      ));
    } else if (action === 'reopen') {
      await db.execute(sql.raw(
        `UPDATE note_tag_tasks SET status='open', completed_at=NULL,
         completed_by_user_id=NULL, completed_by_name=NULL WHERE id=${taskId}`
      ));
    } else if (dueDate !== undefined) {
      const dueDateVal = dueDate ? `'${dueDate.replace(/'/g, "''")}'` : 'NULL';
      await db.execute(sql.raw(
        `UPDATE note_tag_tasks SET due_date=${dueDateVal} WHERE id=${taskId}`
      ));
    } else {
      return res.status(400).json({ error: 'Provide action (complete|reopen) or dueDate' });
    }

    const [updatedRows] = await db.execute(sql.raw(
      `SELECT * FROM note_tag_tasks WHERE id=${taskId} LIMIT 1`
    )) as unknown as [Record<string, unknown>[], unknown];

    const updated = Array.isArray(updatedRows) ? updatedRows[0] : null;
    if (!updated) return res.status(404).json({ error: 'Task not found after update' });

    res.json({
      task: {
        id: updated.id, noteId: updated.note_id, entityType: updated.entity_type,
        entityId: updated.entity_id, entityLabel: updated.entity_label,
        noteType: updated.note_type, noteBody: updated.note_body,
        createdByUserId: updated.created_by_user_id, createdByName: updated.created_by_name,
        assigneeUserId: updated.assignee_user_id, assigneeName: updated.assignee_name,
        status: updated.status, dueDate: updated.due_date,
        completedAt: updated.completed_at, completedByUserId: updated.completed_by_user_id,
        completedByName: updated.completed_by_name, createdAt: updated.created_at,
      },
    });
  } catch (err) {
    console.error('[PATCH /api/tag-tasks/:id]', err);
    res.status(500).json({ error: 'Failed to update task' });
  }
}
