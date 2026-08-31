/**
 * GET /api/document-templates/:id/source-document/pdf-preview
 *
 * Returns a PDF preview of the Word source document.
 * Requires Gotenberg (set GOTENBERG_URL secret) for live conversion.
 * Falls back to cached rendered_pdf_key, then returns 503 with honest message.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../../lib/auth-middleware.js';
import {
  downloadSourceDocument,
  uploadSourceDocument,
} from '../../../../../lib/source-document-storage.js';
import { getSecret } from '#airo/secrets';

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid template ID' });

  try {
    const [rows] = await db.execute(sql.raw(
      `SELECT id, name, source_type, source_file_key, source_sha256,
              source_revision, rendered_pdf_key
       FROM document_templates
       WHERE id = ${id} AND company_id = ${auth.profile.companyId}
       LIMIT 1`
    )) as unknown as [Array<Record<string, unknown>>, unknown];

    const doc = rows?.[0];
    if (!doc) return res.status(404).json({ error: 'Template not found' });

    const srcType = String(doc.source_type ?? 'blocks');
    if (srcType !== 'docx') {
      return res.status(400).json({ error: 'PDF preview is only available for Word source documents.' });
    }

    const fileKey = doc.source_file_key ? String(doc.source_file_key) : null;
    if (!fileKey) return res.status(404).json({ error: 'Source file key not found.' });

    // ── Try Gotenberg conversion ──────────────────────────────────────────────
    const gotenbergUrl = getSecret('GOTENBERG_URL') ?? '';
    if (gotenbergUrl) {
      try {
        const docxBuffer = await downloadSourceDocument(fileKey);
        if (docxBuffer) {
          const pdfBuffer = await convertWithGotenberg(gotenbergUrl, docxBuffer, String(doc.name ?? 'document'));
          if (pdfBuffer) {
            // Cache the PDF
            try {
              const cacheUpload = await uploadSourceDocument(pdfBuffer, {
                companyId: auth.profile.companyId,
                templateId: id,
                revision: Number(doc.source_revision ?? 1),
                originalName: `${String(doc.name ?? 'document')}.pdf`,
                mimeType: 'application/pdf',
              });
              const safe = (s: string) => s.replace(/'/g, "''");
              await db.execute(sql.raw(
                `UPDATE document_templates SET rendered_pdf_key = '${safe(cacheUpload.storageKey)}' WHERE id = ${id}`
              )).catch(() => {/* non-fatal */});
            } catch { /* cache failure is non-fatal */ }

            const docName = String(doc.name ?? 'document').replace(/[^\w\s.\-()]/g, '_');
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `inline; filename="${docName}.pdf"`);
            res.setHeader('Content-Length', pdfBuffer.length);
            res.setHeader('Cache-Control', 'private, max-age=300');
            return res.send(pdfBuffer);
          }
        }
      } catch (e) {
        console.warn('[pdf-preview] Gotenberg conversion failed:', e);
      }
    }

    // ── Try cached PDF ────────────────────────────────────────────────────────
    const cachedKey = doc.rendered_pdf_key ? String(doc.rendered_pdf_key) : null;
    if (cachedKey) {
      try {
        const pdfBuffer = await downloadSourceDocument(cachedKey);
        if (pdfBuffer) {
          const docName = String(doc.name ?? 'document').replace(/[^\w\s.\-()]/g, '_');
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `inline; filename="${docName}.pdf"`);
          res.setHeader('Content-Length', pdfBuffer.length);
          res.setHeader('Cache-Control', 'private, max-age=300');
          res.setHeader('X-Pdf-Source', 'cached');
          return res.send(pdfBuffer);
        }
      } catch { /* fall through */ }
    }

    // ── Unavailable ───────────────────────────────────────────────────────────
    return res.status(503).json({
      error: 'PDF preview unavailable',
      message: gotenbergUrl
        ? 'PDF conversion failed. The original DOCX is still available for download.'
        : 'PDF preview requires a Gotenberg service (set GOTENBERG_URL in secrets). The original DOCX is available for download.',
      downloadAvailable: true,
    });
  } catch (err) {
    console.error('GET source-document/pdf-preview error:', err);
    return res.status(500).json({ error: 'PDF preview failed' });
  }
}

async function convertWithGotenberg(
  gotenbergUrl: string,
  docxBuffer: Buffer,
  docName: string,
): Promise<Buffer | null> {
  const base = gotenbergUrl.replace(/\/$/, '');
  const endpoint = `${base}/forms/libreoffice/convert`;
  const boundary = `----GotenbergBoundary${Date.now()}`;
  const safeName = `${docName.replace(/[^\w\s.\-()]/g, '_')}.docx`;

  const header = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="files"; filename="${safeName}"\r\n` +
    `Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\n\r\n`
  );
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([header, docxBuffer, footer]);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': String(body.length),
      },
      body,
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
