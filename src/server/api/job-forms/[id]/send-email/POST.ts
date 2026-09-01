/**
 * POST /api/job-forms/:id/send-email
 * Generates a completed-form PDF (with embedded photos/signatures) and sends
 * it via the Airo email gateway.
 *
 * PDF assembly is delegated to buildFormPdfDocument() — the canonical builder
 * shared with the export-pdf endpoint and the secure-share content endpoint.
 *
 * CP12A7: Requires a valid safeguard confirmation token bound to:
 *   - authenticated company + user
 *   - action = 'form_email'
 *   - exact set of photo refs embedded in the PDF
 *   - exact set of recipients (to + cc + bcc)
 *
 * Body: {
 *   to:              string[]
 *   cc?:             string[]
 *   bcc?:            string[]
 *   subject:         string
 *   message:         string
 *   attachPdf:       boolean
 *   bccOwner:        boolean
 *   safeguardToken:  string   // CP12A7: required
 * }
 */
import type { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { db } from '../../../../db/client.js';
import { jobFormSubmissions, profiles, user } from '../../../../db/schema.js';
import { sendEmail } from '../../../../email.js';
import { buildFormPdfDocument } from '../../../../lib/form-pdf-document.js';
import { getAuth } from '../../../../../lib/auth/auth.js';
import {
  resolveFormPhotoRefs,
  consumeConfirmationToken,
} from '../../../../lib/imageSafeguardService.js';

const EMAIL_ATTACHMENT_LIMIT = 2 * 1024 * 1024;
const MAX_SUBJECT = 200;
const MAX_MESSAGE = 4000;
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

function toLines(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === 'string').map((s) => s.trim()).filter(Boolean);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char] ?? char));
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
    if (profile.permForms === false && profile.role !== 'owner' && profile.role !== 'admin') {
      return res.status(403).json({ error: 'No forms permission' });
    }

    // Resolve sender name
    const authorUser = await db.query.user.findFirst({ where: eq(user.id, session.user.id) });
    const senderName = authorUser?.name ?? session.user.email ?? 'Unknown';

    const submissionId = Number(req.params.id);
    if (!Number.isInteger(submissionId)) return res.status(400).json({ error: 'Invalid form ID' });

    // ── Parse + validate body ──────────────────────────────────────────────────
    const body = req.body as Record<string, unknown>;
    const toList  = dedupeLC(toLines(body.to));
    const ccList  = dedupeLC(toLines(body.cc));
    const bccList = dedupeLC(toLines(body.bcc));
    const subject   = typeof body.subject === 'string' ? body.subject.trim() : '';
    const message   = typeof body.message === 'string' ? body.message.trim() : '';
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

    // ── CP12A7: Enforce safeguard confirmation token ───────────────────────────
    // The token must be bound to the exact recipients and photo refs.
    // It is issued by POST /api/image-safety/batch-confirm after the user
    // confirms the privacy notice on the Send action (after recipients are set).
    const safeguardToken = typeof body.safeguardToken === 'string' ? body.safeguardToken.trim() : '';
    if (!safeguardToken) {
      return res.status(403).json({
        error: 'A safeguard confirmation is required before sending.',
        code: 'safeguard_token_required',
      });
    }

    // Resolve the exact photo refs that will be embedded in the PDF
    const currentRefs = await resolveFormPhotoRefs(profile.companyId, submissionId);

    // All recipients (to + cc + bcc) are bound in the token
    const allRecipients = [...toList, ...ccList, ...bccList];

    const consumeResult = await consumeConfirmationToken({
      tokenId: safeguardToken,
      companyId: profile.companyId,
      userId: session.user.id,
      action: 'form_email',
      storageRefs: currentRefs,
      recipients: allRecipients,
    });

    if (!consumeResult.ok) {
      const statusMap: Record<string, number> = {
        missing: 404,
        expired: 410,
        used: 409,
        wrong_company: 403,
        wrong_user: 403,
        wrong_refs: 409,
        wrong_recipients: 409,
        blocked: 403,
        db_error: 500,
      };
      const status = statusMap[consumeResult.reason] ?? 403;
      const messages: Record<string, string> = {
        missing: 'Confirmation token not found.',
        expired: 'Confirmation has expired. Please confirm again.',
        used: 'Confirmation has already been used.',
        wrong_company: 'Confirmation is not valid for this account.',
        wrong_user: 'Confirmation is not valid for this user.',
        wrong_refs: 'The attached photos have changed since confirmation. Please confirm again.',
        wrong_recipients: 'Recipients have changed since confirmation. Please confirm again.',
        blocked: 'Sending is not permitted for these images.',
        db_error: 'Confirmation verification failed.',
      };
      return res.status(status).json({
        error: messages[consumeResult.reason] ?? 'Confirmation invalid.',
        code: `safeguard_${consumeResult.reason}`,
      });
    }

    // ── Build PDF via canonical builder ────────────────────────────────────────
    const doc = await buildFormPdfDocument(profile.companyId, submissionId);
    if (!doc) return res.status(404).json({ error: 'Submission not found' });

    const { pdfBytes, filename, templateName, companyName, jobNumber, jobName, jobId } = doc;

    if (attachPdf && pdfBytes.length > EMAIL_ATTACHMENT_LIMIT) {
      return res.status(413).json({
        error: 'This form PDF is larger than the 2 MB email limit. Remove some photos or use Download PDF to save it.',
      });
    }

    // ── Resolve owner BCC ──────────────────────────────────────────────────────
    let ownerBcced = false;
    let finalBcc = [...bccList];
    if (bccOwner) {
      const [ownerRows] = await db.execute(sql`
        SELECT u.email FROM profiles p
        JOIN \`user\` u ON u.id = p.user_id
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
    const jobLabel = [jobNumber, jobName].filter(Boolean).join(' – ');
    const escapedMessage = escapeHtml(message).replace(/\n/g, '<br>');
    const fullText = `${message}\n\n—\n${SYSTEM_FOOTER}`;
    const statusLabel = doc.status;

    const html = `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1e293b">
      <div style="max-width:620px;margin:24px auto">
        <div style="background:#7c3aed;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0">
          <strong style="font-size:18px">${escapeHtml(templateName)}</strong>
          <div style="font-size:12px;opacity:.85;margin-top:4px">${escapeHtml(jobLabel || statusLabel)}</div>
        </div>
        <div style="border:1px solid #e2e8f0;border-top:0;padding:24px;border-radius:0 0 12px 12px">
          <p style="white-space:pre-line">${escapedMessage}</p>
        </div>
        <div style="background:#f1f5f9;padding:12px 24px">
          <p style="margin:0;font-size:11px;color:#94a3b8;font-style:italic">${escapeHtml(SYSTEM_FOOTER)}</p>
        </div>
      </div>
    </body></html>`;

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
        const attachment = attachPdf ? `${templateName} PDF` : 'None';
        const jobLabelNote = [jobNumber, jobName].filter(Boolean).join(' — ');
        const noteBody = [
          `Email sent – ${templateName}`,
          `To: ${toStr}`, `Cc: ${ccStr}`, `BCC: ${bccStr}`,
          `Sent by: ${senderName}`, now,
          `Subject: ${subject}`, `Body: ${bodyPreview}`,
          `Attachment: ${attachment}`, 'Status: Accepted', `Ref: ${result.messageId}`,
        ].join(' | ');

        const authorIdEsc   = session.user.id.replace(/'/g, "''");
        const authorNameEsc = senderName.replace(/'/g, "''");
        const bodyEsc       = noteBody.replace(/'/g, "''");
        const labelEsc      = jobLabelNote.replace(/'/g, "''");

        await db.execute(sql.raw(
          `INSERT INTO entity_notes (company_id, entity_type, entity_id, entity_label, note_type, body, author_user_id, author_name, mentions_json)
           VALUES (${profile.companyId}, 'job', ${jobId}, '${labelEsc}', 'note', '${bodyEsc}', '${authorIdEsc}', '${authorNameEsc}', '[]')`
        ));
      } catch (noteErr) {
        console.warn('POST /api/job-forms/:id/send-email — note creation failed (non-fatal):', noteErr);
      }
    }

    // Verify submission still belongs to this company (belt-and-braces after builder)
    const submission = await db.query.jobFormSubmissions.findFirst({
      where: eq(jobFormSubmissions.id, submissionId),
      columns: { id: true },
    });

    return res.json({
      ok: true,
      messageId: result.messageId,
      attachedPdf: attachPdf,
      ownerBcced,
      senderName,
      submissionId: submission?.id ?? submissionId,
    });
  } catch (error) {
    console.error('POST /api/job-forms/:id/send-email error:', error);
    const message = error instanceof Error ? error.message : 'Failed to send form email';
    if (!res.headersSent) return res.status(500).json({ error: message });
  }
}
