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

    const isOwner = profile.role === 'owner';
    const isAdmin = isOwner || profile.role === 'admin' || profile.permAdmin === true;
    if (!isAdmin && !profile.permInvoices) return res.status(403).json({ error: 'No invoice permission' });

    const id = Number(req.params.id);
    const [rows] = await db.execute(
      sql`SELECT id, total, status FROM invoices WHERE id = ${id} AND company_id = ${profile.companyId} LIMIT 1`
    ) as unknown as [Array<{ id: number; total: string; status: string }>, unknown];
    if (!rows?.length) return res.status(404).json({ error: 'Invoice not found' });
    if (rows[0].status === 'void') return res.status(400).json({ error: 'Cannot record payment on void invoice' });

    const { payment_date, amount, method, reference, notes } = req.body as {
      payment_date: string; amount: number; method?: string; reference?: string; notes?: string;
    };
    if (!payment_date) return res.status(400).json({ error: 'Payment date is required' });
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Amount must be greater than 0' });

    await db.execute(sql`
      INSERT INTO invoice_payments (invoice_id, payment_date, amount, method, reference, notes, created_by_user_id)
      VALUES (${id}, ${payment_date}, ${amount}, ${method ?? null}, ${reference ?? null}, ${notes ?? null}, ${session.user.id})
    `);

    // Recalculate totals
    const [paidRows] = await db.execute(
      sql`SELECT COALESCE(SUM(amount), 0) as paid FROM invoice_payments WHERE invoice_id = ${id}`
    ) as unknown as [Array<{ paid: string }>, unknown];
    const amountPaid = parseFloat(paidRows?.[0]?.paid ?? '0') || 0;
    const total = parseFloat(rows[0].total) || 0;
    const balanceDue = Math.round((total - amountPaid) * 100) / 100;

    let newStatus = rows[0].status;
    if (amountPaid >= total) newStatus = 'paid';
    else if (amountPaid > 0) newStatus = 'partially_paid';

    await db.execute(sql`
      UPDATE invoices SET amount_paid = ${amountPaid}, balance_due = ${balanceDue}, status = ${newStatus}
      WHERE id = ${id} AND company_id = ${profile.companyId}
    `);

    const [updated] = await db.execute(sql`
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

    res.json({ invoice: { ...(updated?.[0] ?? {}), lines: lineRows ?? [], payments: payRows ?? [] } });
  } catch (err) {
    console.error('POST /api/invoices/:id/record-payment error:', err);
    res.status(500).json({ error: 'Failed to record payment' });
  }
}
