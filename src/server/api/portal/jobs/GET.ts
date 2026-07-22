/**
 * GET /api/portal/jobs?token=...
 * Returns jobs for the customer identified by the portal token.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';

async function resolveToken(token: string) {
  const [rows] = await db.execute(sql`
    SELECT company_id, customer_id FROM customer_portal_tokens
    WHERE token = ${token} AND expires_at > NOW()
    LIMIT 1
  `) as unknown as [Array<Record<string, unknown>>];
  return rows?.[0] ?? null;
}

export default async function handler(req: Request, res: Response) {
  try {
    const token = String(req.query.token ?? '');
    if (!token) return res.status(401).json({ error: 'token required' });

    const ctx = await resolveToken(token);
    if (!ctx) return res.status(401).json({ error: 'Invalid or expired token' });

    const [rows] = await db.execute(sql`
      SELECT
        j.id, j.job_number, j.name, j.status, j.address, j.description,
        j.start_date, j.end_date, j.created_at,
        (SELECT COUNT(*) FROM estimates e WHERE e.job_id = j.id AND e.status = 'approved') AS approved_estimates,
        (SELECT COUNT(*) FROM estimates e WHERE e.job_id = j.id AND e.status = 'pending') AS pending_estimates,
        (SELECT COUNT(*) FROM invoices i WHERE i.job_id = j.id AND i.status NOT IN ('draft','cancelled')) AS invoice_count,
        (SELECT SUM(i.total_inc_gst) FROM invoices i WHERE i.job_id = j.id AND i.status = 'unpaid') AS outstanding_amount
      FROM jobs j
      WHERE j.customer_id = ${ctx.customer_id}
        AND j.company_id = ${ctx.company_id}
        AND j.status != 'archived'
      ORDER BY j.created_at DESC
    `) as unknown as [Array<Record<string, unknown>>];

    res.json({ jobs: rows ?? [] });
  } catch (err) {
    console.error('GET /api/portal/jobs error:', err);
    res.status(500).json({ error: 'Failed to load jobs' });
  }
}
