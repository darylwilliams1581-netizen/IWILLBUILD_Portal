/**
 * GET /api/portal/jobs/:id?token=...
 * Returns a single job with estimates and invoices for the portal customer.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
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

    const jobId = parseInt(String(req.params.id), 10);

    const [jobRows] = await db.execute(sql`
      SELECT j.*, c.name AS customer_name
      FROM jobs j
      LEFT JOIN customers c ON c.id = j.customer_id
      WHERE j.id = ${jobId}
        AND j.customer_id = ${ctx.customer_id}
        AND j.company_id = ${ctx.company_id}
      LIMIT 1
    `) as unknown as [Array<Record<string, unknown>>];

    if (!jobRows?.length) return res.status(404).json({ error: 'Job not found' });

    const [estRows] = await db.execute(sql`
      SELECT id, estimate_number, title, status, total_inc_gst, total_ex_gst, created_at, approved_at, notes
      FROM estimates
      WHERE job_id = ${jobId} AND company_id = ${ctx.company_id}
        AND status NOT IN ('draft')
      ORDER BY created_at DESC
    `) as unknown as [Array<Record<string, unknown>>];

    const [invRows] = await db.execute(sql`
      SELECT id, invoice_number, title, status, total_inc_gst, due_date, paid_at, created_at
      FROM invoices
      WHERE job_id = ${jobId}
        AND company_id = ${ctx.company_id}
        AND customer_id = (
          SELECT customer_id FROM jobs WHERE id = ${jobId} AND company_id = ${ctx.company_id} LIMIT 1
        )
        AND status NOT IN ('draft', 'cancelled')
      ORDER BY created_at DESC
    `) as unknown as [Array<Record<string, unknown>>];

    res.json({
      job: jobRows[0],
      estimates: estRows ?? [],
      invoices: invRows ?? [],
    });
  } catch (err) {
    console.error('GET /api/portal/jobs/:id error:', err);
    res.status(500).json({ error: 'Failed to load job' });
  }
}
