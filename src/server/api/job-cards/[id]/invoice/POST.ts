/**
 * POST /api/job-cards/:id/invoice
 * Generate an invoice from a Job Card.
 *
 * - Creates a new invoice pre-populated with customer, labour, and materials.
 * - Sets job_card.status = 'invoiced' and job_card.invoice_id = new invoice id.
 * - The Job Card is never deleted — it remains the source proof-of-work record.
 * - The invoice stores source_job_card_id so the link is permanent.
 *
 * Body (all optional — defaults come from the Job Card):
 *   issueDate?   — ISO date, defaults to today
 *   dueDate?     — ISO date
 *   notes?       — additional invoice notes
 *   terms?       — payment terms text
 *   includeGst?  — boolean, default true
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
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

    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, session.user.id),
    });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });

    // Load the Job Card
    const [cardRows] = await db.execute(
      sql`SELECT * FROM job_cards WHERE id = ${id} AND company_id = ${profile.companyId}`
    ) as unknown as [Array<Record<string, unknown>>, unknown];
    if (!cardRows?.length) return res.status(404).json({ error: 'Job card not found' });

    const card = cardRows[0];

    if (card.status === 'invoiced') {
      return res.status(409).json({
        error: 'This Job Card has already been invoiced.',
        invoiceId: card.invoice_id,
      });
    }
    if (card.status === 'converted') {
      return res.status(409).json({ error: 'This Job Card has been converted to a Full Job. Invoice from there.' });
    }

    // Load materials
    const [matRows] = await db.execute(
      sql`SELECT * FROM job_card_materials WHERE job_card_id = ${id} ORDER BY id ASC`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    const { issueDate, dueDate, notes, terms, includeGst = true } = req.body as {
      issueDate?: string;
      dueDate?: string;
      notes?: string;
      terms?: string;
      includeGst?: boolean;
    };

    const today = new Date().toISOString().slice(0, 10);
    const invNumber = await getNextInvoiceNumber(profile.companyId);

    // Build invoice title from card
    const customerLabel = (card.customer_name_override as string) || '';
    const cardNum = card.card_number as string;
    const invTitle = `${cardNum}${customerLabel ? ` — ${customerLabel}` : ''}`;

    // Calculate totals
    const labourAmount = Number(card.labour_amount ?? 0);
    const materialsTotal = (matRows ?? []).reduce((sum, m) => sum + Number(m.cost ?? 0), 0);
    const subtotal = Math.round((labourAmount + materialsTotal) * 100) / 100;
    const gstAmount = includeGst ? Math.round(subtotal * 0.1 * 100) / 100 : 0;
    const total = Math.round((subtotal + gstAmount) * 100) / 100;

    // Create invoice
    const [invResult] = await db.execute(sql`
      INSERT INTO invoices (
        company_id, customer_id, invoice_number, title, status,
        issue_date, due_date, subtotal, gst_amount, total,
        amount_paid, balance_due, notes, terms,
        accounting_sync_status, created_by_user_id
      ) VALUES (
        ${profile.companyId},
        ${card.customer_id ?? null},
        ${invNumber},
        ${invTitle},
        'draft',
        ${issueDate ?? today},
        ${dueDate ?? null},
        ${subtotal}, ${gstAmount}, ${total},
        0, ${total},
        ${notes?.trim() ?? (card.notes as string | null) ?? null},
        ${terms?.trim() ?? null},
        'not_synced',
        ${session.user.id}
      )
    `) as unknown as [ResultSetHeader, unknown];

    const invoiceId = invResult.insertId;

    // Insert invoice lines
    let sortOrder = 0;

    // Labour line
    if (labourAmount > 0) {
      const labourHours = Number(card.labour_hours ?? 0);
      const labourRate = Number(card.labour_rate ?? 0);
      const qty = labourHours > 0 ? labourHours : 1;
      const rate = labourRate > 0 ? labourRate : labourAmount;
      await db.execute(sql`
        INSERT INTO invoice_lines (invoice_id, description, quantity, unit, rate, amount, sort_order)
        VALUES (${invoiceId}, 'Labour', ${qty}, ${labourHours > 0 ? 'hrs' : null}, ${rate}, ${labourAmount}, ${sortOrder++})
      `);
    }

    // Material lines
    for (const m of (matRows ?? [])) {
      const cost = Number(m.cost ?? 0);
      await db.execute(sql`
        INSERT INTO invoice_lines (invoice_id, description, quantity, unit, rate, amount, sort_order)
        VALUES (${invoiceId}, ${m.description as string}, 1, null, ${cost}, ${cost}, ${sortOrder++})
      `);
    }

    // Mark Job Card as invoiced and store the invoice link
    await db.execute(sql`
      UPDATE job_cards
      SET status = 'invoiced', invoice_id = ${invoiceId}, updated_at = NOW()
      WHERE id = ${id} AND company_id = ${profile.companyId}
    `);

    // Store source_job_card_id on the invoice for permanent back-link
    // (column added via startup migration — safe to attempt)
    try {
      await db.execute(sql`
        UPDATE invoices SET source_job_card_id = ${id} WHERE id = ${invoiceId}
      `);
    } catch { /* column may not exist on older DBs — non-fatal */ }

    res.status(201).json({ ok: true, invoiceId, invoiceNumber: invNumber });
  } catch (err) {
    console.error('POST /api/job-cards/:id/invoice error:', err);
    res.status(500).json({ error: 'Failed to generate invoice from job card' });
  }
}
