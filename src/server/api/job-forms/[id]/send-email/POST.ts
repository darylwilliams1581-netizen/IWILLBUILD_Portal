/**
 * POST /api/job-forms/:id/send-email
 * Generates a completed-form PDF (with embedded photos/signatures) and sends
 * it via the Airo email gateway.
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
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../../../db/client.js';
import {
  companyFiles,
  formFields,
  formTemplates,
  jobFormSubmissions,
  jobs,
  profiles,
  user,
} from '../../../../db/schema.js';
import { sendEmail } from '../../../../email.js';
import { generateFormSubmissionPdf, type FormPdfImage } from '../../../../lib/form-pdf-generator.js';
import {
  BUCKET_COMPANY_FILES,
  generateThumbnail,
  getDownloadBuffer,
} from '../../../../storage/storage-service.js';
import { getAuth } from '../../../../../lib/auth/auth.js';

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

function answerUrls(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [value];
  } catch {
    return [value];
  }
}

function fileIdFromUrl(value: string): number | null {
  const match = value.match(/(?:^|\/)api\/files\/(\d+)\/download(?:\?|$)/i);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isInteger(id) ? id : null;
}

function signatureDataUrls(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  const answer = value as Record<string, unknown>;
  const urls: string[] = [];
  if (typeof answer.signatureDataUrl === 'string') urls.push(answer.signatureDataUrl);
  if (Array.isArray(answer.signers)) {
    for (const signer of answer.signers) {
      if (signer && typeof signer === 'object') {
        const dataUrl = (signer as Record<string, unknown>).signatureDataUrl;
        if (typeof dataUrl === 'string') urls.push(dataUrl);
      }
    }
  }
  return urls;
}

function imageFromDataUrl(dataUrl: string): FormPdfImage | null {
  const match = dataUrl.match(/^data:(image\/(?:png|jpe?g));base64,([a-z0-9+/=\s]+)$/i);
  if (!match) return null;
  try {
    return { bytes: Uint8Array.from(Buffer.from(match[2], 'base64')), mimeType: match[1].toLowerCase() };
  } catch {
    return null;
  }
}

function displayValue(fieldType: string, value: unknown): string {
  const empty = value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
  if (empty) return '(no answer)';
  if (fieldType === 'photo') {
    const count = answerUrls(value).length;
    return `${count} photo${count === 1 ? '' : 's'} included in the attached PDF`;
  }
  if (fieldType === 'signature') return 'Signature included in the attached PDF';
  if (Array.isArray(value)) return value.map(String).join(', ');
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (fieldType === 'location') return String(obj.address ?? `${obj.lat ?? ''}, ${obj.lng ?? ''}`);
    try { return JSON.stringify(obj); } catch { return 'Recorded'; }
  }
  if (fieldType === 'checkbox') return value === true ? 'Checked' : 'Unchecked';
  return String(value);
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

    // ── Load submission ────────────────────────────────────────────────────────
    const submission = await db.query.jobFormSubmissions.findFirst({
      where: and(
        eq(jobFormSubmissions.id, submissionId),
        eq(jobFormSubmissions.companyId, profile.companyId),
      ),
    });
    if (!submission) return res.status(404).json({ error: 'Submission not found' });

    let templateName = 'Form';
    if (submission.templateId) {
      const template = await db.query.formTemplates.findFirst({
        where: and(
          eq(formTemplates.id, submission.templateId),
          eq(formTemplates.companyId, profile.companyId),
        ),
        columns: { name: true },
      });
      if (template?.name) templateName = template.name;
    }

    const fields = submission.templateId
      ? await db.query.formFields.findMany({
          where: and(
            eq(formFields.templateId, submission.templateId),
            eq(formFields.companyId, profile.companyId),
          ),
          orderBy: [asc(formFields.fieldOrder)],
        })
      : [];

    let jobNumber = '';
    let jobName = '';
    let jobAddress = '';
    if (submission.jobId) {
      const job = await db.query.jobs.findFirst({
        where: and(eq(jobs.id, submission.jobId), eq(jobs.companyId, profile.companyId)),
        columns: { jobNumber: true, name: true, address: true },
      });
      if (job) {
        jobNumber = job.jobNumber ?? '';
        jobName = job.name ?? '';
        jobAddress = job.address ?? '';
      }
    }

    const [companyRows] = await db.execute(sql`
      SELECT name FROM companies WHERE id = ${profile.companyId} LIMIT 1
    `) as unknown as [Array<{ name?: string }>, unknown];
    const companyName = String(companyRows?.[0]?.name ?? 'IWILLBUILD');

    let footerText = '';
    let disclaimer = '';
    try {
      const [settingsRows] = await db.execute(sql`
        SELECT pdf_json FROM company_settings WHERE company_id = ${profile.companyId} LIMIT 1
      `) as unknown as [Array<{ pdf_json?: string }>, unknown];
      const settings = settingsRows?.[0]?.pdf_json
        ? JSON.parse(settingsRows[0].pdf_json) as Record<string, unknown>
        : {};
      footerText = typeof settings.footerText === 'string' ? settings.footerText : '';
      disclaimer = typeof settings.formDisclaimer === 'string' ? settings.formDisclaimer : '';
    } catch { /* use defaults */ }

    let answers: Record<string, unknown> = {};
    try {
      if (submission.answersJson) answers = JSON.parse(submission.answersJson) as Record<string, unknown>;
    } catch { /* malformed historical answers remain blank */ }

    // ── Embed photos + signatures ──────────────────────────────────────────────
    const photoIds = Array.from(new Set(fields
      .filter((field) => field.fieldType === 'photo')
      .flatMap((field) => answerUrls(answers[String(field.id)]))
      .map(fileIdFromUrl)
      .filter((id): id is number => id !== null)));

    const photoRecords = photoIds.length > 0
      ? await db.select().from(companyFiles).where(and(
          eq(companyFiles.companyId, profile.companyId),
          inArray(companyFiles.id, photoIds),
        ))
      : [];
    const recordById = new Map(photoRecords.map((record) => [record.id, record]));

    const fieldImages: Record<string, FormPdfImage[]> = {};
    for (const field of fields) {
      if (field.fieldType === 'photo') {
        const images = await Promise.all(answerUrls(answers[String(field.id)]).map(async (url): Promise<FormPdfImage | null> => {
          const fileId = fileIdFromUrl(url);
          const record = fileId ? recordById.get(fileId) : undefined;
          if (!record) return null;
          try {
            const downloaded = await getDownloadBuffer(record.storedName, BUCKET_COMPANY_FILES);
            const thumbnail = await generateThumbnail(downloaded.buffer, record.mimeType, 640, 60);
            if (thumbnail) return { bytes: Uint8Array.from(thumbnail.buffer), mimeType: thumbnail.mimeType };
            if (/image\/(?:png|jpe?g)/i.test(record.mimeType)) {
              return { bytes: Uint8Array.from(downloaded.buffer), mimeType: record.mimeType };
            }
          } catch (error) {
            console.warn(`[form-email] Failed to load photo file ${record.id}:`, error);
          }
          return null;
        }));
        fieldImages[String(field.id)] = images.filter((image): image is FormPdfImage => image !== null);
      } else if (field.fieldType === 'signature') {
        fieldImages[String(field.id)] = signatureDataUrls(answers[String(field.id)])
          .map(imageFromDataUrl)
          .filter((image): image is FormPdfImage => image !== null);
      }
    }

    const completedAt = new Date(submission.updatedAt ?? submission.createdAt ?? Date.now()).toLocaleString('en-AU', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
    const status = submission.status === 'completed' ? 'Completed' : 'In Progress';

    // ── Generate PDF ───────────────────────────────────────────────────────────
    const pdfBytes = await generateFormSubmissionPdf({
      title: templateName,
      status,
      companyName,
      jobNumber,
      jobName,
      jobAddress,
      completedBy: submission.completedByName ?? 'Unknown',
      completedAt,
      footerText,
      disclaimer,
      fields: fields.map((field) => ({
        id: field.id,
        label: field.label,
        fieldType: field.fieldType,
        required: field.required,
        settingsJson: field.settingsJson,
      })),
      answers,
      fieldImages,
    });

    if (attachPdf && pdfBytes.length > EMAIL_ATTACHMENT_LIMIT) {
      return res.status(413).json({
        error: 'This form PDF is larger than the 2 MB email limit. Remove some photos or use Print / PDF to download it.',
      });
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
    const jobLabel = [jobNumber, jobName].filter(Boolean).join(' – ');
    const escapedMessage = escapeHtml(message).replace(/\n/g, '<br>');
    const fullText = `${message}\n\n—\n${SYSTEM_FOOTER}`;

    const html = `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1e293b">
      <div style="max-width:620px;margin:24px auto">
        <div style="background:#7c3aed;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0">
          <strong style="font-size:18px">${escapeHtml(templateName)}</strong>
          <div style="font-size:12px;opacity:.85;margin-top:4px">${escapeHtml(jobLabel || status)}</div>
        </div>
        <div style="border:1px solid #e2e8f0;border-top:0;padding:24px;border-radius:0 0 12px 12px">
          <p style="white-space:pre-line">${escapedMessage}</p>
        </div>
        <div style="background:#f1f5f9;padding:12px 24px">
          <p style="margin:0;font-size:11px;color:#94a3b8;font-style:italic">${escapeHtml(SYSTEM_FOOTER)}</p>
        </div>
      </div>
    </body></html>`;

    const safeTitle = templateName.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 60) || 'form';
    const filename = `${safeTitle}-${submission.id}.pdf`;

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
    if (submission.jobId) {
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
        const jobLabel = [jobNumber, jobName].filter(Boolean).join(' — ');
        const noteBody = [
          `Email sent – ${templateName}`,
          `To: ${toStr}`, `Cc: ${ccStr}`, `BCC: ${bccStr}`,
          `Sent by: ${senderName}`, now,
          `Subject: ${subject}`, `Body: ${bodyPreview}`,
          `Attachment: ${attachment}`, 'Status: Accepted', `Ref: ${result.messageId}`,
        ].join(' | ');

        const authorIdEsc = session.user.id.replace(/'/g, "''");
        const authorNameEsc = senderName.replace(/'/g, "''");
        const bodyEsc = noteBody.replace(/'/g, "''");
        const labelEsc = jobLabel.replace(/'/g, "''");

        await db.execute(sql.raw(
          `INSERT INTO entity_notes (company_id, entity_type, entity_id, entity_label, note_type, body, author_user_id, author_name, mentions_json)
           VALUES (${profile.companyId}, 'job', ${submission.jobId}, '${labelEsc}', 'note', '${bodyEsc}', '${authorIdEsc}', '${authorNameEsc}', '[]')`
        ));
      } catch (noteErr) {
        console.warn('POST /api/job-forms/:id/send-email — note creation failed (non-fatal):', noteErr);
      }
    }

    return res.json({ ok: true, messageId: result.messageId, attachedPdf: attachPdf, ownerBcced, photoCount: photoIds.length, senderName });
  } catch (error) {
    console.error('POST /api/job-forms/:id/send-email error:', error);
    const message = error instanceof Error ? error.message : 'Failed to send form email';
    if (!res.headersSent) return res.status(500).json({ error: message });
  }
}
