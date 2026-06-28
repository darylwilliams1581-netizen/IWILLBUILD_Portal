/**
 * GET /api/jobs/:id/delays
 * Returns all delay entries for a job, scoped to the caller's company.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';

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

    const jobId = parseInt(String(req.params.id), 10);
    if (isNaN(jobId)) return res.status(400).json({ error: 'Invalid job ID' });

    // Verify job belongs to this company
    const [jobRows] = await db.execute(
      sql`SELECT id FROM jobs WHERE id = ${jobId} AND company_id = ${profile.companyId} LIMIT 1`
    ) as unknown as [Array<Record<string, unknown>>, unknown];
    if (!jobRows?.length) return res.status(404).json({ error: 'Job not found' });

    const [rows] = await db.execute(
      sql`SELECT id, company_id, job_id, reason, days, delay_date, notes,
                 created_by_user_id, created_by_name, created_at, updated_at
          FROM job_delays
          WHERE job_id = ${jobId} AND company_id = ${profile.companyId}
          ORDER BY delay_date DESC, created_at DESC`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    const delays = rows ?? [];
    const totalDays = delays.reduce((sum, d) => sum + parseFloat(String(d.days ?? 0)), 0);

    return res.json({ delays, totalDays: Math.round(totalDays * 100) / 100 });
  } catch (err) {
    console.error('GET /api/jobs/:id/delays error:', err);
    return res.status(500).json({ error: 'Failed to fetch delays' });
  }
}
