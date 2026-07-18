import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { jobs, profiles } from '../../../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
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

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const jobId = parseInt(String(req.params.id), 10);
    const milestoneId = parseInt(String(req.params.milestoneId), 10);
    if (isNaN(jobId) || isNaN(milestoneId)) return res.status(400).json({ error: 'Invalid ID' });

    const job = await db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.companyId, profile.companyId)),
    });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    await db.execute(sql`
      DELETE FROM job_milestones
      WHERE id = ${milestoneId} AND job_id = ${jobId} AND company_id = ${profile.companyId}
    `);

    return res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/jobs/:id/milestones/:milestoneId error:', err);
    return res.status(500).json({ error: 'Failed to delete milestone' });
  }
}
