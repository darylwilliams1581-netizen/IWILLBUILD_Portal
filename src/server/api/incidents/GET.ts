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
      severity,
      incidentType,
      dateFrom,
      dateTo,
      jobLinked,
      jobId,
      archived,
      limit = 100,
      offset = 0,
    } = req.query as Record<string, string | undefined>;

    // By default show only active (non-archived) records; pass archived=1 to see the archive
    const showArchived = archived === '1' || archived === 'true';
    let whereClause = `WHERE i.company_id = ${profile.companyId}`;
    whereClause += showArchived ? ' AND i.archived_at IS NOT NULL' : ' AND i.archived_at IS NULL';
    if (status) whereClause += ` AND i.status = '${status}'`;
    if (severity) whereClause += ` AND i.severity = '${severity}'`;
    if (incidentType) whereClause += ` AND i.incident_type = '${incidentType}'`;
    if (dateFrom) whereClause += ` AND i.incident_date >= '${dateFrom}'`;
    if (dateTo) whereClause += ` AND i.incident_date <= '${dateTo}'`;
    if (jobLinked === 'yes') whereClause += ` AND i.job_id IS NOT NULL`;
    if (jobLinked === 'no') whereClause += ` AND i.job_id IS NULL`;
    if (jobId) whereClause += ` AND i.job_id = ${parseInt(jobId, 10)}`;

    const [rows] = await db.execute(sql.raw(`
      SELECT i.*,
        (SELECT COUNT(*) FROM incident_corrective_actions ca WHERE ca.incident_id = i.id) AS corrective_action_count,
        (SELECT COUNT(*) FROM incident_corrective_actions ca WHERE ca.incident_id = i.id AND ca.status = 'complete') AS corrective_actions_complete
      FROM incidents i
      ${whereClause}
      ORDER BY i.incident_date DESC, i.created_at DESC
      LIMIT ${parseInt(String(limit), 10)} OFFSET ${parseInt(String(offset), 10)}
    `)) as unknown as [Array<Record<string, unknown>>, unknown];

    res.json(rows ?? []);
  } catch (err) {
    console.error('GET incidents error:', err);
    res.status(500).json({ error: 'Failed to fetch incidents' });
  }
}
