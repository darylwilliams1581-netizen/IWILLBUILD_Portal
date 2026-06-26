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

    // Fetch all jobs for this company, joining supervisor name if available
    const [rows] = await db.execute(sql`
      SELECT
        j.id,
        j.job_number      AS jobNumber,
        j.name,
        j.client,
        j.address,
        j.status,
        j.progress,
        j.start_date      AS startDate,
        j.finish_date     AS finishDate,
        j.supervisor_user_id AS supervisorUserId,
        j.crew_name       AS crewName,
        j.created_at      AS createdAt,
        u.name            AS supervisorName
      FROM jobs j
      LEFT JOIN user u ON u.id = j.supervisor_user_id
      WHERE j.company_id = ${companyId}
      ORDER BY
        CASE WHEN j.start_date IS NULL THEN 1 ELSE 0 END,
        j.start_date ASC,
        j.id DESC
    `) as unknown as [Array<Record<string, unknown>>];

    return res.json({ jobs: rows ?? [] });
  } catch (e) {
    console.error('GET /api/scheduler/jobs error:', e);
    return res.status(500).json({ error: 'Failed to load scheduler jobs' });
  }
}
