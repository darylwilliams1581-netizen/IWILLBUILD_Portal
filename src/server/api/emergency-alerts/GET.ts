/**
 * GET /api/emergency-alerts?jobId=<id>[&status=active|all]
 * Returns emergency alerts for a job, newest first.
 * Defaults to all statuses. Pass status=active to filter.
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../lib/auth-middleware.js';

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  const companyId = auth.profile.companyId;
  const jobId     = parseInt(String(req.query.jobId ?? ''), 10);
  const statusFilter = String(req.query.status ?? 'all');

  if (isNaN(jobId)) {
    return res.status(400).json({ error: 'jobId is required' });
  }

  // Verify job belongs to this company
  const [jobRows] = await db.execute(
    sql`SELECT id FROM jobs WHERE id = ${jobId} AND company_id = ${companyId} LIMIT 1`
  ) as unknown as [Array<{ id: number }>, unknown];

  if (!jobRows.length) {
    return res.status(404).json({ error: 'Job not found or access denied' });
  }

  try {
    let rows: Array<Record<string, unknown>>;

    if (statusFilter === 'active') {
      [rows] = await db.execute(
        sql`SELECT * FROM emergency_alerts
            WHERE company_id = ${companyId} AND job_id = ${jobId} AND status = 'active'
            ORDER BY created_at DESC`
      ) as unknown as [Array<Record<string, unknown>>, unknown];
    } else {
      [rows] = await db.execute(
        sql`SELECT * FROM emergency_alerts
            WHERE company_id = ${companyId} AND job_id = ${jobId}
            ORDER BY created_at DESC`
      ) as unknown as [Array<Record<string, unknown>>, unknown];
    }

    return res.json({ ok: true, alerts: rows });
  } catch (err) {
    console.error('GET /api/emergency-alerts error:', err);
    return res.status(500).json({ error: 'Failed to fetch emergency alerts' });
  }
}
