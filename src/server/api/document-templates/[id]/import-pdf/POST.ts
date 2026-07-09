/**
 * POST /api/document-templates/:id/import-pdf
 *
 * Import a PDF into the Document Builder.
 *
 * Strategy:
 *  1. Decompress FlateDecode content streams with Node's built-in zlib.
 *  2. Extract text from BT/ET blocks (Tj, TJ, ', " operators).
 *  3. Convert extracted text → heading + rich_text builder blocks.
 *  4. If no text is extractable (scanned/image PDF), return a rich_text
 *     block with a download link so the user still gets something useful.
 *
 * WHY THE OLD VERSION SHOWED ONLY "[PDF: filename — no extractable text]":
 *  The previous extractor tried to regex-match BT/ET operators on the raw
 *  compressed stream bytes. Modern PDFs use FlateDecode (zlib) compression,
 *  so the raw bytes are binary — no operators are ever found. The binary-
 *  content guard (nonPrintable > 10%) then discarded every stream, leaving
 *  zero text and falling through to the placeholder string.
 *
 * No pdfjs-dist, no pdf-parse, no new dependencies.
 *
 * Multipart form: field "pdf" = the .pdf file
 * Returns: { blocks, sourceFileName, pageCount, warnings }
 */
import type { Request, Response } from 'express';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { profiles } from '../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { parseMultipartForm } from '../../../../lib/file-upload.js';
import { nanoid } from 'nanoid';
import type { DocumentBlock, RichTextBlock, HeadingBlock } from '../../../../../components/DocumentBuilder/types.js';
import { extractPdfText } from '../../../../lib/pdf-text-extract.js';

// Persistent upload dir — same root used by the Files feature
const UPLOAD_DIR = '/shared-storage/public/assets/uploads/pdf-imports';

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

    // ── Text extraction ─────────────────────────────────────────────────────
    const { text, pageCount, warnings } = await extractPdfText(pdfFile.buffer);

    // ── Build blocks ────────────────────────────────────────────────────────
    let blocks: DocumentBlock[];

    if (text.trim()) {
      blocks = textToBlocks(text);
    } else {
      // No extractable text — save the PDF to persistent storage and return
      // a rich_text block with a download link so the user isn't left empty.
      const downloadUrl = await savePdfForDownload(pdfFile.buffer, sourceFileName);
      blocks = makeFallbackBlocks(sourceFileName, downloadUrl, warnings);
    }

    return res.json({
      blocks,
      sourceFileName,
      pageCount,
      warnings: warnings.slice(0, 10),
    });
  } catch (err) {
    console.error('POST /api/document-templates/:id/import-pdf error:', err);
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: `Failed to import PDF: ${msg}` });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function newId(): string {
  return nanoid(10);
}

/**
 * Save the PDF buffer to persistent storage and return a public URL.
 * Falls back gracefully if the write fails (e.g. read-only FS in dev).
 */
async function savePdfForDownload(buf: Buffer, originalName: string): Promise<string | null> {
  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    const slug = `${nanoid(8)}-${originalName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const filePath = path.join(UPLOAD_DIR, slug);
    await fs.writeFile(filePath, buf);
    return `/airo-assets/uploads/pdf-imports/${slug}`;
  } catch {
    return null;
  }
}

/**
 * Fallback blocks for scanned / image-only PDFs.
 * Returns a heading + a rich_text block with a download link (if available).
 */
function makeFallbackBlocks(
  filename: string,
  downloadUrl: string | null,
  warnings: string[],
): DocumentBlock[] {
  const reason = warnings[0] ?? 'No extractable text found in this PDF.';

  const heading: HeadingBlock = {
    id: newId(),
    type: 'heading',
    content: filename.replace(/\.pdf$/i, ''),
    level: 2,
    align: 'left',
  };

  let bodyHtml: string;
  if (downloadUrl) {
    bodyHtml =
      `<p><em>${escapeHtml(reason)}</em></p>` +
      `<p>You can <a href="${escapeHtml(downloadUrl)}" target="_blank" rel="noopener noreferrer">` +
      `download the original PDF</a> to view its contents.</p>`;
  } else {
    bodyHtml =
      `<p><em>${escapeHtml(reason)}</em></p>` +
      `<p>This PDF could not be read as text. It may be a scanned document or use image-based content. ` +
      `Please re-upload a text-based PDF or copy the content manually.</p>`;
  }

  const body: RichTextBlock = {
    id: newId(),
    type: 'rich_text',
    html: bodyHtml,
  };

  return [heading, body];
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Text → Blocks conversion ──────────────────────────────────────────────────

/**
 * Convert the raw extracted text string into an array of DocumentBuilder blocks.
 *
 * Heuristics:
 *  - Short lines (< 80 chars) that start with a capital and don't end with
 *    punctuation are treated as headings.
 *  - Everything else is grouped into rich_text paragraphs.
 *  - Blank lines flush the current paragraph.
 */
function textToBlocks(text: string): DocumentBlock[] {
  const blocks: DocumentBlock[] = [];
  const lines = text.split(/\r?\n/);
  let paragraphLines: string[] = [];

  const flushParagraph = () => {
    const para = paragraphLines.join(' ').trim();
    paragraphLines = [];
    if (!para) return;
    blocks.push(makeParagraphBlock(para));
  };

  for (const raw of lines) {
    const line = raw.trim();

    if (!line) {
      flushParagraph();
      continue;
    }

    // Heading heuristic: short, starts with capital/digit, no trailing punctuation
    if (
      line.length < 80 &&
      /^[A-Z0-9]/.test(line) &&
      !line.endsWith('.') &&
      !line.endsWith(',') &&
      !line.endsWith(';') &&
      !line.endsWith(':') &&
      paragraphLines.length === 0
    ) {
      flushParagraph();
      const heading: HeadingBlock = {
        id: newId(),
        type: 'heading',
        content: line,
        level: 2,
        align: 'left',
      };
      blocks.push(heading);
      continue;
    }

    paragraphLines.push(line);
  }

  flushParagraph();

  // If nothing was produced, dump everything as one rich_text block
  if (blocks.length === 0) {
    blocks.push(makeParagraphBlock(text.trim()));
  }

  return blocks;
}

function makeParagraphBlock(text: string): RichTextBlock {
  // Wrap in <p> tags; preserve internal newlines as <br>
  const html = '<p>' + escapeHtml(text).replace(/\n/g, '<br>') + '</p>';
  return { id: newId(), type: 'rich_text', html };
}
