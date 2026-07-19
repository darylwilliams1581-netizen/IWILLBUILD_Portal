/**
 * POST /api/invoices/:id/send-email
 * Generates the invoice PDF and sends it to the customer (or a supplied address)
 * as an email attachment via the Airo email gateway.
 *
 * Body: { to?: string }  — optional override; falls back to customer email on record
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { generateInvoicePdf } from '../../../../lib/pdf-generator.js';
import { sendEmail } from '../../../../email.js';

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

    // Generate PDF
    const pdfBytes = await generateInvoicePdf({
      id,
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
      gst_total:            Number(inv.gst_amount ?? 0),
      total:                Number(inv.total ?? 0),
      amount_paid:          amtPaid,
      amount_due:           Math.max(0, Number(inv.total ?? 0) - amtPaid),
      lines: (lineRows ?? []).map((l) => ({
        description: String(l.description ?? ''),
        quantity:    Number(l.quantity ?? 1),
        unit_price:  Number(l.rate ?? l.unit_price ?? 0),
        amount:      Number(l.amount ?? 0),
        gst_amount:  Number(l.gst_amount ?? 0),
        sort_order:  Number(l.sort_order ?? 0),
      })),
    });

    // Resolve recipient
    const toOverride = typeof req.body?.to === 'string' ? req.body.to.trim() : '';
    const toAddress  = toOverride || String(inv.customer_email ?? '');
    if (!toAddress) return res.status(400).json({ error: 'No recipient email address. Please enter an email address or add one to the customer record.' });

    const invNum      = inv.invoice_number ? String(inv.invoice_number) : `#${id}`;
    const customerName = inv.customer_name ? String(inv.customer_name) : '';
    const dueDate     = inv.due_date ? new Date(String(inv.due_date)).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
    const total       = Number(inv.total ?? 0).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
    const companyName = String(company.name ?? 'IWILLBUILD');

    const subject = `Invoice ${invNum}${customerName ? ` — ${customerName}` : ''}`;

    const textLines = [
      `Hi${customerName ? ` ${customerName}` : ''},`,
      '',
      `Please find your invoice attached.`,
      '',
      `─────────────────────────────────────`,
      `Invoice No:  ${invNum}`,
      ...(total    ? [`Amount:      ${total}`]    : []),
      ...(dueDate  ? [`Due Date:    ${dueDate}`]  : []),
      `─────────────────────────────────────`,
      '',
      `Please don't hesitate to contact us if you have any questions.`,
      '',
      `Kind regards,`,
      companyName,
    ];

    const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1e293b;background:#f8fafc;margin:0;padding:0">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08)">
    <div style="background:#f97316;padding:24px 32px">
      <p style="margin:0;font-size:20px;font-weight:800;color:#fff">${companyName}</p>
      <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,.85)">Tax Invoice</p>
    </div>
    <div style="padding:32px">
      <p style="margin:0 0 16px;font-size:15px">Hi${customerName ? ` ${customerName}` : ''},</p>
      <p style="margin:0 0 24px;font-size:14px;color:#475569">Please find your invoice attached to this email.</p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;margin-bottom:24px">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <tr><td style="color:#64748b;padding:4px 0">Invoice No</td><td style="text-align:right;font-weight:600">${invNum}</td></tr>
          ${total   ? `<tr><td style="color:#64748b;padding:4px 0">Amount</td><td style="text-align:right;font-weight:700;color:#f97316;font-size:15px">${total}</td></tr>` : ''}
          ${dueDate ? `<tr><td style="color:#64748b;padding:4px 0">Due Date</td><td style="text-align:right;font-weight:600">${dueDate}</td></tr>` : ''}
        </table>
      </div>
      <p style="margin:0 0 8px;font-size:13px;color:#475569">Please don't hesitate to contact us if you have any questions.</p>
      <p style="margin:0;font-size:13px;color:#475569">Kind regards,<br><strong>${companyName}</strong></p>
    </div>
    <div style="background:#f1f5f9;padding:16px 32px;text-align:center">
      <p style="margin:0;font-size:11px;color:#94a3b8">Sent from IWILLBUILD — iwillbuild.com</p>
    </div>
  </div>
</body>
</html>`;

    const filename = `invoice-${invNum.replace(/[^a-z0-9_\-]/gi, '-')}.pdf`;

    await sendEmail({
      to:          toAddress,
      subject,
      text:        textLines.join('\n'),
      html:        htmlBody,
      fromName:    companyName,
      attachments: [{ filename, content: Buffer.from(pdfBytes), contentType: 'application/pdf' }],
    });

    return res.json({ ok: true, to: toAddress });
  } catch (err) {
    console.error('POST /api/invoices/:id/send-email error:', err);
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
}
