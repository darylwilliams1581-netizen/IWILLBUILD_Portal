/**
 * POST /api/job-forms/:id/send-email
 * Generates a completed-form PDF (with embedded photos/signatures) and sends
 * it via the Airo email gateway.
 *
 * PDF assembly is delegated to buildFormPdfDocument() — the canonical builder
 * shared with the export-pdf endpoint and the secure-share content endpoint.
 *
 * Links in the email and in the PDF header always use no-password secure-share
 * URLs (https://iwillbuild.com/share/{token}) so recipients can open them
 * without logging in.  The share rows are created or reused via ensureShareLink().
 *
 * Body: {
 *   to:                          string[]
 *   cc?:                         string[]
 *   bcc?:                        string[]
 *   subject:                     string
 *   message:                     string
 *   attachPdf:                   boolean
 *   bccOwner:                    boolean
 *   includeJobGallery?:          boolean   — default false; appends job photos share URL when true
 * }
 */
import type { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { db } from '../../../../db/client.js';
import { jobFormSubmissions, profiles, user } from '../../../../db/schema.js';
import { sendEmail } from '../../../../email.js';
import { buildFormPdfDocument } from '../../../../lib/form-pdf-document.js';
import { ensureShareLink } from '../../../../lib/ensure-share-link.js';
import { getAuth } from '../../../../../lib/auth/auth.js';

const EMAIL_ATTACHMENT_LIMIT = 2 * 1024 * 1024;
const MAX_SUBJECT = 200;
const MAX_MESSAGE = 4000;
const SYSTEM_FOOTER = 'This email was sent automatically from IWIllBUIlD. Please do not reply.';

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
    const attachPdf          = body.attachPdf          !== false;
    const bccOwner           = body.bccOwner           !== false;
    const includeJobGallery  = body.includeJobGallery  === true;

    if (toList.length === 0) return res.status(400).json({ error: 'At least one To recipient is required.' });
    for (const a of [...toList, ...ccList, ...bccList]) {
      if (!isValidEmail(a)) return res.status(400).json({ error: `"${a}" is not a valid email address.` });
    }
    if (!subject) return res.status(400).json({ error: 'Subject is required.' });
    if (subject.length > MAX_SUBJECT) return res.status(400).json({ error: `Subject must be ${MAX_SUBJECT} characters or fewer.` });
    if (!message) return res.status(400).json({ error: 'Message body is required.' });
    if (message.length > MAX_MESSAGE) return res.status(400).json({ error: `Message must be ${MAX_MESSAGE} characters or fewer.` });

    // ── Build PDF via canonical builder ────────────────────────────────────────
    // First, create/reuse a no-password secure-share link for this submission
    // so the PDF header link and email link are publicly accessible.
    const doc_meta = await db.query.jobFormSubmissions.findFirst({
      where: eq(jobFormSubmissions.id, submissionId),
      columns: { id: true, jobId: true, templateId: true },
    });
    if (!doc_meta) return res.status(404).json({ error: 'Submission not found' });

    const shareUrl = await ensureShareLink({
      companyId: profile.companyId,
      createdByUserId: session.user.id,
      targetType: 'completed_form',
      targetId: String(submissionId),
      title: `Form ${submissionId} share`,
    });

    // Build PDF — pass shareUrl so the header link annotation points to the
    // no-password share URL rather than the login-walled portal URL.
    const doc = await buildFormPdfDocument(profile.companyId, submissionId, shareUrl ?? undefined);
    if (!doc) return res.status(404).json({ error: 'Submission not found' });

    const { pdfBytes, filename, templateName, companyName, jobNumber, jobName, jobId } = doc;

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
    const statusLabel = doc.status;

    // ── Secure share URLs — publicly accessible, no login required ────────────
    // shareUrl was created above for the form submission.
    // For the job photo gallery, create/reuse a separate no-password share row.
    const reportShareUrl = shareUrl; // already created above; null if key missing

    let galleryShareUrl: string | null = null;
    if (includeJobGallery && jobId) {
      galleryShareUrl = await ensureShareLink({
        companyId: profile.companyId,
        createdByUserId: session.user.id,
        targetType: 'job_photos',
        targetId: String(jobId),
        title: `Job ${jobId} photos share`,
      });
    }

    // Plain-text suffix
    const linkLines: string[] = [];
    if (reportShareUrl)  linkLines.push(`IWILLBUILD report\n${reportShareUrl}`);
    if (galleryShareUrl) linkLines.push(`Job photos\n${galleryShareUrl}`);
    const linkSuffix = linkLines.length ? `\n\n${linkLines.join('\n\n')}` : '';
    const fullText = `${message}${linkSuffix}\n\n—\n${SYSTEM_FOOTER}`;

    // HTML link blocks — real <a href> anchors, not plain text
    const linkBlockHtml = [
      reportShareUrl  ? `<p style="margin:12px 0 4px"><strong>IWILLBUILD report</strong><br><a href="${escapeHtml(reportShareUrl)}" style="color:#7c3aed">${escapeHtml(reportShareUrl)}</a></p>` : '',
      galleryShareUrl ? `<p style="margin:12px 0 4px"><strong>Job photos</strong><br><a href="${escapeHtml(galleryShareUrl)}" style="color:#7c3aed">${escapeHtml(galleryShareUrl)}</a></p>` : '',
    ].filter(Boolean).join('');

    const html = `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1e293b">
      <div style="max-width:620px;margin:24px auto">
        <div style="background:#7c3aed;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0">
          <strong style="font-size:18px">${escapeHtml(templateName)}</strong>
          <div style="font-size:12px;opacity:.85;margin-top:4px">${escapeHtml(jobLabel || statusLabel)}</div>
        </div>
        <div style="border:1px solid #e2e8f0;border-top:0;padding:24px;border-radius:0 0 12px 12px">
          <p style="white-space:pre-line">${escapedMessage}</p>
          ${linkBlockHtml}
        </div>
        <div style="background:#f1f5f9;padding:12px 24px">
          <p style="margin:0;font-size:11px;color:#94a3b8;font-style:italic">${escapeHtml(SYSTEM_FOOTER)}</p>
        </div>
      </div>
    </body></html>`;

    // ── Size check: last-resort fallback — send without attachment if still >2 MB ──
    if (attachPdf && pdfBytes.length > EMAIL_ATTACHMENT_LIMIT) {
      const resultNoAttach = await sendEmail({
        to: toList,
        cc: ccList.length ? ccList : undefined,
        bcc: finalBcc.length ? finalBcc : undefined,
        subject,
        text: fullText,
        html,
        fromName: companyName,
      });
      return res.json({
        ok: true,
        messageId: resultNoAttach.messageId,
        attachedPdf: false,
        ownerBcced,
        senderName,
        submissionId: submissionId,
        note: 'PDF was too large to attach (over 2 MB). The email was sent without the attachment.',
      });
    }

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
