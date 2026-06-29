/**
 * GET /api/safety/job-swms?jobId=&status=
 * Returns all job-specific SWMS for the company, optionally filtered by job.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { profiles } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';

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
    if (!profile?.companyId) return res.json({ jobSwms: [] });

    const jobId = req.query.jobId ? Number(req.query.jobId) : null;
    const statusFilter = req.query.status as string | undefined;

    let query = sql`
      SELECT js.*,
             j.name as job_name, j.job_number,
             j.client_name, j.site_address as job_site_address,
             j.start_date, j.supervisor
      FROM job_swms js
      LEFT JOIN jobs j ON j.id = js.job_id AND j.company_id = js.company_id
      WHERE js.company_id = ${profile.companyId}
    `;

    if (jobId) {
      query = sql`${query} AND js.job_id = ${jobId}`;
    }
    if (statusFilter && statusFilter !== 'all') {
      query = sql`${query} AND js.status = ${statusFilter}`;
    }

    query = sql`${query} ORDER BY js.updated_at DESC`;

    const [rows] = await db.execute(query) as unknown as [Array<Record<string, unknown>>, unknown];
    res.json({ jobSwms: rows ?? [] });
  } catch (err) {
    console.error('GET /api/safety/job-swms error:', err);
    res.status(500).json({ error: 'Failed to fetch job SWMS' });
  }
}
