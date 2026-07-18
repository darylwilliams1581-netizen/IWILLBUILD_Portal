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
    if (isNaN(jobId)) return res.status(400).json({ error: 'Invalid job ID' });

    const job = await db.query.jobs.findFirst({ where: and(eq(jobs.id, jobId), eq(jobs.companyId, profile.companyId)) });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const { prepared_by, report_date, period_from, period_to, achievements, planned_next, outstanding_issues } = req.body as Record<string, string>;

    await db.execute(sql`
      INSERT INTO job_progress_reports
        (company_id, job_id, prepared_by, report_date, period_from, period_to, achievements, planned_next, outstanding_issues)
      VALUES
        (${profile.companyId}, ${jobId}, ${prepared_by ?? null}, ${report_date ?? null}, ${period_from ?? null}, ${period_to ?? null}, ${achievements ?? null}, ${planned_next ?? null}, ${outstanding_issues ?? null})
      ON DUPLICATE KEY UPDATE
        prepared_by = VALUES(prepared_by),
        report_date = VALUES(report_date),
        period_from = VALUES(period_from),
        period_to   = VALUES(period_to),
        achievements = VALUES(achievements),
        planned_next = VALUES(planned_next),
        outstanding_issues = VALUES(outstanding_issues),
        updated_at  = NOW()
    `);

    return res.json({ ok: true });
  } catch (err) {
    console.error('PUT /api/jobs/:id/progress/report error:', err);
    return res.status(500).json({ error: 'Failed to save report' });
  }
}
