/**
 * POST /api/estimates/:id/convert-to-invoice
 *
 * Workflow:
 *  1. Load the estimate + its lines
 *  2. Create a new draft invoice copying all lines, title, job, customer
 *  3. Lock the estimate (locked=1, locked_invoice_id=<new invoice id>)
 *  4. Return the new invoice id so the UI can navigate straight to it
 *
 * Guard: if the estimate is already locked (an invoice exists for it) we
 * return 409 with the existing invoice id so the UI can redirect instead.
 */
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
  return `INV-${String(parseInt(match[1], 10) + 1).padStart(4, '0')}`;
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

    const isAdmin = profile.role === 'owner' || profile.role === 'admin' || profile.permAdmin === true;
    const canInvoices = isAdmin || profile.permInvoices !== false;
    if (!canInvoices) return res.status(403).json({ error: 'No invoice permission' });

    const estimateId = parseInt(req.params.id, 10);
    if (!estimateId) return res.status(400).json({ error: 'Invalid estimate ID' });

    // Load estimate
    const [estRows] = await db.execute(
      sql`SELECT e.*, j.customer_id as job_customer_id
          FROM estimates e
          LEFT JOIN jobs j ON j.id = e.job_id AND j.company_id = e.company_id
          WHERE e.id = ${estimateId} AND e.company_id = ${profile.companyId}
          LIMIT 1`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    const estimate = estRows?.[0];
    if (!estimate) return res.status(404).json({ error: 'Estimate not found' });

    // Already locked — return existing invoice id so UI can redirect
    if (estimate.locked) {
      return res.status(409).json({
        error: 'Estimate is already locked to an invoice',
        invoice_id: estimate.locked_invoice_id,
      });
    }

    // Load estimate lines
    const [lineRows] = await db.execute(
      sql`SELECT * FROM estimate_lines WHERE estimate_id = ${estimateId} ORDER BY line_order ASC, id ASC`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    const lines = lineRows ?? [];

    // Calculate totals
    let subtotal = 0;
    for (const l of lines) {
      const qty = parseFloat(String(l.quantity ?? '1')) || 1;
      const rate = parseFloat(String(l.rate ?? '0')) || 0;
      subtotal += Math.round(qty * rate * 100) / 100;
    }

    // Apply markup if set
    const markupPct = parseFloat(String(estimate.markup_percent ?? '0')) || 0;
    if (markupPct > 0) {
      subtotal = Math.round(subtotal * (1 + markupPct / 100) * 100) / 100;
    }

    // GST
    const gstMode = String(estimate.gst_mode ?? 'No GST');
    let gst = 0;
    if (gstMode === 'GST Inclusive') {
      gst = Math.round((subtotal / 11) * 100) / 100;
    } else if (gstMode === 'GST Exclusive') {
      gst = Math.round(subtotal * 0.1 * 100) / 100;
    }
    const total = gstMode === 'GST Exclusive'
      ? Math.round((subtotal + gst) * 100) / 100
      : subtotal;

    const invNumber = await getNextInvoiceNumber(profile.companyId);
    const customerId = estimate.job_customer_id ?? null;

    // Create draft invoice
    const [insertResult] = await db.execute(sql`
      INSERT INTO invoices
        (company_id, job_id, customer_id, invoice_number, title, status,
         subtotal, gst_amount, total, amount_paid, balance_due,
         notes, source_estimate_id, created_by_user_id)
      VALUES
        (${profile.companyId}, ${estimate.job_id}, ${customerId},
         ${invNumber}, ${estimate.title}, 'draft',
         ${subtotal}, ${gst}, ${total}, 0, ${total},
         ${estimate.notes ?? null}, ${estimateId}, ${session.user.id})
    `) as unknown as [ResultSetHeader, unknown];

    const invoiceId = insertResult.insertId;

    // Copy lines into invoice_lines
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const qty = parseFloat(String(l.quantity ?? '1')) || 1;
      const rate = parseFloat(String(l.rate ?? '0')) || 0;
      // Apply markup to each line rate if set
      const effectiveRate = markupPct > 0 ? Math.round(rate * (1 + markupPct / 100) * 100) / 100 : rate;
      const amount = Math.round(qty * effectiveRate * 100) / 100;
      await db.execute(sql`
        INSERT INTO invoice_lines (invoice_id, description, quantity, unit, rate, amount, sort_order)
        VALUES (${invoiceId}, ${l.description}, ${qty}, ${l.unit ?? null}, ${effectiveRate}, ${amount}, ${i})
      `);
    }

    // Lock the estimate
    await db.execute(sql`
      UPDATE estimates
      SET locked = 1, locked_at = NOW(), locked_invoice_id = ${invoiceId}
      WHERE id = ${estimateId} AND company_id = ${profile.companyId}
    `);

    return res.status(201).json({ invoice_id: invoiceId, invoice_number: invNumber });
  } catch (err) {
    console.error('POST /api/estimates/:id/convert-to-invoice error:', err);
    return res.status(500).json({ error: 'Failed to convert estimate to invoice' });
  }
}
