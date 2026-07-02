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

    const jobId = parseInt(String(req.params.id), 10);
    if (isNaN(jobId)) return res.status(400).json({ error: 'Invalid job ID' });

    // Verify job belongs to company
    const [jobRows] = await db.execute(
      sql`SELECT id FROM jobs WHERE id = ${jobId} AND company_id = ${profile.companyId}`
    ) as unknown as [Array<Record<string, unknown>>, unknown];
    if (!jobRows?.length) return res.status(404).json({ error: 'Job not found' });

    const [costs] = await db.execute(sql`
      SELECT jc.*, u.name AS uploaded_by_name
      FROM job_costs jc
      LEFT JOIN user u ON u.id = jc.user_id
      WHERE jc.job_id = ${jobId} AND jc.company_id = ${profile.companyId}
      ORDER BY jc.purchase_date DESC, jc.created_at DESC
    `) as unknown as [Array<Record<string, unknown>>, unknown];

    // Get approved estimate total.
    // The estimates table has no pre-computed total_amount column — the total
    // is derived by summing (quantity * rate) across estimate_lines, matching
    // the pattern used everywhere else in the codebase (dazza-context, annette-context).
    const [estRows] = await db.execute(sql`
      SELECT COALESCE(
        (
          SELECT SUM(
            CAST(el.quantity AS DECIMAL(15,4)) * CAST(el.rate AS DECIMAL(15,4))
          )
          FROM estimates e
          JOIN estimate_lines el ON el.estimate_id = e.id
          WHERE e.job_id = ${jobId}
            AND e.company_id = ${profile.companyId}
            AND LOWER(e.status) = 'approved'
        ),
        0
      ) AS approved_total
    `) as unknown as [Array<Record<string, unknown>>, unknown];

    const approvedTotal = parseFloat(String(estRows?.[0]?.approved_total ?? 0));

    res.json({ costs: costs ?? [], approvedTotal });
  } catch (err) {
    console.error('GET /api/jobs/:id/costs error:', err);
    res.status(500).json({ error: 'Failed to fetch costs' });
  }
}
