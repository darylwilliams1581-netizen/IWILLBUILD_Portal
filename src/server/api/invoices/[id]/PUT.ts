import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { profiles } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { sendPushToCompany } from '../../../lib/push-notifications.js';

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

    const isOwner = profile.role === 'owner';
    const isAdmin = isOwner || profile.role === 'admin' || profile.permAdmin === true;
    const canInvoices = isAdmin || profile.permInvoices !== false;
    if (!canInvoices) return res.status(403).json({ error: 'No invoice permission' });

    const id = Number(req.params.id);
    const [existing] = await db.execute(
      sql`SELECT id, status, locked FROM invoices WHERE id = ${id} AND company_id = ${profile.companyId} LIMIT 1`
    ) as unknown as [Array<{ id: number; status: string; locked: number }>, unknown];
    if (!existing?.length) return res.status(404).json({ error: 'Invoice not found' });

    // Immutability guard — paid/void invoices are final; sent can only be recalled via /unlock
    const finalStatuses = ['paid', 'partially_paid', 'overdue', 'void'];
    if (existing[0].locked || finalStatuses.includes(existing[0].status)) {
      return res.status(423).json({
        error: 'This invoice is locked and cannot be edited. It has already been paid or voided.',
        locked: true,
      });
    }
    // Sent invoices can only be edited via recall (PATCH /unlock) first
    if (existing[0].status === 'sent') {
      return res.status(423).json({
        error: 'This invoice has been sent. Recall it to draft before making changes.',
        locked: true,
        recall_required: true,
      });
    }

    const {
      job_id, customer_id, invoice_number, title, status,
      issue_date, due_date, notes, terms, lines,
    } = req.body as {
      job_id?: number | null; customer_id?: number | null;
      invoice_number?: string; title?: string; status?: string;
      issue_date?: string | null; due_date?: string | null;
      notes?: string | null; terms?: string | null;
      lines?: Array<{ id?: number; description: string; quantity?: string; unit?: string; rate?: string; sort_order?: number }>;
    };

    if (!title?.trim()) return res.status(400).json({ error: 'Invoice title is required' });

    // Recalculate totals from lines
    const lineItems = lines ?? [];
    let subtotal = 0;
    for (const l of lineItems) {
      const qty = parseFloat(l.quantity ?? '1') || 1;
      const rate = parseFloat(l.rate ?? '0') || 0;
      subtotal += qty * rate;
    }
    const gst = Math.round(subtotal * 0.1 * 100) / 100;
    const total = Math.round((subtotal + gst) * 100) / 100;

    // Get current amount_paid to recalculate balance
    const [paidRows] = await db.execute(
      sql`SELECT COALESCE(SUM(amount), 0) as paid FROM invoice_payments WHERE invoice_id = ${id}`
    ) as unknown as [Array<{ paid: string }>, unknown];
    const amountPaid = parseFloat(paidRows?.[0]?.paid ?? '0') || 0;
    const balanceDue = Math.round((total - amountPaid) * 100) / 100;

    // Auto-update status based on payment
    let finalStatus = status ?? existing[0].status;
    if (amountPaid > 0 && amountPaid >= total) finalStatus = 'paid';
    else if (amountPaid > 0 && amountPaid < total) finalStatus = 'partially_paid';

    // Record sent_at when transitioning to sent for the first time
    const isBeingSent = finalStatus === 'sent' && existing[0].status !== 'sent';

    await db.execute(sql`
      UPDATE invoices SET
        job_id = ${job_id ?? null},
        customer_id = ${customer_id ?? null},
        invoice_number = ${invoice_number?.trim() ?? null},
        title = ${title.trim()},
        status = ${finalStatus},
        issue_date = ${issue_date ?? null},
        due_date = ${due_date ?? null},
        subtotal = ${subtotal},
        gst_amount = ${gst},
        total = ${total},
        amount_paid = ${amountPaid},
        balance_due = ${balanceDue},
        notes = ${notes?.trim() ?? null},
        terms = ${terms?.trim() ?? null},
        sent_at = CASE WHEN ${isBeingSent ? 1 : 0} = 1 THEN NOW() ELSE sent_at END
      WHERE id = ${id} AND company_id = ${profile.companyId}
    `);

    // Replace lines: delete all, re-insert
    await db.execute(sql`DELETE FROM invoice_lines WHERE invoice_id = ${id}`);
    for (let i = 0; i < lineItems.length; i++) {
      const l = lineItems[i];
      const qty = parseFloat(l.quantity ?? '1') || 1;
      const rate = parseFloat(l.rate ?? '0') || 0;
      const amount = Math.round(qty * rate * 100) / 100;
      await db.execute(sql`
        INSERT INTO invoice_lines (invoice_id, description, quantity, unit, rate, amount, sort_order)
        VALUES (${id}, ${l.description}, ${qty}, ${l.unit ?? null}, ${rate}, ${amount}, ${l.sort_order ?? i})
      `);
    }

    const [rows] = await db.execute(sql`
      SELECT i.*, j.name as job_name, j.job_number, c.name as customer_name
      FROM invoices i
      LEFT JOIN jobs j ON j.id = i.job_id AND j.company_id = i.company_id
      LEFT JOIN customers c ON c.id = i.customer_id AND c.company_id = i.company_id
      WHERE i.id = ${id}
    `) as unknown as [Array<Record<string, unknown>>, unknown];
    const [lineRows] = await db.execute(
      sql`SELECT * FROM invoice_lines WHERE invoice_id = ${id} ORDER BY sort_order ASC`
    ) as unknown as [Array<Record<string, unknown>>, unknown];
    const [payRows] = await db.execute(
      sql`SELECT * FROM invoice_payments WHERE invoice_id = ${id} ORDER BY payment_date ASC`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    res.json({ invoice: { ...(rows?.[0] ?? {}), lines: lineRows ?? [], payments: payRows ?? [] } });

    // Push notification: invoice just became paid
    if (finalStatus === 'paid' && existing[0].status !== 'paid') {
      void sendPushToCompany(profile.companyId, {
        title: 'Invoice Paid',
        body: `Invoice ${invoice_number ? `#${invoice_number}` : `#${id}`} has been marked as paid`,
        url: `/invoices/${id}`,
        tag: `invoice-paid-${id}`,
      });
    }
  } catch (err) {
    console.error('PUT /api/invoices/:id error:', err);
    res.status(500).json({ error: 'Failed to update invoice' });
  }
}
