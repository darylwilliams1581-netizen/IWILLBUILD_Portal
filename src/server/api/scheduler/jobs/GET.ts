/**
 * GET /api/scheduler/jobs
 *
 * Returns all jobs for the company. The scheduler reads ONLY the job record
 * fields — no estimates, no derived dates. The five scheduling fields are:
 *   scheduled_start_date, expected_completion_date,
 *   actual_start_date, actual_completion_date,
 *   assigned_supervisor_user_id, assigned_team_label, status
 */
import type { Request, Response } from 'express';
import { getAuth } from '@/lib/auth/auth';
import { db } from '@/server/db/client';
import { sql } from 'drizzle-orm';
import { resolveEffectiveCompany } from '@/server/lib/dazza-context';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const { companyId } = await resolveEffectiveCompany(req, session.user.id);
    if (!companyId) return res.status(400).json({ error: 'No company' });

    const [rows] = await db.execute(sql`
      SELECT
        j.id,
        j.job_number                  AS jobNumber,
        j.name,
        j.client,
        j.address,
        j.status,
        COALESCE(j.progress, 0)       AS progress,
        j.scheduled_start_date        AS scheduledStartDate,
        j.expected_completion_date    AS expectedCompletionDate,
        j.actual_start_date           AS actualStartDate,
        j.actual_completion_date      AS actualCompletionDate,
        j.assigned_supervisor_user_id AS supervisorUserId,
        j.assigned_team_label         AS teamLabel,
        j.created_at                  AS createdAt,
        u.name                        AS supervisorName
      FROM jobs j
      LEFT JOIN user u ON u.id = j.assigned_supervisor_user_id
      WHERE j.company_id = ${companyId}
      ORDER BY
        CASE WHEN j.scheduled_start_date IS NULL THEN 1 ELSE 0 END,
        j.scheduled_start_date ASC,
        j.id DESC
    `) as unknown as [Array<Record<string, unknown>>];

    const jobs = (rows ?? []).map((row) => ({
      id:                     row.id,
      jobNumber:              row.jobNumber ?? null,
      name:                   row.name ?? 'Unnamed Job',
      client:                 row.client ?? null,
      address:                row.address ?? null,
      status:                 row.status ?? 'New',
      progress:               Number(row.progress ?? 0),
      scheduledStartDate:     row.scheduledStartDate     ? String(row.scheduledStartDate).slice(0, 10)     : null,
      expectedCompletionDate: row.expectedCompletionDate ? String(row.expectedCompletionDate).slice(0, 10) : null,
      actualStartDate:        row.actualStartDate        ? String(row.actualStartDate).slice(0, 10)        : null,
      actualCompletionDate:   row.actualCompletionDate   ? String(row.actualCompletionDate).slice(0, 10)   : null,
      supervisorUserId:       row.supervisorUserId ?? null,
      supervisorName:         row.supervisorName  ?? null,
      teamLabel:              row.teamLabel        ?? null,
      createdAt:              row.createdAt        ?? null,
    }));

    return res.json({ jobs });
  } catch (e) {
    console.error('GET /api/scheduler/jobs error:', e);
    return res.status(500).json({ error: 'Failed to load scheduler jobs' });
  }
}
