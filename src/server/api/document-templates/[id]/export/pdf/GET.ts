/**
 * GET /api/document-templates/:id/export/pdf
 *
 * Exports a document template as a PDF.
 * Uses the browser-print approach: returns the document JSON so the client
 * can render it and trigger window.print(). For server-side PDF generation
 * this endpoint returns the document data with a print-ready HTML wrapper.
 *
 * NOTE: Full server-side PDF generation (puppeteer/pdfkit) requires additional
 * infrastructure. This endpoint currently redirects to the document viewer
 * with a print flag so the user can use browser print-to-PDF.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { profiles } from '../../../../../db/schema.js';
import { eq } from 'drizzle-orm';

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

    const [rows] = await db.execute(sql.raw(
      `SELECT id, name, content_json, company_id FROM document_templates WHERE id = ${id} AND company_id = ${profile.companyId} LIMIT 1`
    )) as unknown as [Array<Record<string, unknown>>, unknown];

    const doc = Array.isArray(rows) ? rows[0] : null;
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    // Return a minimal print-ready HTML page that the browser can print to PDF.
    // The content_json blocks are serialised into a data attribute so the page
    // can render them without a separate API call.
    const name = String(doc.name ?? 'Document');
    const contentJson = JSON.stringify(doc.content_json ?? {});

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${name.replace(/</g, '&lt;')}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #1e293b; }
    h1 { font-size: 22px; margin-bottom: 8px; }
    .meta { font-size: 12px; color: #64748b; margin-bottom: 24px; }
    .content { white-space: pre-wrap; font-size: 13px; line-height: 1.6; }
    @media print { body { margin: 20px; } }
  </style>
</head>
<body>
  <h1>${name.replace(/</g, '&lt;')}</h1>
  <p class="meta">Exported from IWILLBUILD — Document ID ${id}</p>
  <div class="content" id="doc-content">Loading document…</div>
  <script>
    try {
      const data = ${contentJson};
      const blocks = Array.isArray(data.blocks) ? data.blocks : [];
      const el = document.getElementById('doc-content');
      if (blocks.length === 0) {
        el.textContent = 'No content blocks found.';
      } else {
        el.innerHTML = blocks.map(b => {
          if (b.type === 'text' || b.type === 'richtext') return '<p>' + (b.content || b.html || '') + '</p>';
          if (b.type === 'heading') return '<h2>' + (b.text || '') + '</h2>';
          if (b.type === 'table') return '<p>[Table block]</p>';
          return '<p>' + JSON.stringify(b) + '</p>';
        }).join('');
      }
    } catch(e) { document.getElementById('doc-content').textContent = 'Error rendering document.'; }
    window.onload = function() { window.print(); };
  </script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="${name.replace(/[^a-z0-9_\-. ]/gi, '_')}.pdf"`);
    res.send(html);
  } catch (err) {
    console.error('Document export PDF error:', err);
    res.status(500).json({ error: 'Export failed', message: String(err) });
  }
}
