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
    if (isNaN(jobId)) return res.status(400).json({ error: 'Invalid job ID' });

    const job = await db.query.jobs.findFirst({
      where: eq(jobs.id, jobId),
    });

    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.companyId !== profile.companyId) return res.status(403).json({ error: 'Forbidden' });

    // Fetch asset_id via raw SQL (added via colsToEnsure, not in Drizzle schema)
    const [rawRows] = await db.execute(
      sql`SELECT asset_id, customer_id FROM jobs WHERE id = ${jobId}`
    ) as unknown as [Array<{ asset_id: number | null; customer_id: number | null }>, unknown];
    const extra = rawRows[0] ?? {};

    res.json({ job: { ...job, assetId: extra.asset_id ?? null, customerId: extra.customer_id ?? null } });
  } catch (error) {
    console.error('GET /api/jobs/:id error:', error);
    res.status(500).json({ error: 'Failed to fetch job' });
  }
}
