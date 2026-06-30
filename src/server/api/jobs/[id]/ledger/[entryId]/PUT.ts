/**
 * PUT /api/jobs/:id/ledger/:entryId
 * Update a ledger entry (edit or approve/reject).
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { profiles } from '../../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';

const VALID_EVENT_TYPES = [
  'LABOUR', 'MATERIAL', 'PLANT', 'SUBCONTRACTOR', 'RECEIPT',
  'PURCHASE', 'VARIATION', 'INVOICE_LINE', 'CREDIT', 'ADJUSTMENT',
];

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

    const entryId = parseInt(String(req.params.entryId), 10);
    if (isNaN(entryId)) return res.status(400).json({ error: 'Invalid entry ID' });

    const [existing] = await db.execute(sql`
      SELECT id FROM job_cost_ledger WHERE id = ${entryId} AND company_id = ${profile.companyId} LIMIT 1
    `) as unknown as [Array<{ id: number }>, unknown];
    if (!existing?.length) return res.status(404).json({ error: 'Entry not found' });

    const body = req.body as Record<string, string | number | boolean>;

    // Recalculate if qty/rate changed
    const qtyNum = body.qty !== undefined ? (parseFloat(String(body.qty)) || 1) : null;
    const rateNum = body.rate !== undefined ? (parseFloat(String(body.rate)) || 0) : null;

    // Approval handling
    const newStatus = body.status ? String(body.status) : null;
    const approvedAt = newStatus === 'approved' ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null;
    const approvedBy = newStatus === 'approved' ? (session.user.name ?? session.user.email ?? 'Unknown') : null;

    await db.execute(sql`
      UPDATE job_cost_ledger SET
        entry_date    = COALESCE(${body.entryDate ? String(body.entryDate) : null}, entry_date),
        event_type    = COALESCE(${body.eventType && VALID_EVENT_TYPES.includes(String(body.eventType)) ? String(body.eventType) : null}, event_type),
        description   = COALESCE(${body.description ? String(body.description) : null}, description),
        qty           = COALESCE(${qtyNum}, qty),
        unit          = COALESCE(${body.unit !== undefined ? (body.unit ? String(body.unit) : null) : sql`unit`}, unit),
        rate          = COALESCE(${rateNum}, rate),
        subtotal      = CASE WHEN ${qtyNum !== null && rateNum !== null ? 1 : 0} = 1 THEN ${qtyNum !== null && rateNum !== null ? Math.round((qtyNum ?? 0) * (rateNum ?? 0) * 100) / 100 : 0} ELSE subtotal END,
        gst           = CASE WHEN ${qtyNum !== null && rateNum !== null ? 1 : 0} = 1 THEN ${qtyNum !== null && rateNum !== null ? Math.round((qtyNum ?? 0) * (rateNum ?? 0) * 0.1 * 100) / 100 : 0} ELSE gst END,
        total         = CASE WHEN ${qtyNum !== null && rateNum !== null ? 1 : 0} = 1 THEN ${qtyNum !== null && rateNum !== null ? Math.round((qtyNum ?? 0) * (rateNum ?? 0) * 1.1 * 100) / 100 : 0} ELSE total END,
        account_code  = COALESCE(${body.accountCode !== undefined ? (body.accountCode ? String(body.accountCode) : null) : sql`account_code`}, account_code),
        tax_code      = COALESCE(${body.taxCode ? String(body.taxCode) : null}, tax_code),
        contact_name  = COALESCE(${body.contactName !== undefined ? (body.contactName ? String(body.contactName) : null) : sql`contact_name`}, contact_name),
        reference     = COALESCE(${body.reference !== undefined ? (body.reference ? String(body.reference) : null) : sql`reference`}, reference),
        status        = COALESCE(${newStatus && ['pending', 'approved', 'rejected'].includes(newStatus) ? newStatus : null}, status),
        approved_by   = CASE WHEN ${approvedBy ? 1 : 0} = 1 THEN ${approvedBy} ELSE approved_by END,
        approved_at   = CASE WHEN ${approvedAt ? 1 : 0} = 1 THEN ${approvedAt} ELSE approved_at END
      WHERE id = ${entryId} AND company_id = ${profile.companyId}
    `);

    const [rows] = await db.execute(sql`SELECT * FROM job_cost_ledger WHERE id = ${entryId}`) as unknown as [Array<Record<string, unknown>>, unknown];
    res.json({ entry: rows?.[0] ?? null });
  } catch (err) {
    console.error('PUT /api/jobs/:id/ledger/:entryId error:', err);
    res.status(500).json({ error: 'Failed to update ledger entry' });
  }
}
