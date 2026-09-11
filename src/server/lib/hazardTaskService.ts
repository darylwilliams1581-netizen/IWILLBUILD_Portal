import { and, eq, ne, sql } from 'drizzle-orm';

import { db } from '../db/client.js';
import { jobTodos, profiles, user } from '../db/schema.js';

export interface CompanyUser {
  userId: string;
  name: string;
}

export interface LinkedHazardTask {
  id: number;
  status: string;
  assignedUserId: string | null;
  assignedName: string | null;
  dueDate: string | null;
  title: string;
}

export async function validateCompanyUser(companyId: number, userId: string): Promise<CompanyUser | null> {
  const [member] = await db
    .select({ userId: profiles.userId, name: user.name })
    .from(profiles)
    .innerJoin(user, eq(user.id, profiles.userId))
    .where(and(
      eq(profiles.companyId, companyId),
      eq(profiles.userId, userId),
      ne(profiles.status, 'inactive'),
    ))
    .limit(1);

  return member ? { userId: member.userId, name: member.name ?? 'Unknown' } : null;
}

export async function fetchLinkedTask(companyId: number, hazardId: number): Promise<LinkedHazardTask | null> {
  const [rows] = await db.execute(sql`
    SELECT t.id, t.status, t.assigned_user_id, t.assigned_name, t.due_date, t.title
    FROM risk_register r
    INNER JOIN job_todos t ON t.id = r.task_id AND t.company_id = r.company_id
    WHERE r.id = ${hazardId} AND r.company_id = ${companyId}
    LIMIT 1
  `) as unknown as [Array<Record<string, unknown>>, unknown];
  const row = rows?.[0];
  if (!row) return null;
  return {
    id: Number(row.id),
    status: String(row.status ?? 'Open'),
    assignedUserId: row.assigned_user_id ? String(row.assigned_user_id) : null,
    assignedName: row.assigned_name ? String(row.assigned_name) : null,
    dueDate: row.due_date ? String(row.due_date) : null,
    title: String(row.title ?? ''),
  };
}

export async function syncHazardTask(args: {
  companyId: number;
  hazardId: number;
  assignedUserId?: string | null;
  assignmentProvided: boolean;
}): Promise<LinkedHazardTask | null> {
  const { companyId, hazardId, assignmentProvided } = args;
  const [hazards] = await db.execute(sql`
    SELECT id, task_id, title, description, due_date
    FROM risk_register
    WHERE id = ${hazardId} AND company_id = ${companyId}
    LIMIT 1
  `) as unknown as [Array<Record<string, unknown>>, unknown];
  const hazard = hazards?.[0];
  if (!hazard) throw Object.assign(new Error('Hazard not found'), { status: 404 });

  const taskId = hazard.task_id ? Number(hazard.task_id) : null;
  let assignedUserId: string | null | undefined = args.assignedUserId;
  let assignedName: string | null | undefined;

  if (assignmentProvided && assignedUserId) {
    const member = await validateCompanyUser(companyId, assignedUserId);
    if (!member) throw Object.assign(new Error('Assigned user is not an active member of this company'), { status: 400 });
    assignedUserId = member.userId;
    assignedName = member.name;
  } else if (assignmentProvided) {
    assignedUserId = null;
    assignedName = null;
  }

  const title = `Hazard: ${String(hazard.title ?? '').trim()}`.slice(0, 255);
  const description = [String(hazard.description ?? '').trim(), 'Open the Hazard Register: /risk-register']
    .filter(Boolean)
    .join('\n\n');
  const dueDate = hazard.due_date ? String(hazard.due_date).slice(0, 10) : null;

  if (taskId) {
    const update: Record<string, unknown> = { title, description: description || null, dueDate };
    if (assignmentProvided) {
      update.assignedUserId = assignedUserId ?? null;
      update.assignedName = assignedName ?? null;
    }
    await db.update(jobTodos).set(update).where(and(eq(jobTodos.id, taskId), eq(jobTodos.companyId, companyId)));
    return fetchLinkedTask(companyId, hazardId);
  }

  if (!assignmentProvided || !assignedUserId) return null;

  const [created] = await db.insert(jobTodos).values({
    jobId: null as unknown as number,
    companyId,
    title,
    description: description || null,
    dueDate,
    status: 'Open',
    assignedUserId,
    assignedName: assignedName ?? null,
  });
  const newTaskId = Number(created.insertId);
  await db.execute(sql`
    UPDATE risk_register SET task_id = ${newTaskId}, updated_at = NOW()
    WHERE id = ${hazardId} AND company_id = ${companyId} AND task_id IS NULL
  `);
  return fetchLinkedTask(companyId, hazardId);
}

export async function completeLinkedTask(companyId: number, hazardId: number): Promise<void> {
  await db.execute(sql`
    UPDATE job_todos t
    INNER JOIN risk_register r ON r.task_id = t.id AND r.company_id = t.company_id
    SET t.status = 'Completed', t.updated_at = NOW()
    WHERE r.id = ${hazardId} AND r.company_id = ${companyId} AND t.status <> 'Completed'
  `);
}

export async function reopenLinkedTask(companyId: number, hazardId: number): Promise<void> {
  await db.execute(sql`
    UPDATE job_todos t
    INNER JOIN risk_register r ON r.task_id = t.id AND r.company_id = t.company_id
    SET t.status = 'Open', t.updated_at = NOW()
    WHERE r.id = ${hazardId} AND r.company_id = ${companyId}
      AND t.status IN ('Completed', 'Cancelled')
  `);
}

export async function closeLinkedHazard(companyId: number, taskId: number, closedBy: string): Promise<void> {
  await db.execute(sql`
    UPDATE risk_register
    SET status = 'closed', closed_at = COALESCE(closed_at, NOW()),
        closed_by = COALESCE(closed_by, ${closedBy}), updated_at = NOW()
    WHERE task_id = ${taskId} AND company_id = ${companyId} AND status <> 'closed'
  `);
}
