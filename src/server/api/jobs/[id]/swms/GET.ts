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
    if (!profile?.companyId) return res.json({ jobSwms: [] });

    const jobId = parseInt(req.params.id, 10);
    const [rows] = await db.execute(sql`
      SELECT js.*, st.title as swms_title, st.work_activity, st.status as template_status
      FROM job_swms js
      JOIN swms_templates st ON st.id = js.swms_template_id
      WHERE js.job_id = ${jobId} AND js.company_id = ${profile.companyId}
      ORDER BY js.created_at DESC
    `) as unknown as [Array<Record<string, unknown>>, unknown];

    // Get signoffs for each job_swms
    const jobSwmsIds = (rows ?? []).map((r) => r.id as number);
    let signoffs: Array<Record<string, unknown>> = [];
    if (jobSwmsIds.length > 0) {
      const [sigRows] = await db.execute(sql`
        SELECT * FROM swms_signoffs WHERE job_swms_id IN (${sql.raw(jobSwmsIds.join(','))})
        ORDER BY signed_at DESC
      `) as unknown as [Array<Record<string, unknown>>, unknown];
      signoffs = sigRows ?? [];
    }

    const result = (rows ?? []).map((js) => ({
      ...js,
      signoffs: signoffs.filter((s) => s.job_swms_id === js.id),
    }));

    res.json({ jobSwms: result });
  } catch (err) {
    console.error('GET /api/jobs/:id/swms error:', err);
    res.status(500).json({ error: 'Failed to fetch job SWMS' });
  }
}
