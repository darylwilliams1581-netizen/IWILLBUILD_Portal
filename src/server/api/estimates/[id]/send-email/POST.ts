/**
 * POST /api/estimates/:id/send-email
 * Generates the canonical quote PDF and sends it via the Airo email gateway.
 *
 * Body: {
 *   to:        string[]   — at least one recipient
 *   cc?:       string[]
 *   bcc?:      string[]
 *   subject:   string
 *   message:   string     — editable body; system footer appended server-side
 *   attachPdf: boolean    — attach the PDF when true
 *   bccOwner:  boolean    — resolve and BCC the company owner when true
 * }
 */
import type { Request, Response } from 'express';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../../../db/client.js';
import { profiles, user } from '../../../../db/schema.js';
import { sendEmail } from '../../../../email.js';
import { buildEstimatePdfDocument } from '../../../../lib/estimate-pdf-document.js';
import { getAuth } from '../../../../../lib/auth/auth.js';

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
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) headers.set(key, Array.isArray(value) ? value[0] : value);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });
    if (profile.permEstimating === false && profile.role !== 'owner' && profile.role !== 'admin') {
      return res.status(403).json({ error: 'No estimating permission' });
    }

    // Resolve sender name
    const authorUser = await db.query.user.findFirst({ where: eq(user.id, session.user.id) });
    const senderName = authorUser?.name ?? session.user.email ?? 'Unknown';

    const estimateId = Number(req.params.id);
    if (!Number.isInteger(estimateId)) return res.status(400).json({ error: 'Invalid quote ID' });

    // ── Parse + validate body ──────────────────────────────────────────────────
    const body = req.body as Record<string, unknown>;
    const toList  = dedupeLC(toLines(body.to));
    const ccList  = dedupeLC(toLines(body.cc));
    const bccList = dedupeLC(toLines(body.bcc));
    const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
    const message = typeof body.message === 'string' ? body.message.trim() : '';
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

    // ── Build PDF ──────────────────────────────────────────────────────────────
    const document = await buildEstimatePdfDocument(profile.companyId, estimateId);
    if (!document) return res.status(404).json({ error: 'Quote not found' });

    if (attachPdf && document.pdfBytes.length > EMAIL_ATTACHMENT_LIMIT) {
      return res.status(413).json({ error: 'The quote PDF exceeds the 2 MB email attachment limit.' });
    }

    // ── Resolve owner BCC ──────────────────────────────────────────────────────
    let ownerBcced = false;
    let finalBcc = [...bccList];
    if (bccOwner) {
      const [ownerRows] = await db.execute(sql`
        SELECT u.email FROM profiles p
        JOIN user u ON u.id = p.user_id
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
    const html = `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1e293b">
      <div style="max-width:560px;margin:24px auto">
        <div style="background:#7c3aed;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0">
          <strong style="font-size:18px">${escapeHtml(document.companyName)}</strong>
          <div style="font-size:12px;opacity:.85;margin-top:4px">Quote #${document.estimateId}</div>
        </div>
        <div style="border:1px solid #e2e8f0;border-top:0;padding:24px;border-radius:0 0 12px 12px">
          <p style="white-space:pre-line">${escapedMessage}</p>
        </div>
        <div style="background:#f1f5f9;padding:12px 24px;border-radius:0 0 12px 12px;margin-top:0">
          <p style="margin:0;font-size:11px;color:#94a3b8;font-style:italic">${escapeHtml(SYSTEM_FOOTER)}</p>
        </div>
      </div>
    </body></html>`;

    // ── Send ───────────────────────────────────────────────────────────────────
    const result = await sendEmail({
      to: toList,
      cc: ccList.length ? ccList : undefined,
      bcc: finalBcc.length ? finalBcc : undefined,
      subject,
      text: fullText,
      html,
      fromName: document.companyName,
      attachments: attachPdf
        ? [{ filename: document.filename, content: Buffer.from(document.pdfBytes), contentType: 'application/pdf' }]
        : undefined,
    });

    // ── Audit note on the linked job ───────────────────────────────────────────
    // Fetch jobId directly from the estimate record
    try {
      const [estRows] = await db.execute(sql`
        SELECT job_id FROM estimates WHERE id = ${estimateId} AND company_id = ${profile.companyId} LIMIT 1
      `) as unknown as [Array<{ job_id?: number | null }>, unknown];
      const jobId = estRows?.[0]?.job_id ?? null;
      if (jobId) {
        const toStr = toList.join(', ');
        const ccStr = ccList.length ? ccList.join(', ') : 'None';
        const bccStr = ownerBcced ? 'Owner' : 'None';
        const bodyPreview = message.length > 120 ? `${message.slice(0, 117)}…` : message;
        const now = new Date().toLocaleString('en-AU', {
          day: 'numeric', month: 'short', year: 'numeric',
          hour: '2-digit', minute: '2-digit', timeZone: 'Australia/Brisbane',
        });
        const attachment = attachPdf ? 'Quote PDF' : 'None';
        const noteBody = [
          `Email sent – Quote #${estimateId}`,
          `To: ${toStr}`, `Cc: ${ccStr}`, `BCC: ${bccStr}`,
          `Sent by: ${senderName}`, now,
          `Subject: ${subject}`, `Body: ${bodyPreview}`,
          `Attachment: ${attachment}`, 'Status: Accepted', `Ref: ${result.messageId}`,
        ].join(' | ');

        const authorIdEsc = session.user.id.replace(/'/g, "''");
        const authorNameEsc = senderName.replace(/'/g, "''");
        const bodyEsc = noteBody.replace(/'/g, "''");
        const companyNameEsc = document.companyName.replace(/'/g, "''");

        await db.execute(sql.raw(
          `INSERT INTO entity_notes (company_id, entity_type, entity_id, entity_label, note_type, body, author_user_id, author_name, mentions_json)
           VALUES (${profile.companyId}, 'job', ${jobId}, '${companyNameEsc}', 'note', '${bodyEsc}', '${authorIdEsc}', '${authorNameEsc}', '[]')`
        ));
      }
    } catch (noteErr) {
      console.warn('POST /api/estimates/:id/send-email — note creation failed (non-fatal):', noteErr);
    }

    return res.json({ ok: true, messageId: result.messageId, attachedPdf: attachPdf, ownerBcced, senderName });
  } catch (error) {
    console.error('POST /api/estimates/:id/send-email error:', error);
    const message = error instanceof Error ? error.message : 'Failed to send quote email';
    return res.status(500).json({ error: message });
  }
}
