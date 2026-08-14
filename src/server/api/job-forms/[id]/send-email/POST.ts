/**
 * POST /api/job-forms/:id/send-email
 * Sends a completed (or in-progress) form submission via email with a PDF attachment.
 * Body: { to: string }
 *
 * PDF is generated server-side with pdf-lib (Alpine-safe, no native deps).
 * The email body contains a plain-text summary; the PDF is attached as
 * "<FormName>.pdf" so the recipient can print or archive it.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { jobFormSubmissions, formTemplates, formFields, profiles, jobs } from '../../../../db/schema.js';
import { eq, and, asc } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { sendEmail } from '../../../../email.js';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

// ── Helpers ───────────────────────────────────────────────────────────────────

function sanitise(s: string): string {
  return s.replace(/[^\x20-\x7E]/g, '?');
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length > maxChars) {
      if (current) lines.push(current.trim());
      current = word;
    } else {
      current = (current + ' ' + word).trim();
    }
  }
  if (current) lines.push(current.trim());
  return lines.length ? lines : [''];
}

// ── PDF builder ───────────────────────────────────────────────────────────────

interface PhotoEmbed { bytes: Uint8Array; mimeType: string; }
interface PdfField { label: string; value: string; required: boolean; photos?: PhotoEmbed[]; }

async function buildPdf(opts: {
  templateName: string;
  status: string;
  jobLabel: string;
  completedBy: string;
  dateStr: string;
  fields: PdfField[];
}): Promise<Uint8Array> {
  const { templateName, status, jobLabel, completedBy, dateStr, fields } = opts;

  const doc = await PDFDocument.create();
  const fontBold   = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontNormal = await doc.embedFont(StandardFonts.Helvetica);

  const PAGE_W = 595;   // A4 portrait pt
  const PAGE_H = 842;
  const MARGIN  = 48;
  const COL_W   = PAGE_W - MARGIN * 2;

  // Colour palette
  const PURPLE = rgb(0.486, 0.227, 0.929);  // #7C3AED
  const SLATE9 = rgb(0.094, 0.118, 0.157);  // slate-900
  const SLATE5 = rgb(0.388, 0.447, 0.502);  // slate-500
  const SLATE2 = rgb(0.882, 0.906, 0.929);  // slate-200
  const WHITE  = rgb(1, 1, 1);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  function newPage() {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
  }

  function ensureSpace(needed: number) {
    if (y - needed < MARGIN + 20) newPage();
  }

  // ── Header band ──────────────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: PAGE_H - 72, width: PAGE_W, height: 72, color: PURPLE });

  // Title
  const titleLines = wrapText(sanitise(templateName), 52);
  const titleSize = titleLines.length > 1 ? 14 : 16;
  let titleY = PAGE_H - 26;
  for (const line of titleLines) {
    page.drawText(line, { x: MARGIN, y: titleY, size: titleSize, font: fontBold, color: WHITE });
    titleY -= titleSize + 3;
  }



  y = PAGE_H - 72 - 18;

  // ── Meta row ─────────────────────────────────────────────────────────────────
  const metaParts: string[] = [];
  if (jobLabel)    metaParts.push(`Job: ${sanitise(jobLabel)}`);
  if (completedBy) metaParts.push(`By: ${sanitise(completedBy)}`);
  if (dateStr)     metaParts.push(sanitise(dateStr));

  if (metaParts.length) {
    page.drawText(metaParts.join('   ·   '), { x: MARGIN, y, size: 8.5, font: fontNormal, color: SLATE5 });
    y -= 14;
  }

  // Divider
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.5, color: SLATE2 });
  y -= 16;

  // ── Fields ───────────────────────────────────────────────────────────────────
  for (const f of fields) {
    const labelText = sanitise(f.label) + (f.required ? ' *' : '');
    const valueText = sanitise(f.value);

    // Label
    ensureSpace(28);
    page.drawText(labelText, { x: MARGIN, y, size: 9, font: fontBold, color: SLATE9 });
    y -= 13;

    // Embedded photos — draw each image inline
    if (f.photos && f.photos.length > 0) {
      for (const photo of f.photos) {
        try {
          const img = photo.mimeType === 'image/png'
            ? await doc.embedPng(photo.bytes)
            : await doc.embedJpg(photo.bytes);
          const MAX_W = COL_W;
          const MAX_H = 200;
          const scale = Math.min(MAX_W / img.width, MAX_H / img.height, 1);
          const imgW = img.width * scale;
          const imgH = img.height * scale;
          ensureSpace(imgH + 12);
          page.drawImage(img, { x: MARGIN + 8, y: y - imgH, width: imgW, height: imgH });
          y -= imgH + 8;
        } catch {
          ensureSpace(14);
          page.drawText('[Photo could not be embedded]', { x: MARGIN + 8, y, size: 9, font: fontNormal, color: SLATE5 });
          y -= 13;
        }
      }
    } else {
      // Value — wrap long lines
      const valueLines = wrapText(valueText, 90);
      for (const vl of valueLines) {
        ensureSpace(14);
        page.drawText(vl, { x: MARGIN + 8, y, size: 9, font: fontNormal, color: SLATE5 });
        y -= 13;
      }
    }

    y -= 6; // gap between fields

    // Light separator every field
    if (y > MARGIN + 20) {
      page.drawLine({ start: { x: MARGIN, y: y + 2 }, end: { x: PAGE_W - MARGIN, y: y + 2 }, thickness: 0.3, color: rgb(0.93, 0.94, 0.95) });
    }
  }

  // ── Footer on every page ─────────────────────────────────────────────────────
  const pageCount = doc.getPageCount();
  for (let i = 0; i < pageCount; i++) {
    const pg = doc.getPage(i);
    pg.drawText(`IWILLBUILD  ·  Page ${i + 1} of ${pageCount}`, {
      x: MARGIN, y: 24, size: 7.5, font: fontNormal, color: SLATE5,
    });
    pg.drawLine({ start: { x: MARGIN, y: 34 }, end: { x: PAGE_W - MARGIN, y: 34 }, thickness: 0.3, color: SLATE2 });
  }

  return doc.save();
}

// ── Handler ───────────────────────────────────────────────────────────────────

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

    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    const { to } = req.body as { to?: string };
    if (!to?.trim()) return res.status(400).json({ error: 'Recipient email is required' });

    // ── Load submission ───────────────────────────────────────────────────────
    const submission = await db.query.jobFormSubmissions.findFirst({
      where: and(
        eq(jobFormSubmissions.id, id),
        eq(jobFormSubmissions.companyId, profile.companyId),
      ),
    });
    if (!submission) return res.status(404).json({ error: 'Submission not found' });

    // ── Template name ─────────────────────────────────────────────────────────
    let templateName = 'Form';
    if (submission.templateId) {
      const tpl = await db.query.formTemplates.findFirst({
        where: eq(formTemplates.id, submission.templateId),
        columns: { name: true },
      });
      if (tpl?.name) templateName = tpl.name;
    }

    // ── Field definitions ─────────────────────────────────────────────────────
    const fieldRows = submission.templateId
      ? await db.query.formFields.findMany({
          where: eq(formFields.templateId, submission.templateId),
          orderBy: [asc(formFields.fieldOrder)],
        })
      : [];

    // ── Job label ─────────────────────────────────────────────────────────────
    let jobLabel = '';
    if (submission.jobId) {
      const jobRow = await db.query.jobs.findFirst({
        where: eq(jobs.id, submission.jobId),
        columns: { jobNumber: true, name: true },
      });
      if (jobRow) jobLabel = [jobRow.jobNumber, jobRow.name].filter(Boolean).join(' — ');
    }

    // ── Parse answers ─────────────────────────────────────────────────────────
    let answers: Record<string, unknown> = {};
    try {
      if (submission.answersJson) answers = JSON.parse(submission.answersJson) as Record<string, unknown>;
    } catch { /* ignore */ }

    // ── Build field list for PDF + plain-text ─────────────────────────────────
    const SKIP_TYPES = ['section', 'instruction', 'instruction_image', 'page_break'];
    const pdfFields: PdfField[] = [];
    const textLines: string[] = [];

    const serverBase = `http://localhost:${process.env.PORT ?? 5173}`;
    const cookieHeader = req.headers.cookie ?? '';

    for (const field of fieldRows) {
      if (SKIP_TYPES.includes(field.fieldType)) continue;
      const val = answers[String(field.id)];
      const empty = val === null || val === undefined || val === '' || (Array.isArray(val) && val.length === 0);
      let display = empty ? '(no answer)' : String(val);
      if (Array.isArray(val)) display = val.join(', ');

      let photos: PhotoEmbed[] | undefined;

      if (field.fieldType === 'photo') {
        if (empty) {
          display = '(no photo)';
        } else {
          // Parse photo file URLs — stored as JSON array or single string
          const photoUrls: string[] = (() => {
            if (Array.isArray(val)) return val.filter((v): v is string => typeof v === 'string');
            if (typeof val === 'string') {
              try { const p = JSON.parse(val); return Array.isArray(p) ? p : [val]; } catch { return [val]; }
            }
            return [];
          })();
          // Fetch each photo server-side and embed bytes in the PDF
          const fetched: PhotoEmbed[] = [];
          for (const photoUrl of photoUrls) {
            try {
              const fullUrl = photoUrl.startsWith('http') ? photoUrl : `${serverBase}${photoUrl}`;
              const photoRes = await fetch(fullUrl, { headers: { cookie: cookieHeader } });
              if (photoRes.ok) {
                const buf = await photoRes.arrayBuffer();
                const ct = photoRes.headers.get('content-type') ?? 'image/jpeg';
                fetched.push({ bytes: new Uint8Array(buf), mimeType: ct.includes('png') ? 'image/png' : 'image/jpeg' });
              }
            } catch { /* skip failed photo */ }
          }
          photos = fetched.length > 0 ? fetched : undefined;
          display = photos
            ? `${photos.length} photo${photos.length !== 1 ? 's' : ''} (embedded in PDF)`
            : `${photoUrls.length} photo${photoUrls.length !== 1 ? 's' : ''} (could not load)`;
        }
      } else if (field.fieldType === 'signature') {
        display = empty ? '(no signature)' : '[Signature captured]';
      } else if (field.fieldType === 'location' && !empty && typeof val === 'object' && val !== null && 'lat' in val) {
        const g = val as { lat: number; lng: number; address?: string };
        display = g.address ? `${g.address} (${g.lat.toFixed(5)}, ${g.lng.toFixed(5)})` : `${g.lat.toFixed(6)}, ${g.lng.toFixed(6)}`;
      }

      pdfFields.push({ label: field.label, value: display, required: !!field.required, photos });
      textLines.push(`${field.label}${field.required ? ' *' : ''}`);
      textLines.push(`  ${display}`);
      textLines.push('');
    }

    const dateStr = submission.updatedAt
      ? new Date(submission.updatedAt).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '';

    // ── Generate PDF ──────────────────────────────────────────────────────────
    const pdfBytes = await buildPdf({
      templateName,
      status: submission.status,
      jobLabel,
      completedBy: submission.completedByName ?? '',
      dateStr,
      fields: pdfFields,
    });

    const safeFileName = templateName.replace(/[^a-zA-Z0-9\-_ ]/g, '').trim() || 'form';

    // ── Plain-text email body ─────────────────────────────────────────────────
    const headerLines = [
      `Form: ${templateName}`,
      `Status: ${submission.status === 'completed' || submission.status === 'submitted' ? 'Completed' : 'In Progress'}`,
      jobLabel ? `Job: ${jobLabel}` : '',
      submission.completedByName ? `Completed by: ${submission.completedByName}` : '',
      dateStr ? `Date: ${dateStr}` : '',
      '',
      '─────────────────────────────',
      '',
    ].filter(Boolean);

    const allTextLines = [...headerLines, ...textLines, '─────────────────────────────', 'Sent from IWILLBUILD'];
    const htmlLines = allTextLines.map((l) =>
      l === ''
        ? '<br/>'
        : `<p style="margin:0 0 4px">${l.replace(/─+/g, '<hr style="border:none;border-top:1px solid #e2e8f0;margin:8px 0"/>')}</p>`,
    );

    // ── Send email with PDF attachment ────────────────────────────────────────
    await sendEmail({
      to: to.trim(),
      subject: `${templateName}${jobLabel ? ' — ' + jobLabel : ''} (${submission.status === 'completed' || submission.status === 'submitted' ? 'Completed' : 'Draft'})`,
      text: allTextLines.join('\n'),
      html: `<div style="font-family:sans-serif;font-size:14px;color:#1e293b;max-width:600px">${htmlLines.join('')}<p style="margin-top:16px;font-size:12px;color:#64748b">PDF attached — ${safeFileName}.pdf</p></div>`,
      attachments: [
        {
          filename: `${safeFileName}.pdf`,
          content: Buffer.from(pdfBytes),
          contentType: 'application/pdf',
        },
      ],
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/job-forms/:id/send-email error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Failed to send email' });
  }
}
