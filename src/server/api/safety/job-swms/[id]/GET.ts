/**
 * GET /api/safety/job-swms/:id
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { profiles } from '../../../../db/schema.js';
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
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const id = Number(req.params.id);
    const [rows] = await db.execute(sql`
      SELECT js.*,
             j.name as job_name, j.job_number, j.client_name,
             j.site_address as job_site_address, j.start_date, j.supervisor
      FROM job_swms js
      LEFT JOIN jobs j ON j.id = js.job_id AND j.company_id = js.company_id
      WHERE js.id = ${id} AND js.company_id = ${profile.companyId}
      LIMIT 1
    `) as unknown as [Array<Record<string, unknown>>, unknown];

    if (!rows?.length) return res.status(404).json({ error: 'Not found' });
    res.json({ jobSwms: rows[0] });
  } catch (err) {
    console.error('GET /api/safety/job-swms/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch job SWMS' });
  }
}
