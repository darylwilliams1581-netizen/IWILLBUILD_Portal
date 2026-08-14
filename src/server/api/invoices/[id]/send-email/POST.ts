/**
 * POST /api/invoices/:id/send-email
 * Generates the invoice PDF and sends it via the Airo email gateway.
 *
 * Body: {
 *   to:        string[]
 *   cc?:       string[]
 *   bcc?:      string[]
 *   subject:   string
 *   message:   string
 *   attachPdf: boolean
 *   bccOwner:  boolean
 * }
 */
import type { Request, Response } from 'express';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../../../db/client.js';
import { profiles, user } from '../../../../db/schema.js';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { generateInvoicePdf } from '../../../../lib/pdf-generator.js';
import { sendEmail } from '../../../../email.js';

const MAX_SUBJECT = 200;
const MAX_MESSAGE = 4000;
const EMAIL_ATTACHMENT_LIMIT = 2 * 1024 * 1024;
const SYSTEM_FOOTER = 'This email was sent automatically from IWILLBUILD. Please do not reply.';

function isValidEmail(addr: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(addr.trim());
}

function dedupeLC(addrs: string[]): string[] {
  const seen = new Set<string>();
  return addrs.filter((a) => {
    const k = a.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c)
  );
}

function toLines(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === 'string').map((s) => s.trim()).filter(Boolean);
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

    // Resolve sender name
    const authorUser = await db.query.user.findFirst({ where: eq(user.id, session.user.id) });
    const senderName = authorUser?.name ?? session.user.email ?? 'Unknown';

    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid invoice ID' });

    // ── Parse + validate body ──────────────────────────────────────────────────
    const body = req.body as Record<string, unknown>;
    const toList  = dedupeLC(toLines(body.to));
    const ccList  = dedupeLC(toLines(body.cc));
    const bccList = dedupeLC(toLines(body.bcc));
    const subject  = typeof body.subject === 'string' ? body.subject.trim() : '';
    const message  = typeof body.message === 'string' ? body.message.trim() : '';
    const attachPdf = body.attachPdf !== false;
    const bccOwner  = body.bccOwner  !== false;

    if (toList.length === 0) return res.status(400).json({ error: 'At least one To recipient is required.' });
    for (const a of [...toList, ...ccList, ...bccList]) {
      if (!isValidEmail(a)) return res.status(400).json({ error: `"${a}" is not a valid email address.` });
    }
    if (!subject) return res.status(400).json({ error: 'Subject is required.' });
    if (subject.length > MAX_SUBJECT) return res.status(400).json({ error: `Subject must be ${MAX_SUBJECT} characters or fewer.` });
    if (!message) return res.status(400).json({ error: 'Message body is required.' });
    if (message.length > MAX_MESSAGE) return res.status(400).json({ error: `Message must be ${MAX_MESSAGE} characters or fewer.` });

    // ── Fetch invoice data ─────────────────────────────────────────────────────
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

    const [companyRows] = await db.execute(
      sql`SELECT name, abn, phone, email, address FROM companies WHERE id = ${profile.companyId} LIMIT 1`
    ) as unknown as [Array<Record<string, string>>, unknown];
    const company = companyRows?.[0] ?? {};

    const [settingsRows] = await db.execute(
      sql`SELECT pdf_json FROM company_settings WHERE company_id = ${profile.companyId} LIMIT 1`
    ) as unknown as [Array<{ pdf_json?: string }>, unknown];
    let pdfSettings: Record<string, string> = {};
    try {
      const raw = settingsRows?.[0]?.pdf_json;
      if (raw) pdfSettings = JSON.parse(raw) as Record<string, string>;
    } catch { /* ignore */ }

    // ── Generate PDF ───────────────────────────────────────────────────────────
    const pdfBytes = await generateInvoicePdf({
      id,
      invoice_number:      String(inv.invoice_number ?? ''),
      status:              String(inv.status ?? 'draft'),
      issue_date:          String(inv.issue_date ?? ''),
      due_date:            String(inv.due_date ?? ''),
      notes:               String(inv.notes ?? ''),
      payment_terms:       pdfSettings.paymentTerms ?? '',
      stripe_payment_link: String(inv.stripe_payment_link ?? ''),
      company_name:        String(company.name ?? ''),
      company_abn:         String(company.abn ?? ''),
      company_phone:       String(company.phone ?? ''),
      company_email:       String(company.email ?? ''),
      company_address:     String(company.address ?? ''),
      customer_name:       String(inv.customer_name ?? ''),
      customer_email:      String(inv.customer_email ?? ''),
      customer_phone:      String(inv.customer_phone ?? ''),
      customer_address:    String(inv.customer_address ?? ''),
      customer_abn:        String(inv.customer_abn ?? ''),
      job_name:            String(inv.job_name ?? ''),
      job_number:          String(inv.job_number ?? ''),
      job_address:         String(inv.job_address ?? ''),
      subtotal:            Number(inv.subtotal ?? 0),
      gst_total:           Number(inv.gst_amount ?? 0),
      total:               Number(inv.total ?? 0),
      amount_paid:         amtPaid,
      amount_due:          Math.max(0, Number(inv.total ?? 0) - amtPaid),
      lines: (lineRows ?? []).map((l) => ({
        description: String(l.description ?? ''),
        quantity:    Number(l.quantity ?? 1),
        unit_price:  Number(l.rate ?? l.unit_price ?? 0),
        amount:      Number(l.amount ?? 0),
        gst_amount:  Number(l.gst_amount ?? 0),
        sort_order:  Number(l.sort_order ?? 0),
      })),
    });

    if (attachPdf && pdfBytes.length > EMAIL_ATTACHMENT_LIMIT) {
      return res.status(413).json({ error: 'The invoice PDF exceeds the 2 MB email attachment limit.' });
    }

    // ── Resolve owner BCC ──────────────────────────────────────────────────────
    let ownerBcced = false;
    let finalBcc = [...bccList];
    if (bccOwner) {
      const [ownerRows] = await db.execute(sql`
        SELECT u.email FROM profiles p
        JOIN users u ON u.id = p.user_id
        WHERE p.company_id = ${profile.companyId} AND p.role = 'owner'
        LIMIT 1
      `) as unknown as [Array<{ email?: string }>, unknown];
      const ownerEmail = String(ownerRows?.[0]?.email ?? '').trim();
      if (ownerEmail && isValidEmail(ownerEmail)) {
        const allRecipients = [...toList, ...ccList, ...finalBcc].map((a) => a.toLowerCase());
        if (!allRecipients.includes(ownerEmail.toLowerCase())) {
          finalBcc = dedupeLC([...finalBcc, ownerEmail]);
          ownerBcced = true;
        }
      }
    }

    // ── Build email body ───────────────────────────────────────────────────────
    const fullText = `${message}\n\n—\n${SYSTEM_FOOTER}`;
    const escapedMessage = escapeHtml(message).replace(/\n/g, '<br>');
    const companyName = String(company.name ?? 'IWILLBUILD');
    const invNum = inv.invoice_number ? String(inv.invoice_number) : `#${id}`;

    const html = `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1e293b">
      <div style="max-width:560px;margin:24px auto">
        <div style="background:#7c3aed;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0">
          <strong style="font-size:18px">${escapeHtml(companyName)}</strong>
          <div style="font-size:12px;opacity:.85;margin-top:4px">Invoice ${escapeHtml(invNum)}</div>
        </div>
        <div style="border:1px solid #e2e8f0;border-top:0;padding:24px;border-radius:0 0 12px 12px">
          <p style="white-space:pre-line">${escapedMessage}</p>
        </div>
        <div style="background:#f1f5f9;padding:12px 24px">
          <p style="margin:0;font-size:11px;color:#94a3b8;font-style:italic">${escapeHtml(SYSTEM_FOOTER)}</p>
        </div>
      </div>
    </body></html>`;

    const filename = `invoice-${invNum.replace(/[^a-z0-9_\-]/gi, '-')}.pdf`;

    const result = await sendEmail({
      to: toList,
      cc: ccList.length ? ccList : undefined,
      bcc: finalBcc.length ? finalBcc : undefined,
      subject,
      text: fullText,
      html,
      fromName: companyName,
      attachments: attachPdf
        ? [{ filename, content: Buffer.from(pdfBytes), contentType: 'application/pdf' }]
        : undefined,
    });

    // ── Audit note on the linked job ───────────────────────────────────────────
    const jobId = inv.job_id ? Number(inv.job_id) : null;
    if (jobId) {
      try {
        const toStr = toList.join(', ');
        const ccStr = ccList.length ? ccList.join(', ') : 'None';
        const bccStr = ownerBcced ? 'Owner' : 'None';
        const bodyPreview = message.length > 120 ? `${message.slice(0, 117)}…` : message;
        const now = new Date().toLocaleString('en-AU', {
          day: 'numeric', month: 'short', year: 'numeric',
          hour: '2-digit', minute: '2-digit', timeZone: 'Australia/Brisbane',
        });
        const attachment = attachPdf ? 'Invoice PDF' : 'None';
        const noteBody = [
          `Email sent – Invoice ${invNum}`,
          `To: ${toStr}`, `Cc: ${ccStr}`, `BCC: ${bccStr}`,
          `Sent by: ${senderName}`, now,
          `Subject: ${subject}`, `Body: ${bodyPreview}`,
          `Attachment: ${attachment}`, 'Status: Accepted', `Ref: ${result.messageId}`,
        ].join(' | ');

        const authorIdEsc = session.user.id.replace(/'/g, "''");
        const authorNameEsc = senderName.replace(/'/g, "''");
        const bodyEsc = noteBody.replace(/'/g, "''");
        const companyNameEsc = companyName.replace(/'/g, "''");

        await db.execute(sql.raw(
          `INSERT INTO entity_notes (company_id, entity_type, entity_id, entity_label, note_type, body, author_user_id, author_name, mentions_json)
           VALUES (${profile.companyId}, 'job', ${jobId}, '${companyNameEsc}', 'note', '${bodyEsc}', '${authorIdEsc}', '${authorNameEsc}', '[]')`
        ));
      } catch (noteErr) {
        console.warn('POST /api/invoices/:id/send-email — note creation failed (non-fatal):', noteErr);
      }
    }

    return res.json({ ok: true, messageId: result.messageId, attachedPdf: attachPdf, ownerBcced, senderName });
  } catch (err) {
    console.error('POST /api/invoices/:id/send-email error:', err);
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
}
