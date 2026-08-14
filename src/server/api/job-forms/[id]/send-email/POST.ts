/**
 * POST /api/job-forms/:id/send-email
 * Generates a completed-form PDF, embeds stored photos/signatures, and sends
 * the document as a real PDF attachment.
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
    if (fieldType === 'signature') return 'Signature captured';
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

    const submissionId = Number(req.params.id);
    if (!Number.isInteger(submissionId)) return res.status(400).json({ error: 'Invalid form ID' });

    const to = typeof req.body?.to === 'string' ? req.body.to.trim() : '';
    if (!to) return res.status(400).json({ error: 'Recipient email is required' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return res.status(400).json({ error: 'Enter a valid recipient email address.' });
    }

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

    if (pdfBytes.length > EMAIL_ATTACHMENT_LIMIT) {
      return res.status(413).json({
        error: 'This form PDF is larger than the 2 MB email limit. Remove some photos or use Print / PDF to download it.',
      });
    }

    const jobLabel = [jobNumber, jobName].filter(Boolean).join(' - ');
    const summaryLines: string[] = [];
    const htmlRows: string[] = [];
    for (const field of fields) {
      if (['section', 'instruction', 'instruction_image', 'page_break'].includes(field.fieldType)) continue;
      const display = displayValue(field.fieldType, answers[String(field.id)]);
      summaryLines.push(`${field.label}: ${display}`);
      htmlRows.push(`<tr><td style="padding:5px 8px;color:#64748b;vertical-align:top">${escapeHtml(field.label)}</td><td style="padding:5px 8px;color:#1e293b">${escapeHtml(display)}</td></tr>`);
    }

    const text = [
      `Form: ${templateName}`,
      `Status: ${status}`,
      jobLabel ? `Job: ${jobLabel}` : '',
      `Completed by: ${submission.completedByName ?? 'Unknown'}`,
      `Date: ${completedAt}`,
      '',
      'The completed form is attached as a PDF.',
      '',
      ...summaryLines,
      '',
      `Sent from ${companyName}`,
    ].filter(Boolean).join('\n');

    const html = `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1e293b">
      <div style="max-width:620px;margin:24px auto">
        <div style="background:#7c3aed;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0">
          <strong style="font-size:18px">${escapeHtml(templateName)}</strong>
          <div style="font-size:12px;opacity:.85;margin-top:4px">${escapeHtml(jobLabel || status)}</div>
        </div>
        <div style="border:1px solid #e2e8f0;border-top:0;padding:24px;border-radius:0 0 12px 12px">
          <p>The completed form is attached as a PDF. Photos and signatures are embedded in the attachment.</p>
          <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:16px">${htmlRows.join('')}</table>
        </div>
      </div>
    </body></html>`;

    const safeTitle = templateName.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 60) || 'form';
    const filename = `${safeTitle}-${submission.id}.pdf`;

    await sendEmail({
      to,
      subject: `${templateName}${jobLabel ? ` - ${jobLabel}` : ''} (${status})`,
      text,
      html,
      fromName: companyName,
      attachments: [{ filename, content: Buffer.from(pdfBytes), contentType: 'application/pdf' }],
    });

    return res.json({ ok: true, to, attachment: filename, photoCount: photoIds.length });
  } catch (error) {
    console.error('POST /api/job-forms/:id/send-email error:', error);
    const message = error instanceof Error ? error.message : 'Failed to send form email';
    if (!res.headersSent) return res.status(500).json({ error: message });
  }
}
