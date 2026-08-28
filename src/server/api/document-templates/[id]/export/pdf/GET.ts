/**
 * GET /api/document-templates/:id/export/pdf
 * ─────────────────────────────────────────────────────────────────────────────
 * Exports a document template as a print-ready HTML page.
 *
 * Query params:
 *   jobStudioDocId  number?  — job_studio_documents.id
 *                              When provided the immutable snapshot is used
 *                              instead of the live master, and job fields are
 *                              injected into the header table.
 *
 * When NO jobStudioDocId is supplied (printing the master directly from Studio)
 * a "Master Document — Not Job Specific" watermark banner is shown.
 *
 * When jobStudioDocId IS supplied the job fields captured at attachment time
 * are rendered in a header table:
 *   Job Title, Job Number, Site Address, Client, Supervisor,
 *   Document Number, Revision, Date Attached.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { profiles } from '../../../../../db/schema.js';
import { eq } from 'drizzle-orm';

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
    const jobStudioDocId = req.query.jobStudioDocId ? Number(req.query.jobStudioDocId) : null;

    // ── Load document ─────────────────────────────────────────────────────────
    const [rows] = await db.execute(sql.raw(
      `SELECT id, name, builder_json, template_type, company_id
       FROM document_templates
       WHERE id = ${id} AND company_id = ${companyId}
       LIMIT 1`
    )) as unknown as [Array<Record<string, unknown>>, unknown];

    const doc = Array.isArray(rows) ? rows[0] : null;
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    const docName = String(doc.name ?? 'Document');

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

    if (jobStudioDocId) {
      try {
        const [jsdRows] = await db.execute(sql.raw(
          `SELECT * FROM job_studio_documents
           WHERE id = ${jobStudioDocId}
             AND studio_doc_id = ${id}
             AND company_id = ${companyId}
           LIMIT 1`
        )) as unknown as [Array<Record<string, unknown>>, unknown];

        const jsd = Array.isArray(jsdRows) ? jsdRows[0] : null;
        if (jsd) {
          jobInfo = {
            jobTitle:      String(jsd.job_title ?? ''),
            jobNumber:     String(jsd.job_number ?? ''),
            siteAddress:   String(jsd.site_address ?? ''),
            clientName:    String(jsd.client_name ?? ''),
            supervisorName: String(jsd.supervisor_name ?? ''),
            docNumber:     String(jsd.doc_number ?? ''),
            revision:      String(jsd.revision ?? '1'),
            dateAttached:  String(jsd.date_attached ?? ''),
            contentSnapshot: jsd.content_snapshot_json ? String(jsd.content_snapshot_json) : null,
          };
        }
      } catch {
        // job_studio_documents table may not exist yet — fall back to master
      }
    }

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
  <div class="content" id="doc-content">Loading…</div>
  <script>
    (function() {
      try {
        var raw = ${builderJsonStr};
        var parsed = (typeof raw === 'string') ? JSON.parse(raw) : raw;
        var blocks = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.blocks) ? parsed.blocks : []);
        var el = document.getElementById('doc-content');
        function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
        if (blocks.length === 0) { el.textContent = 'No content blocks found.'; return; }
        // eslint-disable-next-line no-unsanitized/property -- block content is escaped via esc() before insertion; raw HTML blocks are trusted document-builder output stored in the company's own DB record
        el.innerHTML = blocks.map(function(b) {
          if (!b || !b.type) return '';
          if (b.type === 'heading') {
            var lvl = b.level || 2;
            return '<h' + lvl + '>' + esc(b.content || b.text || '') + '</h' + lvl + '>';
          }
          if (b.type === 'text') return '<p>' + esc(b.content || '') + '</p>';
          if (b.type === 'richtext' || b.type === 'html') return '<p>' + esc(b.content || b.html || '') + '</p>';
          if (b.type === 'divider') return '<hr/>';
          if (b.type === 'spacer') return '<div style="height:' + (b.height || 8) + 'px"></div>';
          if (b.type === 'banner') {
            var cls = 'banner-' + (b.variant || 'info');
            return '<div class="' + cls + '"><strong>' + esc(b.title || '') + '</strong>' + (b.body ? ' — ' + esc(b.body) : '') + '</div>';
          }
          if (b.type === 'table' && Array.isArray(b.columns) && Array.isArray(b.rows)) {
            var cols = b.columns;
            var thead = '<tr>' + cols.map(function(c) { return '<th>' + esc(c.header || c.id || '') + '</th>'; }).join('') + '</tr>';
            var tbody = b.rows.map(function(r) {
              return '<tr>' + cols.map(function(c) { return '<td>' + esc((r.cells || {})[c.id] || '') + '</td>'; }).join('') + '</tr>';
            }).join('');
            return '<table><thead>' + thead + '</thead><tbody>' + tbody + '</tbody></table>';
          }
          return '';
        }).join('');
      } catch(e) {
        document.getElementById('doc-content').textContent = 'Error rendering document: ' + e.message;
      }
      window.onload = function() { window.print(); };
    })();
  </script>
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
