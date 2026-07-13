/**
 * PATCH /api/invoices/:id/unlock
 *
 * Recall / unlock workflow:
 *  1. Invoice must be in 'sent' status (not paid/void — those are final)
 *  2. Move invoice back to 'draft', clear sent_at, clear locked flags
 *  3. If invoice has a source_estimate_id, unlock that estimate too
 *     (locked=0, locked_at=NULL, locked_invoice_id=NULL)
 *  4. Return updated invoice
 *
 * This allows the user to adjust the estimate, then re-convert to invoice.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { profiles } from '../../../../db/schema.js';
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

    const isAdmin = profile.role === 'owner' || profile.role === 'admin' || profile.permAdmin === true;
    const canInvoices = isAdmin || profile.permInvoices !== false;
    if (!canInvoices) return res.status(403).json({ error: 'No invoice permission' });

    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'Invalid invoice ID' });

    // Load invoice
    const [rows] = await db.execute(
      sql`SELECT id, status, source_estimate_id FROM invoices
          WHERE id = ${id} AND company_id = ${profile.companyId} LIMIT 1`
    ) as unknown as [Array<{ id: number; status: string; source_estimate_id: number | null }>, unknown];

    const invoice = rows?.[0];
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    // Only 'sent' invoices can be recalled — paid/void are final
    if (!['sent', 'draft'].includes(invoice.status)) {
      return res.status(422).json({
        error: `Cannot recall a ${invoice.status} invoice. Only sent invoices can be moved back to draft.`,
      });
    }

    if (invoice.status === 'draft') {
      return res.status(422).json({ error: 'Invoice is already in draft.' });
    }

    // Move invoice back to draft
    await db.execute(sql`
      UPDATE invoices
      SET status = 'draft', sent_at = NULL, locked = 0, locked_at = NULL, locked_by = NULL
      WHERE id = ${id} AND company_id = ${profile.companyId}
    `);

    // Unlock source estimate if linked
    if (invoice.source_estimate_id) {
      await db.execute(sql`
        UPDATE estimates
        SET locked = 0, locked_at = NULL, locked_invoice_id = NULL
        WHERE id = ${invoice.source_estimate_id} AND company_id = ${profile.companyId}
      `);
    }

    // Return updated invoice
    const [updatedRows] = await db.execute(sql`
      SELECT i.*,
             j.name as job_name, j.job_number,
             c.name as customer_name, c.email as customer_email
      FROM invoices i
      LEFT JOIN jobs j ON j.id = i.job_id AND j.company_id = i.company_id
      LEFT JOIN customers c ON c.id = i.customer_id AND c.company_id = i.company_id
      WHERE i.id = ${id}
      LIMIT 1
    `) as unknown as [Array<Record<string, unknown>>, unknown];

    const [lineRows] = await db.execute(
      sql`SELECT * FROM invoice_lines WHERE invoice_id = ${id} ORDER BY sort_order ASC`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    const [payRows] = await db.execute(
      sql`SELECT * FROM invoice_payments WHERE invoice_id = ${id} ORDER BY payment_date ASC`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    return res.json({
      invoice: { ...(updatedRows?.[0] ?? {}), lines: lineRows ?? [], payments: payRows ?? [] },
      estimate_unlocked: !!invoice.source_estimate_id,
    });
  } catch (err) {
    console.error('PATCH /api/invoices/:id/unlock error:', err);
    return res.status(500).json({ error: 'Failed to unlock invoice' });
  }
}
