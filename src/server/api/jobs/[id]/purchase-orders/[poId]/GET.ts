/**
 * GET /api/jobs/:id/purchase-orders/:poId
 * Returns a single purchase order with its lines.
 *
 * Gate 1 hardening:
 *  - Finance permission required (permInvoices)
 *  - Dollar visibility required (permSeeDollars) — rates/totals are financial data
 *  - PO must match job_id + company_id (wrong-job and cross-company → 404)
 */

import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import {
  resolvePOProfile,
  requireFinanceAndDollars,
} from '../../../../../lib/po-auth.js';

export default async function handler(req: Request, res: Response) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const profile = await resolvePOProfile(req, res);
  if (!profile) return;
  if (!requireFinanceAndDollars(profile, res)) return;

  // ── IDs ───────────────────────────────────────────────────────────────────
  const jobId = parseInt(String(req.params.id), 10);
  if (isNaN(jobId)) return res.status(400).json({ error: 'Invalid job ID' });

  const poId = parseInt(String(req.params.poId), 10);
  if (isNaN(poId)) return res.status(400).json({ error: 'Invalid PO ID' });

  try {
    // Scope by PO id + job_id + company_id — wrong job or wrong company → 404
    const [poRows] = await db.execute(sql`
      SELECT po.*,
             c.name as contractor_name, c.email as contractor_email,
             c.phone as contractor_phone, c.abn as contractor_abn
      FROM job_purchase_orders po
      LEFT JOIN customers c ON c.id = po.contractor_id
      WHERE po.id = ${poId}
        AND po.job_id = ${jobId}
        AND po.company_id = ${profile.companyId}
    `) as unknown as [Array<Record<string, unknown>>, unknown];

    if (!poRows?.length) return res.status(404).json({ error: 'Purchase order not found' });

    const [lineRows] = await db.execute(sql`
      SELECT * FROM job_purchase_order_lines
      WHERE purchase_order_id = ${poId}
      ORDER BY sort_order ASC
    `) as unknown as [Array<Record<string, unknown>>, unknown];

    return res.json({ purchaseOrder: { ...poRows[0], lines: lineRows ?? [] } });
  } catch (err) {
    console.error('GET /api/jobs/:id/purchase-orders/:poId error:', err);
    return res.status(500).json({ error: 'Failed to fetch purchase order' });
  }
}
