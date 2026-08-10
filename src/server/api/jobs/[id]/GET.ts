import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { jobs, profiles } from '../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, session.user.id),
    });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const jobId = parseInt(String(req.params.id), 10);
    // Guard: if the param is a named sub-route (e.g. "search", "report") that
    // somehow reached this handler, return 404 rather than "Invalid job ID".
    if (isNaN(jobId) || String(req.params.id) !== String(jobId)) {
      return res.status(404).json({ error: 'Not found' });
    }

    const job = await db.query.jobs.findFirst({
      where: eq(jobs.id, jobId),
    });

    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.companyId !== profile.companyId) return res.status(403).json({ error: 'Forbidden' });

    // Fetch extra columns via raw SQL (added via startup migration, not in Drizzle schema)
    const [rawRows] = await db.execute(
      sql`SELECT asset_id, customer_id, scheduled_start_time, scheduled_end_time FROM jobs WHERE id = ${jobId}`
    ) as unknown as [Array<{ asset_id: number | null; customer_id: number | null; scheduled_start_time: string | null; scheduled_end_time: string | null }>, unknown];
    const extra = rawRows[0] ?? {};

    res.json({ job: {
      ...job,
      assetId: extra.asset_id ?? null,
      customerId: extra.customer_id ?? null,
      scheduledStartTime: extra.scheduled_start_time ? String(extra.scheduled_start_time).slice(0, 5) : null,
      scheduledEndTime:   extra.scheduled_end_time   ? String(extra.scheduled_end_time).slice(0, 5)   : null,
    } });
  } catch (error) {
    console.error('GET /api/jobs/:id error:', error);
    res.status(500).json({ error: 'Failed to fetch job' });
  }
}
