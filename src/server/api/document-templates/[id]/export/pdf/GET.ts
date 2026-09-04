/**
 * GET /api/document-templates/:id/export/pdf
 * ─────────────────────────────────────────────────────────────────────────────
 * Exports a document template as a print-ready HTML page (blocks-based) or,
 * when the document has a Word/PDF source file, as a cover-page + source merge.
 *
 * Query params:
 *   job_swms_id  number?  — job_swms.id of a Studio attachment row
 *                           (where studio_document_id IS NOT NULL).
 *                           When provided the immutable content_snapshot_json
 *                           is used instead of the live master, and job fields
 *                           are injected into the header table.
 *
 * Source-document flow (source_type = 'docx' | 'pdf'):
 *   1. Build a cover-page HTML with job/company metadata and master watermark.
 *   2. If GOTENBERG_URL is configured:
 *        a. Render cover HTML → PDF via Gotenberg /forms/chromium/convert/html
 *        b. Fetch source bytes from R2
 *        c. Merge cover + source via Gotenberg /forms/pdfengines/merge
 *        d. Return merged PDF with Content-Disposition: attachment
 *   3. If Gotenberg is NOT configured:
 *        Return cover HTML for print-to-PDF with a download link to the
 *        original source file and an honest note that full merge requires
 *        the renderer. Returns 200 (not 503) — the cover page is still useful.
 *
 * Blocks-based flow (source_type = 'blocks' or no source):
 *   Existing behaviour unchanged — returns HTML page with inline JS renderer.
 *
 * When NO job_swms_id is supplied a "Master Document — Not Job Specific"
 * watermark banner is shown.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { profiles } from '../../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getSecret } from '#airo/secrets';
import { downloadSourceDocument } from '../../../../../lib/source-document-storage.js';
import { sanitiseHtmlServer } from '../../../../../lib/sanitiseHtmlServer.js';

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Gotenberg helpers ─────────────────────────────────────────────────────────

function gotenbergUrl(): string | null {
  try {
    const u = getSecret('GOTENBERG_URL');
    return u && u.trim() ? u.trim().replace(/\/$/, '') : null;
  } catch {
    return null;
  }
}

async function gotenbergHtmlToPdf(baseUrl: string, html: string): Promise<Buffer | null> {
  try {
    const form = new FormData();
    form.append('files', new Blob([html], { type: 'text/html' }), 'index.html');
    const res = await fetch(`${baseUrl}/forms/chromium/convert/html`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

async function gotenbergMergePdfs(baseUrl: string, pdfs: Array<{ name: string; bytes: Buffer }>): Promise<Buffer | null> {
  try {
    const form = new FormData();
    for (const { name, bytes } of pdfs) {
      form.append('files', new Blob([bytes], { type: 'application/pdf' }), name);
    }
    const res = await fetch(`${baseUrl}/forms/pdfengines/merge`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

// ── Cover page HTML builder ───────────────────────────────────────────────────

function buildCoverHtml(opts: {
  docName: string;
  docId: number;
  jobInfo: JobInfo | null;
  sourceFileName: string | null;
  sourceType: string;
  downloadUrl: string;
  includeDownloadLink: boolean;
  companyName?: string;
}): string {
  const { docName, docId, jobInfo, sourceFileName, sourceType, downloadUrl, includeDownloadLink, companyName } = opts;

  const masterBanner = !jobInfo ? `
    <div class="master-banner">
      ⚠ Master Document — Not Job Specific. Attach this document to a job before issuing to workers.
    </div>` : '';

  const jobHeader = jobInfo ? `
    <div class="job-header">
      <h2 class="section-title">Job Information</h2>
      <table class="info-table">
        <tr><th>Job Title</th><td>${esc(jobInfo.jobTitle)}</td><th>Job Number</th><td>${esc(jobInfo.jobNumber)}</td></tr>
        <tr><th>Site Address</th><td colspan="3">${esc(jobInfo.siteAddress)}</td></tr>
        <tr><th>Client / Principal Contractor</th><td>${esc(jobInfo.clientName)}</td><th>Supervisor</th><td>${esc(jobInfo.supervisorName)}</td></tr>
        <tr><th>Document Number</th><td>${esc(jobInfo.docNumber)}</td><th>Revision</th><td>${esc(jobInfo.revision)}</td></tr>
        <tr><th>Date Attached</th><td colspan="3">${esc(jobInfo.dateAttached)}</td></tr>
      </table>
    </div>` : '';

  const downloadNote = includeDownloadLink ? `
    <div class="download-note">
      <strong>Source file:</strong> ${esc(sourceFileName ?? `document.${sourceType}`)}
      &nbsp;—&nbsp;
      <a href="${esc(downloadUrl)}" target="_blank">Download original ${sourceType.toUpperCase()}</a>
      <br/>
      <small>This cover page can be printed separately. The original source file is available via the link above.</small>
    </div>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${esc(docName)}${jobInfo ? ` — ${esc(jobInfo.jobTitle || jobInfo.jobNumber)}` : ' — Cover'}</title>
  <style>
    * { box-sizing: border-box; }
    @page { size: A4; margin: 20mm; }
    body { font-family: Arial, sans-serif; margin: 0; padding: 32px; color: #1e293b; font-size: 13px; line-height: 1.5; }
    h1 { font-size: 22px; margin: 0 0 4px; color: #0f172a; }
    .doc-meta { font-size: 11px; color: #64748b; margin-bottom: 20px; }
    .company-name { font-size: 13px; font-weight: 600; color: #475569; margin-bottom: 4px; }
    .master-banner {
      background: #fef3c7; border: 2px solid #f59e0b; border-radius: 6px;
      padding: 10px 14px; margin-bottom: 20px; font-size: 12px; font-weight: bold; color: #92400e;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .section-title { font-size: 13px; font-weight: bold; margin: 0 0 6px; color: #1e293b; }
    .job-header { margin-bottom: 20px; }
    .info-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .info-table th { background: #1e293b; color: #fff; padding: 5px 8px; text-align: left; font-weight: 600; width: 22%; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .info-table td { border: 1px solid #cbd5e1; padding: 5px 8px; }
    .info-table tr:nth-child(even) td { background: #f8fafc; }
    .source-badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: bold; margin-bottom: 16px; }
    .source-badge.docx { background: #dbeafe; color: #1d4ed8; border: 1px solid #bfdbfe; }
    .source-badge.pdf  { background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; }
    .download-note { margin-top: 24px; padding: 10px 14px; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 6px; font-size: 12px; color: #0369a1; }
    .download-note a { color: #0369a1; font-weight: 600; }
    .divider { border: none; border-top: 2px solid #e2e8f0; margin: 20px 0; }
    @media print {
      body { padding: 0; }
    }
  </style>
</head>
<body>
  ${companyName ? `<p class="company-name">${esc(companyName)}</p>` : ''}
  <h1>${esc(docName)}</h1>
  <p class="doc-meta">Document ID ${docId}${jobInfo ? ` &nbsp;|&nbsp; Attached ${esc(jobInfo.dateAttached)}` : ' &nbsp;|&nbsp; Master'}</p>
  <span class="source-badge ${esc(sourceType)}">${sourceType.toUpperCase()} Source Document</span>
  ${masterBanner}
  ${jobHeader}
  <hr class="divider" />
  ${downloadNote}
</body>
</html>`;
}


// ── Block renderer ────────────────────────────────────────────────────────────
// Renders builder_json blocks to a static, sanitised HTML string in Node.
// All rich_text/html block content is sanitised by sanitiseHtmlServer (jsdom
// DOM-walk) before being included. All other block types use esc() — plain
// text only, never raw HTML. The result is a static string baked into the
// HTML template; no inline script renderer, no runtime innerHTML assignment
// of unsanitised content in Gotenberg.

type Block = {
  type?: string;
  level?: number;
  content?: string;
  text?: string;
  html?: string;
  height?: number;
  variant?: string;
  title?: string;
  body?: string;
  columns?: Array<{ id: string; header?: string }>;
  rows?: Array<{ cells?: Record<string, string> }>;
};

function renderBlocksToSafeHtml(
  builderJsonStr: string,
  escFn: (s: unknown) => string,
  sanitiseFn: (html: string) => string,
): string {
  let blocks: Block[] = [];
  try {
    const raw = JSON.parse(builderJsonStr);
    blocks = Array.isArray(raw) ? raw : (Array.isArray(raw?.blocks) ? raw.blocks : []);
  } catch {
    return '<p>Error: could not parse document content.</p>';
  }

  if (blocks.length === 0) return '<p>No content blocks found.</p>';

  return blocks.map((b) => {
    if (!b || !b.type) return '';

    if (b.type === 'heading') {
      const lvl = Math.min(Math.max(Number(b.level) || 2, 1), 6);
      return `<h${lvl}>${escFn(b.content || b.text || '')}</h${lvl}>`;
    }

    if (b.type === 'text') {
      return `<p>${escFn(b.content || '')}</p>`;
    }

    if (b.type === 'rich_text' || b.type === 'richtext' || b.type === 'html') {
      // sanitiseFn performs a full jsdom DOM-walk with a strict allowlist.
      // The result is a safe static HTML string — no scripts, no event
      // handlers, no external URLs.
      return sanitiseFn(String(b.content || b.html || ''));
    }

    if (b.type === 'divider') return '<hr>';

    if (b.type === 'spacer') {
      const h = Math.min(Math.max(Number(b.height) || 8, 0), 200);
      return `<div style="height:${h}px"></div>`;
    }

    if (b.type === 'banner') {
      const variant = /^[a-z]+$/.test(b.variant || '') ? (b.variant || 'info') : 'info';
      return `<div class="banner-${variant}"><strong>${escFn(b.title || '')}</strong>${b.body ? ` — ${escFn(b.body)}` : ''}</div>`;
    }

    if (b.type === 'table' && Array.isArray(b.columns) && Array.isArray(b.rows)) {
      const cols = b.columns;
      const thead = `<tr>${cols.map((c) => `<th>${escFn(c.header || c.id || '')}</th>`).join('')}</tr>`;
      const tbody = b.rows.map((r) =>
        `<tr>${cols.map((c) => `<td>${escFn((r.cells || {})[c.id] || '')}</td>`).join('')}</tr>`,
      ).join('');
      return `<table><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
    }

    return '';
  }).join('');
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

    const [profile] = await db.select().from(profiles).where(eq(profiles.userId, session.user.id)).limit(1);
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid ID' });

    const companyId = profile.companyId;
    // Support both old param name (jobStudioDocId) and new (job_swms_id) for compatibility
    const jobSwmsId = req.query.job_swms_id
      ? Number(req.query.job_swms_id)
      : req.query.jobStudioDocId
        ? Number(req.query.jobStudioDocId)
        : null;

    // ── Load document ─────────────────────────────────────────────────────────
    const [rows] = await db.execute(sql.raw(
      `SELECT id, name, builder_json, template_type, company_id,
              source_type, source_file_key, source_file_name, source_mime_type
       FROM document_templates
       WHERE id = ${id} AND company_id = ${companyId}
       LIMIT 1`
    )) as unknown as [Array<Record<string, unknown>>, unknown];

    const doc = Array.isArray(rows) ? rows[0] : null;
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    const docName = String(doc.name ?? 'Document');
    const sourceType = doc.source_type ? String(doc.source_type) : 'blocks';
    const sourceFileKey = doc.source_file_key ? String(doc.source_file_key) : null;
    const sourceFileName = doc.source_file_name ? String(doc.source_file_name) : null;

    // ── Optionally load job attachment snapshot ───────────────────────────────
    type JobInfo = {
      jobTitle: string;
      jobNumber: string;
      siteAddress: string;
      clientName: string;
      supervisorName: string;
      docNumber: string;
      revision: string;
      dateAttached: string;
      contentSnapshot: string | null;
    };

    let jobInfo: JobInfo | null = null;

    if (jobSwmsId) {
      try {
        // Query job_swms for Studio attachment rows (studio_document_id IS NOT NULL)
        const [jsRows] = await db.execute(sql.raw(
          `SELECT js.*,
                  j.name AS job_name, j.job_number, j.address AS site_address,
                  j.client AS client_name
           FROM job_swms js
           LEFT JOIN jobs j ON j.id = js.job_id
           WHERE js.id = ${jobSwmsId}
             AND js.studio_document_id = ${id}
             AND js.company_id = ${companyId}
             AND js.studio_document_id IS NOT NULL
           LIMIT 1`
        )) as unknown as [Array<Record<string, unknown>>, unknown];

        const js = Array.isArray(jsRows) ? jsRows[0] : null;
        if (js) {
          jobInfo = {
            jobTitle:      String(js.job_name ?? ''),
            jobNumber:     String(js.job_number ?? ''),
            siteAddress:   String(js.site_address ?? ''),
            clientName:    String(js.client_name ?? ''),
            supervisorName: '',
            docNumber:     '',
            revision:      String(js.studio_source_revision ?? '1'),
            dateAttached:  js.studio_attached_at ? String(js.studio_attached_at).slice(0, 10) : '',
            contentSnapshot: js.content_snapshot_json ? String(js.content_snapshot_json) : null,
          };
        }
      } catch {
        // Studio columns may not exist yet (pre-migration) — fall back to master
      }
    }

    // ── SOURCE DOCUMENT FLOW ──────────────────────────────────────────────────
    // When the document has a Word/PDF source file, build a cover page and
    // attempt to merge it with the original source bytes via Gotenberg.
    if ((sourceType === 'docx' || sourceType === 'pdf') && sourceFileKey) {
      const downloadUrl = `/api/document-templates/${id}/source-document/download`;
      const gUrl = gotenbergUrl();

      if (gUrl) {
        // ── Gotenberg path: cover HTML → PDF, fetch source, merge ─────────────
        const coverHtml = buildCoverHtml({
          docName, docId: id, jobInfo, sourceFileName, sourceType,
          downloadUrl, includeDownloadLink: false,
        });

        // Render cover to PDF
        const coverPdf = await gotenbergHtmlToPdf(gUrl, coverHtml);
        if (!coverPdf) {
          // Gotenberg available but render failed — honest 503
          return res.status(503).json({
            error: 'PDF renderer unavailable',
            message: 'The cover page could not be rendered. Please try again or download the source file directly.',
            downloadUrl,
          });
        }

        // Fetch source bytes from R2
        let sourceBytes: Buffer | null = null;
        try {
          sourceBytes = await downloadSourceDocument(sourceFileKey);
        } catch {
          // R2 unavailable — return cover only
        }

        if (sourceBytes) {
          // Merge cover + source
          const merged = await gotenbergMergePdfs(gUrl, [
            { name: '01-cover.pdf', bytes: coverPdf },
            { name: `02-source.pdf`, bytes: sourceBytes },
          ]);
          if (merged) {
            const safeName = docName.replace(/[^a-z0-9_\-. ]/gi, '_');
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${safeName}.pdf"`);
            res.setHeader('Content-Length', merged.length);
            return res.send(merged);
          }
        }

        // Merge failed — return cover PDF only with a note
        const safeName = docName.replace(/[^a-z0-9_\-. ]/gi, '_');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${safeName}-cover.pdf"`);
        res.setHeader('Content-Length', coverPdf.length);
        res.setHeader('X-Source-Download-Url', downloadUrl);
        return res.send(coverPdf);

      } else {
        // ── No Gotenberg: return cover HTML for print-to-PDF ──────────────────
        // Include a download link so the user can get the original source.
        const coverHtml = buildCoverHtml({
          docName, docId: id, jobInfo, sourceFileName, sourceType,
          downloadUrl, includeDownloadLink: true,
        });
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Content-Disposition', `inline; filename="${docName.replace(/[^a-z0-9_\-. ]/gi, '_')}-cover.html"`);
        res.setHeader('X-Source-Download-Url', downloadUrl);
        res.setHeader('X-Renderer-Status', 'unavailable');
        return res.send(coverHtml);
      }
    }

    // ── BLOCKS-BASED FLOW ─────────────────────────────────────────────────────

    // ── Resolve builder_json ──────────────────────────────────────────────────
    // If we have a snapshot, use its builderJson; otherwise use the live master.
    let builderJsonStr = String(doc.builder_json ?? '{}');
    if (jobInfo?.contentSnapshot) {
      try {
        const snap = JSON.parse(jobInfo.contentSnapshot) as { builderJson?: unknown };
        if (snap.builderJson) {
          builderJsonStr = typeof snap.builderJson === 'string'
            ? snap.builderJson
            : JSON.stringify(snap.builderJson);
        }
      } catch {
        // malformed snapshot — fall back to live master
      }
    }

    // ── Pre-render blocks to sanitised static HTML (server-side) ─────────────
    // All block content is rendered and sanitised here in Node before the HTML
    // template is assembled. The resulting string is a static, safe HTML
    // fragment — no inline script renderer, no runtime innerHTML assignment of
    // unsanitised content in Gotenberg.
    //
    // rich_text / richtext / html blocks: sanitiseHtmlServer (jsdom DOM-walk)
    // All other block types: esc() — plain text, never raw HTML.
    const preRenderedContent = renderBlocksToSafeHtml(builderJsonStr, esc, sanitiseHtmlServer);

    // ── Build job-info header table HTML ──────────────────────────────────────
    const jobHeaderHtml = jobInfo ? `
      <div class="job-header">
        <h2 class="job-header-title">Job Information</h2>
        <table class="job-table">
          <tr><th>Job Title</th><td>${esc(jobInfo.jobTitle)}</td><th>Job Number</th><td>${esc(jobInfo.jobNumber)}</td></tr>
          <tr><th>Site Address</th><td colspan="3">${esc(jobInfo.siteAddress)}</td></tr>
          <tr><th>Client / Principal Contractor</th><td>${esc(jobInfo.clientName)}</td><th>Supervisor</th><td>${esc(jobInfo.supervisorName)}</td></tr>
          <tr><th>Document Number</th><td>${esc(jobInfo.docNumber)}</td><th>Revision</th><td>${esc(jobInfo.revision)}</td></tr>
          <tr><th>Date Attached</th><td colspan="3">${esc(jobInfo.dateAttached)}</td></tr>
        </table>
      </div>
    ` : '';

    // ── Master watermark banner ───────────────────────────────────────────────
    const masterBannerHtml = !jobInfo ? `
      <div class="master-banner">
        ⚠ Master Document — Not Job Specific. Attach this document to a job before issuing to workers.
      </div>
    ` : '';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${esc(docName)}${jobInfo ? ` — ${esc(jobInfo.jobTitle || jobInfo.jobNumber)}` : ''}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; margin: 32px; color: #1e293b; font-size: 13px; line-height: 1.5; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    .doc-meta { font-size: 11px; color: #64748b; margin-bottom: 16px; }
    .master-banner {
      background: #fef3c7; border: 2px solid #f59e0b; border-radius: 6px;
      padding: 10px 14px; margin-bottom: 20px; font-size: 12px; font-weight: bold; color: #92400e;
    }
    .job-header { margin-bottom: 20px; }
    .job-header-title { font-size: 13px; font-weight: bold; margin: 0 0 6px; color: #1e293b; }
    .job-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .job-table th { background: #1e293b; color: #fff; padding: 5px 8px; text-align: left; font-weight: 600; width: 22%; }
    .job-table td { border: 1px solid #cbd5e1; padding: 5px 8px; }
    .job-table tr:nth-child(even) td { background: #f8fafc; }
    .content h2 { font-size: 15px; margin: 20px 0 6px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
    .content p { margin: 4px 0 10px; }
    .content table { width: 100%; border-collapse: collapse; margin: 8px 0 16px; font-size: 12px; }
    .content table th { background: #1e293b; color: #fff; padding: 5px 8px; text-align: left; }
    .content table td { border: 1px solid #cbd5e1; padding: 5px 8px; }
    .content table tr:nth-child(even) td { background: #f8fafc; }
    .content hr { border: none; border-top: 1px solid #e2e8f0; margin: 16px 0; }
    .content .banner-warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 8px 12px; margin: 8px 0; font-size: 12px; }
    .content .banner-info    { background: #eff6ff; border-left: 4px solid #3b82f6; padding: 8px 12px; margin: 8px 0; font-size: 12px; }
    .content .banner-success { background: #f0fdf4; border-left: 4px solid #22c55e; padding: 8px 12px; margin: 8px 0; font-size: 12px; }
    .content .banner-danger  { background: #fef2f2; border-left: 4px solid #ef4444; padding: 8px 12px; margin: 8px 0; font-size: 12px; }
    @media print {
      body { margin: 16px; }
      .master-banner { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .job-table th, .content table th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <h1>${esc(docName)}</h1>
  <p class="doc-meta">Document ID ${id}${jobInfo ? ` &nbsp;|&nbsp; Attached ${esc(jobInfo.dateAttached)}` : ' &nbsp;|&nbsp; Master'}</p>
  ${masterBannerHtml}
  ${jobHeaderHtml}
  <div class="content">${preRenderedContent}</div>
  <script>window.onload = function() { window.print(); };</script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="${docName.replace(/[^a-z0-9_\-. ]/gi, '_')}.pdf"`);
    res.send(html);
  } catch (err) {
    console.error('Document export PDF error:', err);
    res.status(500).json({ error: 'Export failed', message: String(err) });
  }
}
