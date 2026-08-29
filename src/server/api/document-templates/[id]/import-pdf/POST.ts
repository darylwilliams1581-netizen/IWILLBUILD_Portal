/**
 * POST /api/document-templates/:id/import-pdf
 *
 * Import a PDF into the Document Builder as ordered pdf_page blocks.
 *
 * Strategy:
 *  1. Store the original PDF once to persistent storage.
 *  2. Detect the page count (via cross-reference table or /Count entry).
 *  3. Return one pdf_page block per original page — three pages → three blocks.
 *     Each block references the same stored source key + pageIndex/pageNumber.
 *  4. Blocks can be moved, duplicated, and deleted independently.
 *  5. No OCR / editable text this pass.
 *
 * Multipart form: field "pdf" = the .pdf file
 * Returns: { blocks, sourceFileName, pageCount, warnings }
 */
import type { Request, Response } from 'express';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { profiles } from '../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { parseMultipartForm } from '../../../../lib/file-upload.js';
import { nanoid } from 'nanoid';
import type { DocumentBlock, PdfPageBlock } from '../../../../../components/DocumentBuilder/types.js';
import { savePdfSource, getPdfDownloadUrl } from '../../../../lib/pdf-source-storage.js';
import { detectPdfPageCount } from '../../../../lib/pdf-page-count.js';

export default async function handler(req: Request, res: Response) {
  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const [profile] = await db.select().from(profiles).where(eq(profiles.userId, session.user.id)).limit(1);
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    // ── Template ownership ──────────────────────────────────────────────────
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid template ID' });

    const [rows] = await db.execute(sql.raw(
      `SELECT id FROM document_templates WHERE id = ${id} AND company_id = ${profile.companyId} LIMIT 1`
    )) as unknown as [Array<{ id: number }>, unknown];
    if (!rows?.[0]) return res.status(404).json({ error: 'Template not found' });

    // ── Parse upload ────────────────────────────────────────────────────────
    const { files } = await parseMultipartForm(req, { maxFileSize: 50 * 1024 * 1024 });
    const pdfFile = files.find(
      (f) => f.fieldname === 'pdf' || f.originalname?.toLowerCase().endsWith('.pdf')
    );
    if (!pdfFile?.buffer) {
      return res.status(400).json({
        error: 'No PDF file uploaded. Send a .pdf file in the "pdf" form field.',
      });
    }

    const sourceFileName = pdfFile.originalname ?? 'document.pdf';
    const warnings: string[] = [];

    // ── Detect page count ───────────────────────────────────────────────────
    const pageCount = detectPdfPageCount(pdfFile.buffer);
    if (pageCount < 1) {
      warnings.push('Could not determine page count — treating as 1 page.');
    }
    const totalPages = Math.max(pageCount, 1);

    // ── Store PDF once ──────────────────────────────────────────────────────
    const { storageKey, downloadUrl } = await savePdfSource(pdfFile.buffer, {
      companyId: profile.companyId,
      templateId: id,
      originalName: sourceFileName,
    });

    // ── Build one pdf_page block per page ───────────────────────────────────
    const blocks: DocumentBlock[] = [];
    for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
      const block: PdfPageBlock = {
        id: nanoid(10),
        type: 'pdf_page',
        storageKey,
        downloadUrl,
        pageIndex,
        pageNumber: pageIndex + 1,
        totalPages,
        sourceFileName,
      };
      blocks.push(block);
    }

    return res.json({
      blocks,
      sourceFileName,
      pageCount: totalPages,
      warnings: warnings.slice(0, 10),
    });
  } catch (err) {
    console.error('POST /api/document-templates/:id/import-pdf error:', err);
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: `Failed to import PDF: ${msg}` });
  }
}
