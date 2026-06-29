import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';
import { profiles } from '../../db/schema.js';
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
    const canInvoices = isAdmin || profile.permInvoices !== false;
    if (!canInvoices) return res.status(403).json({ error: 'No invoice permission' });

    const {
      job_id, customer_id, invoice_number, title, status,
      issue_date, due_date, notes, terms, lines,
    } = req.body as {
      job_id?: number | null; customer_id?: number | null;
      invoice_number?: string; title?: string; status?: string;
      issue_date?: string | null; due_date?: string | null;
      notes?: string | null; terms?: string | null;
      lines?: Array<{ description: string; quantity?: string; unit?: string; rate?: string; sort_order?: number }>;
    };

    if (!title?.trim()) return res.status(400).json({ error: 'Invoice title is required' });

    const invNumber = invoice_number?.trim() || await getNextInvoiceNumber(profile.companyId);

    // Calculate totals from lines
    const lineItems = lines ?? [];
    let subtotal = 0;
    for (const l of lineItems) {
      const qty = parseFloat(l.quantity ?? '1') || 1;
      const rate = parseFloat(l.rate ?? '0') || 0;
      subtotal += qty * rate;
    }
    const gst = Math.round(subtotal * 0.1 * 100) / 100;
    const total = Math.round((subtotal + gst) * 100) / 100;

    const [result] = await db.execute(sql`
      INSERT INTO invoices
        (company_id, job_id, customer_id, invoice_number, title, status,
         issue_date, due_date, subtotal, gst_amount, total, amount_paid, balance_due,
         notes, terms, accounting_sync_status, created_by_user_id)
      VALUES
        (${profile.companyId}, ${job_id ?? null}, ${customer_id ?? null},
         ${invNumber}, ${title.trim()}, ${status ?? 'draft'},
         ${issue_date ?? null}, ${due_date ?? null},
         ${subtotal}, ${gst}, ${total}, 0, ${total},
         ${notes?.trim() ?? null}, ${terms?.trim() ?? null},
         'not_synced', ${session.user.id})
    `) as unknown as [ResultSetHeader, unknown];

    const invoiceId = result.insertId;

    // Insert lines
    for (let i = 0; i < lineItems.length; i++) {
      const l = lineItems[i];
      const qty = parseFloat(l.quantity ?? '1') || 1;
      const rate = parseFloat(l.rate ?? '0') || 0;
      const amount = Math.round(qty * rate * 100) / 100;
      await db.execute(sql`
        INSERT INTO invoice_lines (invoice_id, description, quantity, unit, rate, amount, sort_order)
        VALUES (${invoiceId}, ${l.description}, ${qty}, ${l.unit ?? null}, ${rate}, ${amount}, ${l.sort_order ?? i})
      `);
    }

    const [rows] = await db.execute(
      sql`SELECT * FROM invoices WHERE id = ${invoiceId}`
    ) as unknown as [Array<Record<string, unknown>>, unknown];
    const [lineRows] = await db.execute(
      sql`SELECT * FROM invoice_lines WHERE invoice_id = ${invoiceId} ORDER BY sort_order ASC`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    res.status(201).json({ invoice: { ...(rows?.[0] ?? {}), lines: lineRows ?? [] } });
  } catch (err) {
    console.error('POST /api/invoices error:', err);
    res.status(500).json({ error: 'Failed to create invoice' });
  }
}
