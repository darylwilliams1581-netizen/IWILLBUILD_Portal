/**
 * GET /api/scheduler/crew
 * Returns team members with their assigned jobs for the crew availability view.
 * Each member row includes: id, name, role, avatar, and their scheduled jobs.
 */
import type { Request, Response } from 'express';
import { getAuth } from '@/lib/auth/auth';
import { db } from '@/server/db/client';
import { sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const [profileRows] = await db.execute(
      sql`SELECT company_id FROM profiles WHERE user_id = ${session.user.id} LIMIT 1`
    ) as unknown as [Array<{ company_id: number }>];
    const companyId = profileRows?.[0]?.company_id;
    if (!companyId) return res.status(400).json({ error: 'No company' });

    // Get all team members for this company
    const [memberRows] = await db.execute(sql`
      SELECT
        p.user_id   AS id,
        u.name,
        p.role,
        p.trade
      FROM profiles p
      JOIN user u ON u.id = p.user_id
      WHERE p.company_id = ${companyId}
        AND p.role NOT IN ('owner')
      ORDER BY u.name ASC
    `) as unknown as [Array<{ id: string; name: string; role: string; trade?: string }>];

    // Get all scheduled jobs for this company
    const [jobRows] = await db.execute(sql`
      SELECT
        j.id,
        j.job_number                  AS jobNumber,
        j.name,
        j.client,
        j.status,
        j.scheduled_start_date        AS scheduledStartDate,
        j.expected_completion_date    AS expectedCompletionDate,
        j.assigned_supervisor_user_id AS supervisorUserId,
        j.assigned_team_label         AS teamLabel
      FROM jobs j
      WHERE j.company_id = ${companyId}
        AND j.scheduled_start_date IS NOT NULL
        AND j.expected_completion_date IS NOT NULL
        AND j.status NOT IN ('Completed', 'Closed')
      ORDER BY j.scheduled_start_date ASC
    `) as unknown as [Array<Record<string, unknown>>];

    const jobs = (jobRows ?? []).map((r) => ({
      id:                   Number(r.id),
      jobNumber:            r.jobNumber as string | null,
      name:                 String(r.name ?? ''),
      client:               r.client as string | null,
      status:               String(r.status ?? ''),
      scheduledStartDate:   r.scheduledStartDate as string | null,
      expectedCompletionDate: r.expectedCompletionDate as string | null,
      supervisorUserId:     r.supervisorUserId as string | null,
      teamLabel:            r.teamLabel as string | null,
    }));

    // Map members with their jobs
    const members = (memberRows ?? []).map((m) => ({
      id:    m.id,
      name:  m.name,
      role:  m.role,
      trade: m.trade ?? null,
      jobs:  jobs.filter((j) => j.supervisorUserId === m.id),
    }));

    // Also include an "Unassigned" row for jobs with no supervisor
    const unassignedJobs = jobs.filter((j) => !j.supervisorUserId);

    res.json({ members, unassignedJobs });
  } catch (err) {
    console.error('GET /api/scheduler/crew error:', err);
    res.status(500).json({ error: 'Failed to load crew data' });
  }
}
