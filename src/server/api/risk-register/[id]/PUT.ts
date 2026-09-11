/**
 * PUT /api/risk-register/:id
 * Updates a risk register entry (company-scoped).
 * Accepts any subset of fields — only provided fields are updated.
 *
 * Assignment:
 *   - If assigned_user_id is provided, validated against active same-company users.
 *   - Creates or updates the linked job_todos task via hazardTaskService.
 *   - Reassignment updates the existing task — no duplicates.
 *
 * Status sync:
 *   - Closing the hazard (status → 'closed') completes the linked task.
 *   - Reopening the hazard (status → 'open'/'in_progress') reopens the linked task.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { profiles } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import {
  validateCompanyUser,
  ensureHazardTask,
  completeLinkedTask,
  reopenLinkedTask,
} from '../../../lib/hazardTaskService.js';

const ALLOWED_FIELDS = [
  'job_id', 'title', 'description', 'category', 'hazard_source',
  'who_is_at_risk', 'existing_controls', 'likelihood', 'consequence',
  'risk_level', 'additional_controls', 'responsible_person',
  'due_date', 'identified_date', 'status', 'review_date', 'notes',
  'closed_at', 'closed_by',
] as const;

type AllowedField = typeof ALLOWED_FIELDS[number];

function escStr(v: unknown): string {
  return `'${String(v).replace(/'/g, "''")}'`;
}

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

    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

    const body = req.body as Record<string, unknown>;

    // Fetch current hazard (need task_id and title for sync)
    const [currentRows] = await db.execute(sql.raw(
      `SELECT id, title, status, task_id FROM risk_register
       WHERE id = ${id} AND company_id = ${profile.companyId} LIMIT 1`
    )) as unknown as [Array<{ id: number; title: string; status: string; task_id: number | null }>];
    if (!currentRows?.length) return res.status(404).json({ error: 'Not found' });

    const current = currentRows[0];

    // Validate assignee if provided
    let assignee = null;
    if ('assigned_user_id' in body && body.assigned_user_id) {
      assignee = await validateCompanyUser(String(body.assigned_user_id), profile.companyId);
      if (!assignee) {
        return res.status(400).json({ error: 'assigned_user_id is not a valid active member of your company' });
      }
    }

    // Build SET clauses for allowed scalar fields
    const setClauses: string[] = [];
    for (const field of ALLOWED_FIELDS) {
      if (!(field in body)) continue;
      const val = body[field as AllowedField];
      if (val === null || val === undefined || val === '') {
        if (['job_id', 'description', 'category', 'hazard_source', 'who_is_at_risk',
             'existing_controls', 'additional_controls', 'responsible_person',
             'due_date', 'review_date', 'notes', 'closed_at', 'closed_by'].includes(field)) {
          setClauses.push(`\`${field}\` = NULL`);
        }
      } else if (field === 'job_id') {
        setClauses.push(`\`job_id\` = ${parseInt(String(val), 10)}`);
      } else {
        setClauses.push(`\`${field}\` = ${escStr(val)}`);
      }
    }

    if (setClauses.length === 0 && !assignee) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    if (setClauses.length > 0) {
      setClauses.push('`updated_at` = NOW()');
      await db.execute(sql.raw(
        `UPDATE risk_register SET ${setClauses.join(', ')} WHERE id = ${id} AND company_id = ${profile.companyId}`
      ));
    }

    // Handle assignment — create or update linked task
    if (assignee) {
      const newTitle = body.title ? String(body.title) : current.title;
      const newDueDate = 'due_date' in body ? (body.due_date ? String(body.due_date) : null) : null;
      try {
        await ensureHazardTask({
          hazardId: id,
          hazardTitle: newTitle,
          companyId: profile.companyId,
          assignee,
          dueDate: newDueDate,
          existingTaskId: current.task_id ?? null,
        });
      } catch (taskErr) {
        console.warn('[PUT /api/risk-register/:id] task sync failed (non-fatal):', taskErr);
      }
    }

    // Bidirectional status sync
    const newStatus = 'status' in body ? String(body.status) : current.status;
    const prevStatus = current.status;

    // Re-fetch task_id (may have just been set by ensureHazardTask)
    const [refreshed] = await db.execute(sql.raw(
      `SELECT task_id FROM risk_register WHERE id = ${id} AND company_id = ${profile.companyId} LIMIT 1`
    )) as unknown as [Array<{ task_id: number | null }>];
    const taskId = refreshed?.[0]?.task_id ?? null;

    if (taskId) {
      if (newStatus === 'closed' && prevStatus !== 'closed') {
        try { await completeLinkedTask(taskId, profile.companyId); } catch { /* non-fatal */ }
      } else if (newStatus !== 'closed' && prevStatus === 'closed') {
        try { await reopenLinkedTask(taskId, profile.companyId); } catch { /* non-fatal */ }
      }
    }

    // Return full row with linked task info
    const [rows] = await db.execute(sql.raw(`
      SELECT r.*,
             j.job_number, j.name AS job_name,
             t.status AS task_status,
             t.assigned_user_id AS task_assigned_user_id,
             t.assigned_name AS task_assigned_name,
             t.due_date AS task_due_date
      FROM risk_register r
      LEFT JOIN jobs j ON j.id = r.job_id
      LEFT JOIN job_todos t ON t.id = r.task_id AND t.company_id = ${profile.companyId}
      WHERE r.id = ${id} AND r.company_id = ${profile.companyId}
      LIMIT 1
    `)) as unknown as [Array<Record<string, unknown>>, unknown];

    if (!rows?.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('PUT /api/risk-register/:id error:', err);
    res.status(500).json({ error: 'Failed to update risk entry' });
  }
}
