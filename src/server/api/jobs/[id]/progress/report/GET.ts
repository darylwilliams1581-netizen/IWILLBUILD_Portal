import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { jobs, profiles } from '../../../../../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';

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

    // Correct destructuring: db.execute returns [rows, fields]
    const [rows] = await db.execute(sql`
      SELECT * FROM job_progress_reports
      WHERE company_id = ${profile.companyId} AND job_id = ${jobId}
      LIMIT 1
    `);
    const report = (rows as unknown as Record<string, unknown>[])[0] ?? null;

    return res.json({ report });
  } catch (err) {
    console.error('GET /api/jobs/:id/progress/report error:', err);
    return res.status(500).json({ error: 'Failed to fetch report' });
  }
}
