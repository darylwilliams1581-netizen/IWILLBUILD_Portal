/**
 * PUT /api/risk-register/:id
 * Updates a risk register entry (company-scoped).
 * Accepts any subset of fields — only provided fields are updated.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { profiles } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { completeLinkedTask, reopenLinkedTask, syncHazardTask } from '../../../lib/hazardTaskService.js';

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
    const assignmentProvided = Object.prototype.hasOwnProperty.call(body, 'assigned_user_id');
    const setClauses: string[] = [];

    for (const field of ALLOWED_FIELDS) {
      if (!(field in body)) continue;
      const val = body[field as AllowedField];
      if (val === null || val === undefined || val === '') {
        // Allow explicit null for nullable fields
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

    if (setClauses.length === 0 && !assignmentProvided) return res.status(400).json({ error: 'No fields to update' });
    if (setClauses.length > 0) {
      setClauses.push('`updated_at` = NOW()');
      await db.execute(sql.raw(
        `UPDATE risk_register SET ${setClauses.join(', ')} WHERE id = ${id} AND company_id = ${profile.companyId}`
      ));
    }

    await syncHazardTask({
      companyId: profile.companyId,
      hazardId: id,
      assignedUserId: body.assigned_user_id ? String(body.assigned_user_id) : null,
      assignmentProvided,
    });

    if (body.status === 'closed') await completeLinkedTask(profile.companyId, id);
    if (body.status === 'open' || body.status === 'in_progress') await reopenLinkedTask(profile.companyId, id);

    const [rows] = await db.execute(sql`
      SELECT r.*, j.job_number, j.name AS job_name,
        t.id AS task_id, t.status AS task_status,
        t.assigned_user_id AS task_assigned_user_id,
        t.assigned_name AS task_assigned_name,
        t.due_date AS task_due_date, t.title AS task_title
      FROM risk_register r
      LEFT JOIN jobs j ON j.id = r.job_id
      LEFT JOIN job_todos t ON t.id = r.task_id AND t.company_id = r.company_id
      WHERE r.id = ${id} AND r.company_id = ${profile.companyId}
      LIMIT 1
    `) as unknown as [Array<Record<string, unknown>>, unknown];

    if (!rows?.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('PUT /api/risk-register/:id error:', err);
    const status = (err as { status?: number })?.status ?? 500;
    res.status(status).json({ error: status < 500 && err instanceof Error ? err.message : 'Failed to update risk entry' });
  }
}
