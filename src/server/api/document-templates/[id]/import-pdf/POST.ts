/**
 * POST /api/document-templates/:id/import-pdf
 * Import a PDF into the document builder as text blocks.
 *
 * Uses pdf-parse via a runtime require() that bypasses Rollup's
 * pdfjs-dist SSR alias, so it works in the production bundle.
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
import type { DocumentBlock } from '../../../../../components/DocumentBuilder/types.js';
import { extractPdfText } from '../../../../lib/pdf-text-extract.js';

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
    if (!id) return res.status(400).json({ error: 'Invalid template ID' });

    // Verify template ownership
    const [rows] = await db.execute(sql.raw(
      `SELECT id FROM document_templates WHERE id = ${id} AND company_id = ${profile.companyId} LIMIT 1`
    )) as unknown as [Array<{ id: number }>, unknown];
    if (!rows?.[0]) return res.status(404).json({ error: 'Template not found' });

    // Parse multipart upload
    const { files } = await parseMultipartForm(req, { maxFileSize: 50 * 1024 * 1024 });
    const pdfFile = files.find((f) => f.fieldname === 'pdf' || f.originalname?.toLowerCase().endsWith('.pdf'));
    if (!pdfFile?.buffer) {
      return res.status(400).json({ error: 'No PDF file uploaded. Upload a .pdf file in the "pdf" field.' });
    }

    // Extract text using runtime-required pdf-parse (bypasses Rollup alias)
    const { text, pageCount, warnings } = await extractPdfText(pdfFile.buffer);

    // Convert extracted text → builder blocks
    const blocks = pdfTextToBlocks(text, pdfFile.originalname ?? 'document.pdf');

    return res.json({
      blocks,
      sourceFileName: pdfFile.originalname ?? 'document.pdf',
      pageCount,
      warnings: warnings.slice(0, 10),
    });
  } catch (err) {
    console.error('POST /api/document-templates/:id/import-pdf error:', err);
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: `Failed to import PDF: ${msg}` });
  }
}

// ── PDF text → Builder Blocks ─────────────────────────────────────────────────

function newId(): string {
  return nanoid(10);
}

function pdfTextToBlocks(text: string, filename: string): DocumentBlock[] {
  const blocks: DocumentBlock[] = [];

  if (!text.trim()) {
    // No text extracted (scanned PDF or image-only)
    blocks.push({
      id: newId(),
      type: 'text',
      content: `[PDF: ${filename} — no extractable text found. This may be a scanned document.]`,
      align: 'left',
    });
    return blocks;
  }

  // Split into lines and group into paragraphs
  const lines = text.split(/\r?\n/);
  let currentParagraph: string[] = [];

  const flushParagraph = () => {
    const para = currentParagraph.join(' ').trim();
    currentParagraph = [];
    if (!para) return;

    // Heuristic: short lines with no period at end → likely a heading
    if (para.length < 80 && !para.endsWith('.') && !para.endsWith(',') && /^[A-Z0-9]/.test(para)) {
      blocks.push({ id: newId(), type: 'heading', content: para, level: 2, align: 'left' });
    } else {
      blocks.push({ id: newId(), type: 'text', content: para, align: 'left' });
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      // Blank line = paragraph break
      flushParagraph();
    } else if (trimmed.length < 60 && !trimmed.endsWith('.') && !trimmed.endsWith(',') && currentParagraph.length === 0) {
      // Short standalone line at start of paragraph = likely heading
      flushParagraph();
      blocks.push({ id: newId(), type: 'heading', content: trimmed, level: 2, align: 'left' });
    } else {
      currentParagraph.push(trimmed);
    }
  }

  flushParagraph();

  if (blocks.length === 0) {
    blocks.push({ id: newId(), type: 'text', content: text.trim(), align: 'left' });
  }

  return blocks;
}
