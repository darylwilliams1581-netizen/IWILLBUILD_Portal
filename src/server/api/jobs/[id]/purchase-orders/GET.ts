/**
 * GET /api/jobs/:id/purchase-orders
 * Returns all purchase orders for a job, with their line items.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { jobs, profiles } from '../../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';

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

    const [poRows] = await db.execute(sql`
      SELECT po.*,
             c.name as contractor_name,
             c.email as contractor_email,
             c.phone as contractor_phone,
             c.abn as contractor_abn
      FROM job_purchase_orders po
      LEFT JOIN customers c ON c.id = po.contractor_id
      WHERE po.job_id = ${jobId} AND po.company_id = ${profile.companyId}
      ORDER BY po.created_at DESC
    `) as unknown as [Array<Record<string, unknown>>, unknown];

    // Fetch lines for all POs
    const poIds = (poRows ?? []).map((r) => r.id as number);
    let lineRows: Array<Record<string, unknown>> = [];
    if (poIds.length > 0) {
      const [lr] = await db.execute(sql`
        SELECT * FROM job_purchase_order_lines
        WHERE purchase_order_id IN (${sql.raw(poIds.join(','))})
        ORDER BY sort_order ASC, id ASC
      `) as unknown as [Array<Record<string, unknown>>, unknown];
      lineRows = lr ?? [];
    }

    const pos = (poRows ?? []).map((po) => ({
      ...po,
      lines: lineRows.filter((l) => l.purchase_order_id === po.id),
    }));

    res.json({ purchaseOrders: pos });
  } catch (err) {
    console.error('GET /api/jobs/:id/purchase-orders error:', err);
    res.status(500).json({ error: 'Failed to fetch purchase orders' });
  }
}
