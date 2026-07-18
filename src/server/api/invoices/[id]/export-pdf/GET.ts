/**
 * GET /api/invoices/:id/export-pdf
 * Generates and streams a Tax Invoice PDF using pdf-lib (Alpine-safe).
 * Includes company branding, customer details, line items, totals, and Stripe payment link.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { generateInvoicePdf } from '../../../../lib/pdf-generator.js';

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
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid invoice ID' });

    // Full invoice with customer + job join
    const [rows] = await db.execute(sql`
      SELECT i.*,
             j.name as job_name, j.job_number, j.address as job_address,
             c.name as customer_name, c.contact_person as customer_contact,
             c.email as customer_email, c.phone as customer_phone,
             c.address as customer_address, c.abn as customer_abn
      FROM invoices i
      LEFT JOIN jobs j ON j.id = i.job_id AND j.company_id = i.company_id
      LEFT JOIN customers c ON c.id = i.customer_id AND c.company_id = i.company_id
      WHERE i.id = ${id} AND i.company_id = ${profile.companyId}
      LIMIT 1
    `) as unknown as [Array<Record<string, unknown>>, unknown];

    if (!rows?.length) return res.status(404).json({ error: 'Invoice not found' });
    const inv = rows[0];

    const [lineRows] = await db.execute(
      sql`SELECT * FROM invoice_lines WHERE invoice_id = ${id} ORDER BY sort_order ASC, id ASC`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    const [paymentRows] = await db.execute(
      sql`SELECT SUM(amount) as total_paid FROM invoice_payments WHERE invoice_id = ${id}`
    ) as unknown as [Array<{ total_paid?: number }>, unknown];
    const amtPaid = Number(paymentRows?.[0]?.total_paid ?? 0);

    // Company details
    const [companyRows] = await db.execute(
      sql`SELECT name, abn, phone, email, address FROM companies WHERE id = ${profile.companyId} LIMIT 1`
    ) as unknown as [Array<Record<string, string>>, unknown];
    const company = companyRows?.[0] ?? {};

    // PDF branding settings
    const [settingsRows] = await db.execute(
      sql`SELECT pdf_json FROM company_settings WHERE company_id = ${profile.companyId} LIMIT 1`
    ) as unknown as [Array<{ pdf_json?: string }>, unknown];
    let pdfSettings: Record<string, string> = {};
    try {
      const raw = settingsRows?.[0]?.pdf_json;
      if (raw) pdfSettings = JSON.parse(raw) as Record<string, string>;
    } catch { /* ignore */ }

    const pdfBytes = await generateInvoicePdf({
      id:                   id,
      invoice_number:       String(inv.invoice_number ?? ''),
      status:               String(inv.status ?? 'draft'),
      issue_date:           String(inv.issue_date ?? ''),
      due_date:             String(inv.due_date ?? ''),
      notes:                String(inv.notes ?? ''),
      payment_terms:        pdfSettings.paymentTerms ?? '',
      stripe_payment_link:  String(inv.stripe_payment_link ?? ''),
      company_name:         String(company.name ?? ''),
      company_abn:          String(company.abn ?? ''),
      company_phone:        String(company.phone ?? ''),
      company_email:        String(company.email ?? ''),
      company_address:      String(company.address ?? ''),
      customer_name:        String(inv.customer_name ?? ''),
      customer_email:       String(inv.customer_email ?? ''),
      customer_phone:       String(inv.customer_phone ?? ''),
      customer_address:     String(inv.customer_address ?? ''),
      customer_abn:         String(inv.customer_abn ?? ''),
      job_name:             String(inv.job_name ?? ''),
      job_number:           String(inv.job_number ?? ''),
      job_address:          String(inv.job_address ?? ''),
      subtotal:             Number(inv.subtotal ?? 0),
      gst_total:            Number(inv.gst_amount ?? 0),  // DB column is gst_amount
      total:                Number(inv.total ?? 0),
      amount_paid:          amtPaid,
      amount_due:           Math.max(0, Number(inv.total ?? 0) - amtPaid),
      lines: (lineRows ?? []).map((l) => ({
        description: String(l.description ?? ''),
        quantity:    Number(l.quantity ?? 1),
        unit_price:  Number(l.rate ?? l.unit_price ?? 0),   // DB column is rate
        amount:      Number(l.amount ?? 0),
        gst_amount:  Number(l.gst_amount ?? 0),
        sort_order:  Number(l.sort_order ?? 0),
      })),
    });

    const invNum = inv.invoice_number ? String(inv.invoice_number) : String(id);
    const filename = `invoice-${invNum}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBytes.length);
    res.end(Buffer.from(pdfBytes));
  } catch (err) {
    console.error('GET /api/invoices/:id/export-pdf error:', err);
    res.status(500).json({ error: 'Failed to generate invoice PDF' });
  }
}
