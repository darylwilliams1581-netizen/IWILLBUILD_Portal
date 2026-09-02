/**
 * form-pdf-document.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Canonical builder for completed-form PDFs.
 *
 * Extracts the data-assembly logic that was previously embedded inside
 * POST /api/job-forms/:id/send-email so it can be shared by:
 *   - The email endpoint (unchanged behaviour)
 *   - GET /api/job-forms/:id/export-pdf  (new authenticated download)
 *   - GET /api/secure-share/:token/content  (public share link delivery)
 *
 * Returns a typed document object — callers decide how to deliver the bytes.
 */
import { and, asc, eq, inArray } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  companyFiles,
  formFields,
  formTemplates,
  jobFormSubmissions,
  jobs,
} from '../db/schema.js';
import { generateFormSubmissionPdf, type FormPdfImage } from './form-pdf-generator.js';
import {
  BUCKET_COMPANY_FILES,
  generateThumbnail,
  getDownloadBuffer,
} from '../storage/storage-service.js';

import { isFileApiUrl } from '../../lib/string-scanners.js';

// ── Re-export the helpers that send-email also needs ─────────────────────────

export function answerUrls(value: unknown): string[] {
  if (!value) return [];
  let urls: string[] = [];
  if (Array.isArray(value)) {
    urls = value.filter((item): item is string => typeof item === 'string');
  } else if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      urls = Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === 'string')
        : [value];
    } catch {
      urls = [value];
    }
  }
  const seen = new Set<string>();
  return urls.filter((u) => {
    if (!u || !isFileApiUrl(u)) return false;
    if (seen.has(u)) return false;
    seen.add(u);
    return true;
  });
}

export function fileIdFromUrl(value: string): number | null {
  const match = value.match(/(?:^|\/)api\/files\/(\d+)\/download(?:\?|$)/i);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isInteger(id) ? id : null;
}

export function signatureDataUrls(value: unknown): string[] {
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

export function imageFromDataUrl(dataUrl: string): FormPdfImage | null {
  const match = dataUrl.match(/^data:(image\/(?:png|jpe?g));base64,([a-z0-9+/=\s]+)$/i);
  if (!match) return null;
  try {
    return {
      bytes: Uint8Array.from(Buffer.from(match[2], 'base64')),
      mimeType: match[1].toLowerCase(),
    };
  } catch {
    return null;
  }
}

// ── Document result type ──────────────────────────────────────────────────────

export interface FormPdfDocument {
  pdfBytes: Uint8Array;
  filename: string;
  submissionId: number;
  templateName: string;
  status: string;
  companyName: string;
  jobNumber: string;
  jobName: string;
  jobAddress: string;
  completedBy: string;
  completedAt: string;
  /** jobId if the submission is linked to a job, null otherwise */
  jobId: number | null;
}

// ── Canonical builder ─────────────────────────────────────────────────────────

/**
 * Build the canonical form PDF for a completed (or in-progress) submission.
 *
 * @param companyId  The company that owns the submission — used for all DB lookups.
 * @param submissionId  The job_form_submissions.id to render.
 * @returns  FormPdfDocument, or null if the submission does not exist / is not
 *           accessible by the given company.
 */
export async function buildFormPdfDocument(
  companyId: number,
  submissionId: number,
): Promise<FormPdfDocument | null> {
  // ── Load submission ─────────────────────────────────────────────────────────
  const submission = await db.query.jobFormSubmissions.findFirst({
    where: and(
      eq(jobFormSubmissions.id, submissionId),
      eq(jobFormSubmissions.companyId, companyId),
    ),
  });
  if (!submission) return null;

  // ── Template name ───────────────────────────────────────────────────────────
  let templateName = 'Form';
  if (submission.templateId) {
    const template = await db.query.formTemplates.findFirst({
      where: and(
        eq(formTemplates.id, submission.templateId),
        eq(formTemplates.companyId, companyId),
      ),
      columns: { name: true },
    });
    if (template?.name) templateName = template.name;
  }

  // ── Fields ──────────────────────────────────────────────────────────────────
  const fields = submission.templateId
    ? await db.query.formFields.findMany({
        where: and(
          eq(formFields.templateId, submission.templateId),
          eq(formFields.companyId, companyId),
        ),
        orderBy: [asc(formFields.fieldOrder)],
      })
    : [];

  // ── Job metadata ────────────────────────────────────────────────────────────
  let jobNumber = '';
  let jobName = '';
  let jobAddress = '';
  if (submission.jobId) {
    const job = await db.query.jobs.findFirst({
      where: and(eq(jobs.id, submission.jobId), eq(jobs.companyId, companyId)),
      columns: { jobNumber: true, name: true, address: true },
    });
    if (job) {
      jobNumber = job.jobNumber ?? '';
      jobName = job.name ?? '';
      jobAddress = job.address ?? '';
    }
  }

  // ── Company name ────────────────────────────────────────────────────────────
  const [companyRows] = await db.execute(sql`
    SELECT name FROM companies WHERE id = ${companyId} LIMIT 1
  `) as unknown as [Array<{ name?: string }>, unknown];
  const companyName = String(companyRows?.[0]?.name ?? 'IWIllBUILD');

  // ── PDF settings ────────────────────────────────────────────────────────────
  let footerText = '';
  let disclaimer = '';
  try {
    const [settingsRows] = await db.execute(sql`
      SELECT pdf_json FROM company_settings WHERE company_id = ${companyId} LIMIT 1
    `) as unknown as [Array<{ pdf_json?: string }>, unknown];
    const settings = settingsRows?.[0]?.pdf_json
      ? JSON.parse(settingsRows[0].pdf_json) as Record<string, unknown>
      : {};
    footerText = typeof settings.footerText === 'string' ? settings.footerText : '';
    disclaimer = typeof settings.formDisclaimer === 'string' ? settings.formDisclaimer : '';
  } catch { /* use defaults */ }

  // ── Answers ─────────────────────────────────────────────────────────────────
  let answers: Record<string, unknown> = {};
  try {
    if (submission.answersJson) answers = JSON.parse(submission.answersJson) as Record<string, unknown>;
  } catch { /* malformed historical answers remain blank */ }

  // ── Embed photos + signatures ───────────────────────────────────────────────
  const photoIds = Array.from(new Set(
    fields
      .filter((f) => f.fieldType === 'photo')
      .flatMap((f) => answerUrls(answers[String(f.id)]))
      .map(fileIdFromUrl)
      .filter((id): id is number => id !== null),
  ));

  const photoRecords = photoIds.length > 0
    ? await db.select().from(companyFiles).where(and(
        eq(companyFiles.companyId, companyId),
        inArray(companyFiles.id, photoIds),
      ))
    : [];
  const recordById = new Map(photoRecords.map((r) => [r.id, r]));

  const fieldImages: Record<string, FormPdfImage[]> = {};
  for (const field of fields) {
    if (field.fieldType === 'photo') {
      const images = await Promise.all(
        answerUrls(answers[String(field.id)]).map(async (url): Promise<FormPdfImage | null> => {
          const fileId = fileIdFromUrl(url);
          const record = fileId ? recordById.get(fileId) : undefined;
          if (!record) return null;
          try {
            const downloaded = await getDownloadBuffer(record.storedName, BUCKET_COMPANY_FILES);
            const thumbnail = await generateThumbnail(downloaded.buffer, record.mimeType, 300, 70);
            const thumbBytes = thumbnail ? Uint8Array.from(thumbnail.buffer) : null;
            const thumbMime = thumbnail ? thumbnail.mimeType : null;
            const isImage = /image\/(?:png|jpe?g)/i.test(record.mimeType);
            if (!isImage) return null;
            const fullBytes = Uint8Array.from(downloaded.buffer);
            if (thumbBytes && thumbMime) {
              return {
                bytes: thumbBytes,
                mimeType: thumbMime,
                fullBytes,
                fullMimeType: record.mimeType,
                label: field.label,
              };
            }
            return {
              bytes: fullBytes,
              mimeType: record.mimeType,
              fullBytes,
              fullMimeType: record.mimeType,
              label: field.label,
            };
          } catch (err) {
            console.warn(`[form-pdf-document] Failed to load photo file ${record.id}:`, err);
          }
          return null;
        }),
      );
      fieldImages[String(field.id)] = images.filter((img): img is FormPdfImage => img !== null);
    } else if (field.fieldType === 'signature') {
      fieldImages[String(field.id)] = signatureDataUrls(answers[String(field.id)])
        .map(imageFromDataUrl)
        .filter((img): img is FormPdfImage => img !== null);
    }
  }

  // ── Timestamps ──────────────────────────────────────────────────────────────
  const completedAt = new Date(
    submission.updatedAt ?? submission.createdAt ?? Date.now(),
  ).toLocaleString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  const status = submission.status === 'completed' ? 'Completed' : 'In Progress';

  // ── Generate PDF ────────────────────────────────────────────────────────────
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
    fields: fields.map((f) => ({
      id: f.id,
      label: f.label,
      fieldType: f.fieldType,
      required: f.required,
      settingsJson: f.settingsJson,
    })),
    answers,
    fieldImages,
  });

  // ── Filename ────────────────────────────────────────────────────────────────
  const safeTitle = templateName
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60) || 'form';
  const filename = `${safeTitle}-${submission.id}.pdf`;

  return {
    pdfBytes,
    filename,
    submissionId: submission.id,
    templateName,
    status,
    companyName,
    jobNumber,
    jobName,
    jobAddress,
    completedBy: submission.completedByName ?? 'Unknown',
    completedAt,
    jobId: submission.jobId ?? null,
  };
}
