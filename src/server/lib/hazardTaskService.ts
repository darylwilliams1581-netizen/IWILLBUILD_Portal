/**
 * hazardTaskService.ts
 *
 * Shared service that keeps risk_register entries and job_todos tasks in sync.
 *
 * Design decisions:
 *   - Assignment is stored as a linked job_todos row (task_id on risk_register).
 *   - Reassignment updates the existing linked task — no duplicates.
 *   - Completing the task closes the hazard; closing the hazard completes the task.
 *   - Reopening the hazard reopens the task.
 *   - All operations are idempotent.
 *   - Archiving a hazard does NOT delete task history.
 *   - assignedUserId is always validated against active same-company users before use.
 */

import { db } from '../db/client.js';
import { sql } from 'drizzle-orm';
import { toMySQLDatetime } from './datetime.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ValidatedAssignee {
  userId: string;
  name: string;
}

export interface HazardTaskSyncResult {
  taskId: number;
  assignedUserId: string;
  assignedName: string;
}

// ── User validation ───────────────────────────────────────────────────────────

/**
 * Validate that a userId is an active member of the given company.
 * Returns the user's display name on success, or null if invalid.
 */
export async function validateCompanyUser(
  userId: string,
  companyId: number,
): Promise<ValidatedAssignee | null> {
  const uid = userId.trim();
  if (!uid) return null;

  const [rows] = await db.execute(sql.raw(
    `SELECT p.user_id, u.name
     FROM profiles p
     JOIN user u ON u.id = p.user_id
     WHERE p.user_id = '${uid.replace(/'/g, "''")}'
       AND p.company_id = ${companyId}
       AND (u.banned IS NULL OR u.banned = 0)
       AND (u.deleted_at IS NULL)
     LIMIT 1`
  )) as unknown as [Array<{ user_id: string; name: string }>];

  if (!rows?.length) return null;
  return { userId: rows[0].user_id, name: rows[0].name };
}

// ── Task create / update ──────────────────────────────────────────────────────

/**
 * Ensure a linked task exists for a hazard entry.
 *
 * - If the hazard already has a task_id, update that task.
 * - If not, create a new task with jobId = NULL.
 * - Returns the task id, assignedUserId and assignedName.
 */
export async function ensureHazardTask(opts: {
  hazardId: number;
  hazardTitle: string;
  companyId: number;
  assignee: ValidatedAssignee;
  dueDate?: string | null;
  existingTaskId?: number | null;
}): Promise<HazardTaskSyncResult> {
  const { hazardId, hazardTitle, companyId, assignee, dueDate, existingTaskId } = opts;

  const taskTitle = `Hazard: ${hazardTitle}`;
  const taskDescription = `Assigned via Hazard Register. View at /risk-register (Hazard #${hazardId}).`;
  const now = toMySQLDatetime(new Date());

  if (existingTaskId) {
    // Update the existing linked task
    await db.execute(sql.raw(
      `UPDATE job_todos
       SET title = '${taskTitle.replace(/'/g, "''")}',
           description = '${taskDescription.replace(/'/g, "''")}',
           assigned_user_id = '${assignee.userId.replace(/'/g, "''")}',
           assigned_name = '${assignee.name.replace(/'/g, "''")}',
           ${dueDate ? `due_date = '${String(dueDate)}',` : ''}
           updated_at = '${now}'
       WHERE id = ${existingTaskId} AND company_id = ${companyId}`
    ));
    return { taskId: existingTaskId, assignedUserId: assignee.userId, assignedName: assignee.name };
  }

  // Create a new task (jobId = NULL — hazard tasks are not job-linked)
  const [result] = await db.execute(sql.raw(
    `INSERT INTO job_todos
       (company_id, job_id, title, description, status,
        assigned_user_id, assigned_name, due_date, created_at, updated_at)
     VALUES
       (${companyId}, NULL,
        '${taskTitle.replace(/'/g, "''")}',
        '${taskDescription.replace(/'/g, "''")}',
        'Open',
        '${assignee.userId.replace(/'/g, "''")}',
        '${assignee.name.replace(/'/g, "''")}',
        ${dueDate ? `'${String(dueDate)}'` : 'NULL'},
        '${now}', '${now}')`
  )) as unknown as [{ insertId: number }];

  const taskId = (result as { insertId?: number })?.insertId;
  if (!taskId) throw new Error('Failed to create hazard task');

  // Link the task back to the hazard
  await db.execute(sql.raw(
    `UPDATE risk_register SET task_id = ${taskId}, updated_at = '${now}'
     WHERE id = ${hazardId} AND company_id = ${companyId}`
  ));

  return { taskId, assignedUserId: assignee.userId, assignedName: assignee.name };
}

// ── Status synchronisation ────────────────────────────────────────────────────

/**
 * When a hazard is closed, complete its linked task (if any).
 * Idempotent — no-op if task is already Completed.
 */
export async function completeLinkedTask(taskId: number, companyId: number): Promise<void> {
  await db.execute(sql.raw(
    `UPDATE job_todos
     SET status = 'Completed', updated_at = '${toMySQLDatetime(new Date())}'
     WHERE id = ${taskId} AND company_id = ${companyId} AND status != 'Completed'`
  ));
}

/**
 * When a task is completed, close its linked hazard (if any).
 * Idempotent — no-op if hazard is already closed.
 */
export async function closeLinkedHazard(taskId: number, companyId: number): Promise<void> {
  const now = toMySQLDatetime(new Date());
  await db.execute(sql.raw(
    `UPDATE risk_register
     SET status = 'closed', closed_at = '${now}', updated_at = '${now}'
     WHERE task_id = ${taskId} AND company_id = ${companyId} AND status != 'closed'`
  ));
}

/**
 * When a hazard is reopened, reopen its linked task (if any).
 * Idempotent — no-op if task is already Open or In Progress.
 */
export async function reopenLinkedTask(taskId: number, companyId: number): Promise<void> {
  await db.execute(sql.raw(
    `UPDATE job_todos
     SET status = 'Open', updated_at = '${toMySQLDatetime(new Date())}'
     WHERE id = ${taskId} AND company_id = ${companyId}
       AND status IN ('Completed', 'Cancelled')`
  ));
}

// ── Fetch linked task for display ─────────────────────────────────────────────

export interface LinkedTaskInfo {
  taskId: number;
  taskStatus: string;
  assignedUserId: string | null;
  assignedName: string | null;
  dueDate: string | null;
  title: string;
}

/**
 * Fetch the linked task row for display inside an authenticated hazard entry.
 * Returns null if no task is linked or the task doesn't belong to the company.
 */
export async function fetchLinkedTask(
  taskId: number,
  companyId: number,
): Promise<LinkedTaskInfo | null> {
  const [rows] = await db.execute(sql.raw(
    `SELECT id, title, status, assigned_user_id, assigned_name, due_date
     FROM job_todos
     WHERE id = ${taskId} AND company_id = ${companyId}
     LIMIT 1`
  )) as unknown as [Array<{
    id: number;
    title: string;
    status: string;
    assigned_user_id: string | null;
    assigned_name: string | null;
    due_date: string | null;
  }>];

  if (!rows?.length) return null;
  const r = rows[0];
  return {
    taskId: r.id,
    taskStatus: r.status,
    assignedUserId: r.assigned_user_id,
    assignedName: r.assigned_name,
    dueDate: r.due_date,
    title: r.title,
  };
}
