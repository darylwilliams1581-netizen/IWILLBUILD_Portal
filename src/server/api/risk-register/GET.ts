/**
 * GET /api/risk-register
 * Returns all risk register entries for the authenticated user's company.
 * Supports filtering by: status, likelihood, consequence, category, jobId, dateFrom, dateTo
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';
import { profiles } from '../../db/schema.js';
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

    const {
      status,
      likelihood,
      consequence,
      category,
      jobId,
      dateFrom,
      dateTo,
      archived,
      limit = '200',
      offset = '0',
    } = req.query as Record<string, string | undefined>;

    // By default show only active (non-archived) records; pass archived=1 to see the archive
    const showArchived = archived === '1' || archived === 'true';
    let where = `WHERE r.company_id = ${profile.companyId}`;
    where += showArchived ? ' AND r.archived_at IS NOT NULL' : ' AND r.archived_at IS NULL';
    if (status)      where += ` AND r.status = '${status.replace(/'/g, "''")}'`;
    if (likelihood)  where += ` AND r.likelihood = '${likelihood.replace(/'/g, "''")}'`;
    if (consequence) where += ` AND r.consequence = '${consequence.replace(/'/g, "''")}'`;
    if (category)    where += ` AND r.category = '${category.replace(/'/g, "''")}'`;
    if (jobId)       where += ` AND r.job_id = ${parseInt(jobId, 10)}`;
    if (dateFrom)    where += ` AND r.identified_date >= '${dateFrom}'`;
    if (dateTo)      where += ` AND r.identified_date <= '${dateTo}'`;

    const [rows] = await db.execute(sql.raw(`
      SELECT r.*,
        j.job_number,
        j.name AS job_name,
        j.site_address
      FROM risk_register r
      LEFT JOIN jobs j ON j.id = r.job_id
      ${where}
      ORDER BY
        FIELD(r.risk_level, 'extreme', 'high', 'medium', 'low') ASC,
        r.identified_date DESC,
        r.created_at DESC
      LIMIT ${parseInt(limit, 10)} OFFSET ${parseInt(offset, 10)}
    `)) as unknown as [Array<Record<string, unknown>>, unknown];

    res.json(rows ?? []);
  } catch (err) {
    console.error('GET /api/risk-register error:', err);
    res.status(500).json({ error: 'Failed to fetch risk register' });
  }
}
