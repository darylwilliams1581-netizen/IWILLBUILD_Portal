import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { profiles } from '../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import type { ResultSetHeader } from 'mysql2';

async function getNextInvoiceNumber(companyId: number): Promise<string> {
  const [rows] = await db.execute(
    sql`SELECT invoice_number FROM invoices WHERE company_id = ${companyId} ORDER BY id DESC LIMIT 1`
  ) as unknown as [Array<{ invoice_number: string }>, unknown];
  if (!rows?.length) return 'INV-0001';
  const last = rows[0].invoice_number;
  const match = last.match(/(\d+)$/);
  if (!match) return 'INV-0001';
  const next = parseInt(match[1], 10) + 1;
  return `INV-${String(next).padStart(4, '0')}`;
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

    const isOwner = profile.role === 'owner';
    const isAdmin = isOwner || profile.role === 'admin' || profile.permAdmin === true;
    if (!isAdmin && !profile.permInvoices) return res.status(403).json({ error: 'No invoice permission' });

    const id = Number(req.params.id);
    const [rows] = await db.execute(
      sql`SELECT * FROM invoices WHERE id = ${id} AND company_id = ${profile.companyId} LIMIT 1`
    ) as unknown as [Array<Record<string, unknown>>, unknown];
    if (!rows?.length) return res.status(404).json({ error: 'Invoice not found' });

    const src = rows[0];
    const newNumber = await getNextInvoiceNumber(profile.companyId);

    const [result] = await db.execute(sql`
      INSERT INTO invoices
        (company_id, job_id, customer_id, invoice_number, title, status,
         issue_date, due_date, subtotal, gst_amount, total, amount_paid, balance_due,
         notes, terms, accounting_sync_status, created_by_user_id)
      VALUES
        (${profile.companyId}, ${src.job_id ?? null}, ${src.customer_id ?? null},
         ${newNumber}, ${`Copy of ${src.title}`}, 'draft',
         ${src.issue_date ?? null}, ${src.due_date ?? null},
         ${src.subtotal}, ${src.gst_amount}, ${src.total}, 0, ${src.total},
         ${src.notes ?? null}, ${src.terms ?? null},
         'not_synced', ${session.user.id})
    `) as unknown as [ResultSetHeader, unknown];

    const newId = result.insertId;

    // Copy lines
    const [lineRows] = await db.execute(
      sql`SELECT * FROM invoice_lines WHERE invoice_id = ${id} ORDER BY sort_order ASC`
    ) as unknown as [Array<Record<string, unknown>>, unknown];
    for (const l of (lineRows ?? [])) {
      await db.execute(sql`
        INSERT INTO invoice_lines (invoice_id, description, quantity, unit, rate, amount, sort_order)
        VALUES (${newId}, ${l.description}, ${l.quantity}, ${l.unit ?? null}, ${l.rate}, ${l.amount}, ${l.sort_order})
      `);
    }

    const [newRows] = await db.execute(
      sql`SELECT * FROM invoices WHERE id = ${newId}`
    ) as unknown as [Array<Record<string, unknown>>, unknown];
    const [newLines] = await db.execute(
      sql`SELECT * FROM invoice_lines WHERE invoice_id = ${newId} ORDER BY sort_order ASC`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    res.status(201).json({ invoice: { ...(newRows?.[0] ?? {}), lines: newLines ?? [] } });
  } catch (err) {
    console.error('POST /api/invoices/:id/duplicate error:', err);
    res.status(500).json({ error: 'Failed to duplicate invoice' });
  }
}
