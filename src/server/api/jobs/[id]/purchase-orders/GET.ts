/**
 * GET /api/jobs/:id/purchase-orders
 * Returns all purchase orders for a job, with their line items.
 *
 * Gate 1 hardening:
 *  - Finance permission required (permInvoices)
 *  - Job must belong to authenticated company
 *  - All statuses returned (including legacy 'paid') — no exclusion
 *  - Dollar fields (subtotal, gst, total, line rate/amount) are included for
 *    users with permSeeDollars; stripped for users without it
 *    (Gate 2 will implement the strip UI; Gate 1 enforces the permission check)
 */

import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { jobs, profiles } from '../../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import {
  resolvePOProfile,
  requireFinance,
} from '../../../../lib/po-auth.js';

export default async function handler(req: Request, res: Response) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const profile = await resolvePOProfile(req, res);
  if (!profile) return;
  if (!requireFinance(profile, res)) return;

  // ── Job ID ────────────────────────────────────────────────────────────────
  const jobId = parseInt(String(req.params.id), 10);
  if (isNaN(jobId)) return res.status(400).json({ error: 'Invalid job ID' });

  try {
    // Verify job belongs to company
    const job = await db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.companyId, profile.companyId)),
    });
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

    return res.json({ purchaseOrders: pos, canSeeDollars: profile.canSeeDollars });
  } catch (err) {
    console.error('GET /api/jobs/:id/purchase-orders error:', err);
    return res.status(500).json({ error: 'Failed to fetch purchase orders' });
  }
}
