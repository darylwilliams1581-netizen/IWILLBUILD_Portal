/**
 * PUT /api/jobs/:id/purchase-orders/:poId
 * Updates a purchase order (status, instructions, dates, cancel note).
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { profiles } from '../../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';

interface POUpdateBody {
  status?: string;
  title?: string;
  instructions?: string;
  startDate?: string;
  finishDate?: string;
  cancelledNote?: string;
  assignedToName?: string;
  tradeType?: string;
  contractorId?: number | null;
}

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

    const poId = parseInt(String(req.params.poId), 10);
    if (isNaN(poId)) return res.status(400).json({ error: 'Invalid PO ID' });

    const [existing] = await db.execute(sql`
      SELECT id, status FROM job_purchase_orders WHERE id = ${poId} AND company_id = ${profile.companyId} LIMIT 1
    `) as unknown as [Array<{ id: number; status: string }>, unknown];
    if (!existing?.length) return res.status(404).json({ error: 'Purchase order not found' });

    const body = req.body as POUpdateBody;
    const validStatuses = ['draft', 'sent', 'completed', 'paid', 'cancelled'];
    const newStatus = body.status && validStatuses.includes(body.status) ? body.status : existing[0].status;

    await db.execute(sql`
      UPDATE job_purchase_orders SET
        status           = ${newStatus},
        title            = COALESCE(${body.title?.trim() || null}, title),
        instructions     = ${body.instructions !== undefined ? (body.instructions?.trim() || null) : sql`instructions`},
        start_date       = ${body.startDate !== undefined ? (body.startDate || null) : sql`start_date`},
        finish_date      = ${body.finishDate !== undefined ? (body.finishDate || null) : sql`finish_date`},
        cancelled_note   = ${body.cancelledNote !== undefined ? (body.cancelledNote?.trim() || null) : sql`cancelled_note`},
        assigned_to_name = ${body.assignedToName !== undefined ? (body.assignedToName?.trim() || null) : sql`assigned_to_name`},
        trade_type       = ${body.tradeType !== undefined ? (body.tradeType?.trim() || null) : sql`trade_type`},
        contractor_id    = ${body.contractorId !== undefined ? (body.contractorId ?? null) : sql`contractor_id`}
      WHERE id = ${poId} AND company_id = ${profile.companyId}
    `);

    const [poRows] = await db.execute(sql`
      SELECT po.*, c.name as contractor_name, c.email as contractor_email, c.phone as contractor_phone, c.abn as contractor_abn
      FROM job_purchase_orders po
      LEFT JOIN customers c ON c.id = po.contractor_id
      WHERE po.id = ${poId}
    `) as unknown as [Array<Record<string, unknown>>, unknown];

    const [lineRows] = await db.execute(sql`
      SELECT * FROM job_purchase_order_lines WHERE purchase_order_id = ${poId} ORDER BY sort_order ASC
    `) as unknown as [Array<Record<string, unknown>>, unknown];

    res.json({ purchaseOrder: { ...poRows[0], lines: lineRows ?? [] } });
  } catch (err) {
    console.error('PUT /api/jobs/:id/purchase-orders/:poId error:', err);
    res.status(500).json({ error: 'Failed to update purchase order' });
  }
}
