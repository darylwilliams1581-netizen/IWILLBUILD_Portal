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

    const { title, description, due_date, status, sort_order } = req.body as Record<string, string | number>;

    await db.execute(sql`
      UPDATE job_milestones
      SET
        title       = COALESCE(${title ? String(title) : null}, title),
        description = ${description !== undefined ? (description ? String(description) : null) : sql`description`},
        due_date    = ${due_date !== undefined ? (due_date ? String(due_date) : null) : sql`due_date`},
        status      = COALESCE(${status ? String(status) : null}, status),
        sort_order  = COALESCE(${sort_order !== undefined ? Number(sort_order) : null}, sort_order),
        updated_at  = NOW()
      WHERE id = ${milestoneId} AND job_id = ${jobId} AND company_id = ${profile.companyId}
    `);

    return res.json({ ok: true });
  } catch (err) {
    console.error('PATCH /api/jobs/:id/milestones/:milestoneId error:', err);
    return res.status(500).json({ error: 'Failed to update milestone' });
  }
}
