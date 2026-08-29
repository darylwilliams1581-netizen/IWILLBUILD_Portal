/**
 * POST /api/document-templates/:id/import-docx
 * Parse an uploaded DOCX file and return builder blocks.
 *
 * Multipart form: field "docx" = the .docx file
 *
 * Returns: { blocks, sourceDocxName, warnings }
 *
 * Uses JSZip + custom XML parser — no mammoth dependency.
 * JSZip is pure-JS and bundles cleanly with Rollup/noExternal:true.
 *
 * All XML parsing uses deterministic indexOf/slice traversal — no [\s\S]*?
 * patterns on document-wide strings. This prevents catastrophic backtracking
 * on large SWMS DOCX files with nested content controls and wide risk tables.
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
import JSZip from 'jszip';
import { uploadSourceDocument, deleteSourceDocument } from '../../../../lib/source-document-storage.js';
import { saveFile, deleteFile } from '../../../../storage/storage-service.js';
import { runConvertHtml, BUCKET_DOC_ASSETS } from '../../../../lib/import-docx-convert-html.js';
export { BUCKET_DOC_ASSETS };
// Export parser internals for unit testing
export { parseDocxToBlocks, expandSdtElements, parseDocumentXml, parseTableXml };

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

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

    console.log(`[import-docx] companyId=${profile.companyId} templateId=${id} contentType=${req.headers['content-type']?.slice(0, 60)}`);

    // Verify template ownership
    const [rows] = await db.execute(sql.raw(
      `SELECT id, source_revision FROM document_templates
       WHERE id = ${id} AND company_id = ${profile.companyId} LIMIT 1`
    )) as unknown as [Array<{ id: number; source_revision: number | null }>, unknown];
    if (!rows?.[0]) return res.status(404).json({ error: 'Template not found' });

    // Parse multipart upload — accept field "docx" or "file"
    const { files, fields } = await parseMultipartForm(req, { maxFileSize: 50 * 1024 * 1024 });
    const docxFile = files.find((f) =>
      f.fieldname === 'docx' || f.fieldname === 'file' || f.originalname?.endsWith('.docx')
    );
    if (!docxFile?.buffer) {
      return res.status(400).json({ error: 'No DOCX file uploaded. Upload a .docx file in the "docx" field.' });
    }

    const originalName = docxFile.originalname ?? 'document.docx';
    // mode: 'keep_word' (default — store original) | 'convert_blocks_v2' (new semantic block path) | 'convert_html' (html canvas) | 'convert_blocks' (legacy)
    const mode = (fields.mode as string | undefined) ?? 'keep_word';
    console.log(`[import-docx] templateId=${id} mode=${mode} file=${originalName} size=${docxFile.buffer.length}`);

    // ── Mode: keep_word — store original DOCX in R2, do not convert ──────────
    if (mode === 'keep_word') {
      const currentRevision = Number(rows[0].source_revision ?? 0);
      const newRevision = currentRevision + 1;

      const upload = await uploadSourceDocument(docxFile.buffer, {
        companyId: profile.companyId,
        templateId: id,
        revision: newRevision,
        originalName,
        mimeType: DOCX_MIME,
      });

      const safe = (s: string) => s.replace(/'/g, "''");
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

      await db.execute(sql.raw(
        `UPDATE document_templates SET
           source_type       = 'docx',
           source_file_key   = '${safe(upload.storageKey)}',
           source_file_name  = '${safe(originalName)}',
           source_mime_type  = '${safe(DOCX_MIME)}',
           source_sha256     = '${safe(upload.sha256)}',
           source_revision   = ${newRevision},
           source_updated_at = '${now}',
           rendered_pdf_key  = NULL,
           updated_at        = '${now}'
         WHERE id = ${id}`
      ));

      // Insert revision history (non-fatal if table not yet created)
      await db.execute(sql.raw(
        `INSERT INTO document_template_revisions
           (template_id, company_id, revision, source_type, source_file_key,
            source_file_name, source_mime_type, source_sha256, file_size_bytes,
            uploaded_by, uploaded_at)
         VALUES
           (${id}, ${profile.companyId}, ${newRevision}, 'docx',
            '${safe(upload.storageKey)}', '${safe(originalName)}', '${safe(DOCX_MIME)}',
            '${safe(upload.sha256)}', ${upload.sizeBytes},
            '${safe(session.user.id)}', '${now}')`
      )).catch((e: unknown) => {
        console.warn('[import-docx] revision history insert failed:', e);
      });

      return res.json({
        mode: 'keep_word',
        sourceDocxName: originalName,
        sha256: upload.sha256,
        revision: newRevision,
        sizeBytes: upload.sizeBytes,
      });
    }

    // ── Mode: convert_html — DOCX → editable HTML canvas (legacy path) ──────
    if (mode === 'convert_html') {
      return await handleConvertHtml({
        req, res,
        docxBuffer: docxFile.buffer,
        originalName,
        templateId: id,
        companyId: profile.companyId,
        userId: session.user.id,
        currentRevision: Number(rows[0].source_revision ?? 0),
      });
    }

    // ── Mode: convert_blocks_v2 — DOCX → semantically grouped builder blocks ─
    // This is the new primary import path. Blocks are written to builder_json
    // via the existing import-blocks endpoint; the server returns the block
    // array so the client can apply them to the canvas without a round-trip.
    if (mode === 'convert_blocks_v2') {
      const { blocks, warnings } = await parseDocxToBlocks(docxFile.buffer);
      return res.json({
        mode: 'convert_blocks_v2',
        blocks,
        sourceDocxName: originalName,
        warnings: warnings.slice(0, 10),
      });
    }

    // ── Mode: convert_blocks — legacy DOCX → blocks conversion ───────────────
    const { blocks, warnings } = await parseDocxToBlocks(docxFile.buffer);

    // Store legacy source reference
    const storedName = `docx-${nanoid(8)}-${originalName}`;
    await db.execute(sql.raw(
      `UPDATE document_templates SET source_docx_name = ${JSON.stringify(originalName)}, source_docx_path = ${JSON.stringify(storedName)} WHERE id = ${id}`
    ));

    return res.json({
      mode: 'convert_blocks',
      blocks,
      sourceDocxName: originalName,
      warnings: warnings.slice(0, 10),
    });
  } catch (err) {
    console.error('POST /api/document-templates/:id/import-docx error:', err);
    const raw = err instanceof Error ? err.message : String(err);
    let msg = `Failed to parse DOCX file: ${raw}`;
    if (/corrupted zip/i.test(raw) || /missing \d+ bytes/i.test(raw)) {
      msg = 'The file appears to be corrupted or incomplete. Re-save the document in Word and try again.';
    } else if (/not a valid docx/i.test(raw) || /document\.xml not found/i.test(raw)) {
      msg = 'This file is not a valid Word document (.docx). Make sure you are uploading a .docx file saved by Microsoft Word or Google Docs.';
    } else if (/password/i.test(raw) || /encrypted/i.test(raw)) {
      msg = 'This document is password-protected. Remove the password in Word and try again.';
    }
    return res.status(500).json({ error: msg });
  }
}

// ── convert_html handler ──────────────────────────────────────────────────────

/**
 * Thin wrapper: delegates to runConvertHtml (in lib/import-docx-convert-html.ts)
 * with the live DB/storage dependencies injected.
 */
async function handleConvertHtml(opts: {
  req: Request;
  res: Response;
  docxBuffer: Buffer;
  originalName: string;
  templateId: number;
  companyId: number;
  userId: string;
  currentRevision: number;
}): Promise<Response> {
  const { res, docxBuffer, originalName, templateId, companyId, userId, currentRevision } = opts;

  const result = await runConvertHtml(
    { docxBuffer, originalName, templateId, companyId, userId, currentRevision },
    {
      dbExecute: (q) => db.execute(sql.raw(q.sql)),
      uploadSourceDocument,
      deleteSourceDocument,
      saveFile,
      deleteFile,
    },
  );

  if (!result.ok) {
    return res.status(result.status).json({ error: result.error });
  }
  return res.json(result.payload);
}

// ── DOCX → Builder Blocks (pure-JS, no mammoth) ───────────────────────────────

function newId(): string {
  return nanoid(10);
}

interface ParseResult {
  blocks: DocumentBlock[];
  warnings: string[];
}

async function parseDocxToBlocks(buffer: Buffer): Promise<ParseResult> {
  const warnings: string[] = [];

  // Unzip the .docx (which is a ZIP archive)
  const zip = await JSZip.loadAsync(buffer);

  // Read word/document.xml — the main content
  const docXmlFile = zip.file('word/document.xml');
  if (!docXmlFile) {
    throw new Error('Not a valid DOCX file — word/document.xml not found');
  }
  const docXml = await docXmlFile.async('string');

  // Read numbering.xml for list styles (optional)
  const numberingFile = zip.file('word/numbering.xml');
  const numberingXml = numberingFile ? await numberingFile.async('string') : null;

  // Parse numbering to know which numIds are ordered lists
  const orderedNumIds = numberingXml ? parseOrderedNumIds(numberingXml) : new Set<string>();

  // Parse the document body
  const blocks = parseDocumentXml(docXml, orderedNumIds, warnings);

  return { blocks, warnings };
}

// ── Numbering parser — detect ordered vs unordered lists ─────────────────────

function parseOrderedNumIds(xml: string): Set<string> {
  const ordered = new Set<string>();
  // abstractNumId entries with numFmt = decimal/lowerLetter/lowerRoman etc.
  // Rewritten to avoid [\s\S]*? (which SAST flags as potentially unsafe):
  // split on the closing tag first, then search each chunk for the numFmt attribute.
  const abstractChunks = xml.split(/<\/w:abstractNum>/);
  for (const chunk of abstractChunks) {
    const idMatch = /<w:abstractNum\s+w:abstractNumId="(\d+)"/.exec(chunk);
    if (!idMatch) continue;
    const abstractId = idMatch[1];
    if (/<w:numFmt\s+w:val="(?:decimal|lowerLetter|upperLetter|lowerRoman|upperRoman)"/.test(chunk)) {
      ordered.add(abstractId);
    }
  }
  // Map numId → abstractNumId — split on </w:num> to avoid [\s\S]*? pattern
  const numChunks = xml.split(/<\/w:num>/);
  const orderedNumIds = new Set<string>();
  for (const chunk of numChunks) {
    const numIdMatch = /<w:num\s+w:numId="(\d+)"/.exec(chunk);
    const abstractIdMatch = /<w:abstractNumId\s+w:val="(\d+)"/.exec(chunk);
    if (numIdMatch && abstractIdMatch && ordered.has(abstractIdMatch[1])) {
      orderedNumIds.add(numIdMatch[1]);
    }
  }
  return orderedNumIds;
}

// ── Document XML parser — semantic grouping ───────────────────────────────────
//
// Anti-fragmentation rules (per spec):
//   • Consecutive normal paragraphs accumulate into ONE rich_text block.
//   • Flush/start a new rich_text block ONLY at:
//       1. A heading (H1–H6) → heading block; following body paragraphs accumulate fresh.
//       2. A meaningful blank gap (2+ consecutive empty paragraphs) → close current block.
//       3. A table → its own table block.
//       4. A page/section break → page_break block.
//       5. A horizontal rule → divider block.
//   • List items accumulate into one rich_text block per contiguous numId run.
//     A list run that immediately follows body paragraphs is appended to the
//     same rich_text accumulator (not a separate block) unless the list starts
//     a new numId run after a non-list paragraph.
//   • Word paragraph marks, wrapped display lines, bold/italic/colour changes
//     are NOT block boundaries.
//   • Empty paragraphs never create blocks; repeated blanks collapse.

function parseDocumentXml(xml: string, orderedNumIds: Set<string>, warnings: string[]): DocumentBlock[] {
  const blocks: DocumentBlock[] = [];

  // Extract the body content using indexOf/slice — avoids [\s\S]*? on a multi-MB string
  // which causes catastrophic backtracking and proxy timeouts on large DOCX files.
  const BODY_OPEN  = '<w:body>';
  const BODY_CLOSE = '</w:body>';
  const bodyStart = xml.indexOf(BODY_OPEN);
  if (bodyStart === -1) {
    warnings.push('Could not find document body');
    return blocks;
  }
  const contentStart = bodyStart + BODY_OPEN.length;
  const bodyEnd = xml.lastIndexOf(BODY_CLOSE); // lastIndexOf: safe even if tag appears in comments
  const body = bodyEnd > contentStart ? xml.slice(contentStart, bodyEnd) : xml.slice(contentStart);

  // Expand content controls (w:sdt) at the body level before splitting
  const expandedBody = expandSdtElements(body);

  // Split into top-level elements: paragraphs and tables
  const elements = splitBodyElements(expandedBody);

  // ── Accumulator for body paragraphs ────────────────────────────────────────
  // We collect HTML fragments here and flush them as one rich_text block when
  // a semantic boundary is reached.
  let richParts: string[] = [];
  let consecutiveBlanks = 0;

  /** Flush the accumulated rich_text parts as a single block (if non-empty). */
  function flushRich() {
    if (richParts.length === 0) return;
    const html = richParts.join('\n');
    richParts = [];
    consecutiveBlanks = 0;
    blocks.push({ id: newId(), type: 'rich_text', html });
  }

  let i = 0;
  while (i < elements.length) {
    const el = elements[i];

    // ── Table ───────────────────────────────────────────────────────────────
    if (el.type === 'table') {
      flushRich();
      const tableBlock = parseTableXml(el.xml);
      if (tableBlock) blocks.push(tableBlock);
      i++;
      continue;
    }

    // ── Paragraph ───────────────────────────────────────────────────────────
    if (el.type === 'paragraph') {
      const para = parseParagraph(el.xml);

      // Page / section break → flush and emit page_break
      if (para.isPageBreak) {
        flushRich();
        blocks.push({ id: newId(), type: 'page_break' });
        i++;
        continue;
      }

      // Horizontal rule → flush and emit divider
      if (para.isHr) {
        flushRich();
        blocks.push({ id: newId(), type: 'divider', style: 'solid', thickness: 1 });
        i++;
        continue;
      }

      // Heading → flush current accumulator, emit heading block
      if (para.headingLevel) {
        flushRich();
        if (para.text) {
          blocks.push({ id: newId(), type: 'heading', content: para.text, level: para.headingLevel, align: 'left' });
        }
        consecutiveBlanks = 0;
        i++;
        continue;
      }

      // List paragraph — collect the entire contiguous run for this numId
      if (para.numId) {
        // Lists are appended to the current rich accumulator (not a separate block)
        // so that text → list → text within one section stays one block.
        const numId = para.numId;
        const isOrdered = orderedNumIds.has(numId);
        const items: string[] = [para.innerHtml || escapeHtml(para.text)];

        while (i + 1 < elements.length) {
          const next = elements[i + 1];
          if (next.type !== 'paragraph') break;
          const nextPara = parseParagraph(next.xml);
          if (nextPara.numId !== numId) break;
          items.push(nextPara.innerHtml || escapeHtml(nextPara.text));
          i++;
        }

        const tag = isOrdered ? 'ol' : 'ul';
        const listHtml = `<${tag}>${items.map((t) => `<li>${t}</li>`).join('')}</${tag}>`;
        richParts.push(listHtml);
        consecutiveBlanks = 0;
        i++;
        continue;
      }

      // Empty paragraph — count consecutive blanks; flush on 2+
      if (!para.text.trim()) {
        consecutiveBlanks++;
        if (consecutiveBlanks >= 2) {
          flushRich();
        }
        i++;
        continue;
      }

      // Normal body paragraph — accumulate into rich_text
      consecutiveBlanks = 0;
      const paraHtml = para.hasFormatting
        ? `<p>${para.innerHtml}</p>`
        : `<p>${escapeHtml(para.text)}</p>`;
      richParts.push(paraHtml);
      i++;
      continue;
    }

    i++;
  }

  // Flush any remaining accumulated content
  flushRich();

  if (blocks.length === 0) {
    warnings.push('No content blocks found in document');
  }

  return blocks;
}

/** Expand top-level w:sdt content controls into their inner content.
 *  Uses split-on-close-tag to avoid [\s\S]*? on the full body string.
 */
function expandSdtElements(body: string): string {
  // Fast path: no content controls present
  if (!body.includes('<w:sdt')) return body;

  const SDT_OPEN    = '<w:sdt>';
  const SDT_OPEN_SP = '<w:sdt ';
  const SDT_CLOSE   = '</w:sdt>';
  const CONTENT_OPEN  = '<w:sdtContent>';
  const CONTENT_CLOSE = '</w:sdtContent>';

  const parts: string[] = [];
  let pos = 0;

  while (pos < body.length) {
    // Find next <w:sdt> or <w:sdt ...>
    const openA = body.indexOf(SDT_OPEN, pos);
    const openB = body.indexOf(SDT_OPEN_SP, pos);
    let sdtStart = -1;
    if (openA !== -1 && openB !== -1) sdtStart = Math.min(openA, openB);
    else if (openA !== -1) sdtStart = openA;
    else if (openB !== -1) sdtStart = openB;

    if (sdtStart === -1) {
      // No more sdt elements — append remainder
      parts.push(body.slice(pos));
      break;
    }

    // Append everything before this sdt
    parts.push(body.slice(pos, sdtStart));

    // Find the matching </w:sdt> — must handle nesting
    let depth = 1;
    let searchPos = sdtStart + SDT_OPEN.length; // advance past the opening tag chars
    // Advance past the actual opening tag (may be <w:sdt ...>)
    const tagEnd = body.indexOf('>', sdtStart);
    if (tagEnd !== -1) searchPos = tagEnd + 1;

    while (depth > 0 && searchPos < body.length) {
      // IMPORTANT: search for '<w:sdt>' or '<w:sdt ' only — NOT '<w:sdt' which
      // would also match '<w:sdtContent>' and '<w:sdtPr>', causing depth overcounting.
      const nextOpenA = body.indexOf(SDT_OPEN, searchPos);
      const nextOpenB = body.indexOf(SDT_OPEN_SP, searchPos);
      let nextOpen = -1;
      if (nextOpenA !== -1 && nextOpenB !== -1) nextOpen = Math.min(nextOpenA, nextOpenB);
      else if (nextOpenA !== -1) nextOpen = nextOpenA;
      else if (nextOpenB !== -1) nextOpen = nextOpenB;

      const nextClose = body.indexOf(SDT_CLOSE, searchPos);
      if (nextClose === -1) { searchPos = body.length; break; }
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        // Advance past the nested open tag
        const nestedEnd = body.indexOf('>', nextOpen);
        searchPos = nestedEnd !== -1 ? nestedEnd + 1 : nextOpen + 6;
      } else {
        depth--;
        if (depth === 0) {
          // Extract inner content of this sdt
          const sdtInner = body.slice(sdtStart, nextClose + SDT_CLOSE.length);
          const cStart = sdtInner.indexOf(CONTENT_OPEN);
          if (cStart !== -1) {
            const cEnd = sdtInner.indexOf(CONTENT_CLOSE, cStart + CONTENT_OPEN.length);
            if (cEnd !== -1) {
              parts.push(sdtInner.slice(cStart + CONTENT_OPEN.length, cEnd));
            }
          }
          pos = nextClose + SDT_CLOSE.length;
        } else {
          searchPos = nextClose + SDT_CLOSE.length;
        }
      }
    }

    if (depth !== 0) {
      // Malformed — skip to end
      pos = body.length;
    }
  }

  return parts.join('');
}

// ── Split body into paragraph/table elements ──────────────────────────────────

interface BodyElement {
  type: 'paragraph' | 'table' | 'other';
  xml: string;
}

function splitBodyElements(body: string): BodyElement[] {
  const elements: BodyElement[] = [];
  // Split on top-level element boundaries rather than using [\s\S]*? alternation
  // (which SAST flags as potentially unsafe due to nested quantifiers).
  // Strategy: find each <w:p> or <w:tbl> start tag, then find its matching close tag
  // by scanning forward — avoids the alternation+[\s\S]*? pattern entirely.
  let pos = 0;
  while (pos < body.length) {
    const pStart = body.indexOf('<w:p', pos);
    const tStart = body.indexOf('<w:tbl', pos);

    // Pick whichever comes first
    let tagStart: number;
    let isTable: boolean;
    if (pStart === -1 && tStart === -1) break;
    if (pStart === -1) { tagStart = tStart; isTable = true; }
    else if (tStart === -1) { tagStart = pStart; isTable = false; }
    else if (tStart < pStart) { tagStart = tStart; isTable = true; }
    else { tagStart = pStart; isTable = false; }

    const closeTag = isTable ? '</w:tbl>' : '</w:p>';
    const selfClose = '<w:p/>';

    // Self-closing <w:p/>
    if (!isTable && body.slice(tagStart, tagStart + 6) === selfClose) {
      elements.push({ type: 'paragraph', xml: selfClose });
      pos = tagStart + 6;
      continue;
    }

    const closePos = body.indexOf(closeTag, tagStart);
    if (closePos === -1) break;
    const xml = body.slice(tagStart, closePos + closeTag.length);
    elements.push({ type: isTable ? 'table' : 'paragraph', xml });
    pos = closePos + closeTag.length;
  }
  return elements;
}

// ── Paragraph parser ──────────────────────────────────────────────────────────

interface ParsedParagraph {
  text: string;
  innerHtml: string;
  headingLevel: number | null;
  numId: string | null;
  isHr: boolean;
  isPageBreak: boolean;
  hasFormatting: boolean;
}

function parseParagraph(xml: string): ParsedParagraph {
  // Heading style
  let headingLevel: number | null = null;
  const styleMatch = /<w:pStyle\s+w:val="([^"]+)"/.exec(xml);
  if (styleMatch) {
    const style = styleMatch[1].toLowerCase();
    if (style === 'heading1' || style === 'title') headingLevel = 1;
    else if (style === 'heading2' || style === 'subtitle') headingLevel = 2;
    else if (style === 'heading3') headingLevel = 3;
    else if (style === 'heading4' || style === 'heading5' || style === 'heading6') headingLevel = 4;
  }

  // List numId
  let numId: string | null = null;
  const numIdMatch = /<w:numId\s+w:val="(\d+)"/.exec(xml);
  if (numIdMatch && numIdMatch[1] !== '0') numId = numIdMatch[1];

  // Horizontal rule — uses bounded check on pBdr section only
  let isHr = false;
  const pBdrStart = xml.indexOf('<w:pBdr>');
  if (pBdrStart !== -1) {
    const pBdrEnd = xml.indexOf('</w:pBdr>', pBdrStart);
    const pBdrSection = pBdrEnd !== -1 ? xml.slice(pBdrStart, pBdrEnd) : xml.slice(pBdrStart);
    isHr = pBdrSection.includes('<w:bottom') && !xml.includes('<w:t');
  }

  // Page / section break
  const isPageBreak =
    xml.includes('<w:pageBreakBefore/>') ||
    xml.includes('<w:pageBreakBefore />') ||
    /<w:br\s+w:type="page"/.test(xml) ||
    /<w:br\s+w:type="column"/.test(xml) ||
    xml.includes('<w:lastRenderedPageBreak/>') ||
    xml.includes('<w:lastRenderedPageBreak />');

  // Extract runs using bounded indexOf/slice — avoids [\s\S]*? on paragraph XML
  let text = '';
  let innerHtml = '';
  let hasFormatting = false;

  // Parse all <w:r>...</w:r> runs using indexOf/slice
  let rPos = 0;
  while (rPos < xml.length) {
    // Find next run opening tag: <w:r> or <w:r ...>
    const rOpenA = xml.indexOf('<w:r>', rPos);
    const rOpenB = xml.indexOf('<w:r ', rPos);
    let rStart = -1;
    if (rOpenA !== -1 && rOpenB !== -1) rStart = Math.min(rOpenA, rOpenB);
    else if (rOpenA !== -1) rStart = rOpenA;
    else if (rOpenB !== -1) rStart = rOpenB;
    if (rStart === -1) break;

    const rClose = xml.indexOf('</w:r>', rStart);
    if (rClose === -1) break;
    const runXml = xml.slice(rStart, rClose + 6);
    rPos = rClose + 6;

    // Extract text from <w:t>...</w:t> within this run
    const textParts: string[] = [];
    let tPos = 0;
    while (tPos < runXml.length) {
      const tOpenA = runXml.indexOf('<w:t>', tPos);
      const tOpenB = runXml.indexOf('<w:t ', tPos);
      let tStart = -1;
      if (tOpenA !== -1 && tOpenB !== -1) tStart = Math.min(tOpenA, tOpenB);
      else if (tOpenA !== -1) tStart = tOpenA;
      else if (tOpenB !== -1) tStart = tOpenB;
      if (tStart === -1) break;
      const tTagEnd = runXml.indexOf('>', tStart);
      if (tTagEnd === -1) break;
      const tClose = runXml.indexOf('</w:t>', tTagEnd);
      if (tClose === -1) break;
      textParts.push(runXml.slice(tTagEnd + 1, tClose));
      tPos = tClose + 6;
    }
    const runText = textParts.join('');
    if (!runText) continue;

    text += runText;

    // Check formatting — bounded to run properties section (before first <w:t>)
    const firstT = runXml.indexOf('<w:t');
    const rPrSection = firstT !== -1 ? runXml.slice(0, firstT) : runXml;
    const isBold = rPrSection.includes('<w:b/>') || rPrSection.includes('<w:b>') ||
                   rPrSection.includes('<w:b ');
    const isItalic = rPrSection.includes('<w:i/>') || rPrSection.includes('<w:i>') ||
                     rPrSection.includes('<w:i ');
    const isUnderline = /<w:u\s+w:val="(?!none)[^"]*"/.test(rPrSection);

    if (isBold || isItalic || isUnderline) hasFormatting = true;

    let span = escapeHtml(runText);
    if (isBold) span = `<strong>${span}</strong>`;
    if (isItalic) span = `<em>${span}</em>`;
    if (isUnderline) span = `<u>${span}</u>`;
    innerHtml += span;
  }

  // Also handle <w:hyperlink>...</w:hyperlink> — bounded indexOf/slice
  let hlPos = 0;
  while (hlPos < xml.length) {
    const hlStart = xml.indexOf('<w:hyperlink', hlPos);
    if (hlStart === -1) break;
    const hlTagEnd = xml.indexOf('>', hlStart);
    if (hlTagEnd === -1) break;
    const hlClose = xml.indexOf('</w:hyperlink>', hlTagEnd);
    if (hlClose === -1) break;
    const hlInner = xml.slice(hlTagEnd + 1, hlClose);
    const hlText = extractPlainText(hlInner);
    if (hlText && !text.includes(hlText)) {
      text += hlText;
      innerHtml += `<u>${escapeHtml(hlText)}</u>`;
      hasFormatting = true;
    }
    hlPos = hlClose + 14;
  }

  return { text: text.trim(), innerHtml: innerHtml.trim(), headingLevel, numId, isHr, isPageBreak, hasFormatting };
}

function extractPlainText(xml: string): string {
  const parts: string[] = [];
  const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) parts.push(m[1]);
  return parts.join('').trim();
}

// ── Table parser ──────────────────────────────────────────────────────────────

/** Extract all <w:tr>...</w:tr> elements from a table XML string using indexOf/slice */
function extractTableRows(tableXml: string): string[] {
  const rows: string[] = [];
  let pos = 0;
  while (pos < tableXml.length) {
    const rowOpenA = tableXml.indexOf('<w:tr>', pos);
    const rowOpenB = tableXml.indexOf('<w:tr ', pos);
    let rowStart = -1;
    if (rowOpenA !== -1 && rowOpenB !== -1) rowStart = Math.min(rowOpenA, rowOpenB);
    else if (rowOpenA !== -1) rowStart = rowOpenA;
    else if (rowOpenB !== -1) rowStart = rowOpenB;
    if (rowStart === -1) break;
    const rowClose = tableXml.indexOf('</w:tr>', rowStart);
    if (rowClose === -1) break;
    rows.push(tableXml.slice(rowStart, rowClose + 7));
    pos = rowClose + 7;
  }
  return rows;
}

/** Extract all <w:tc>...</w:tc> elements from a row XML string using indexOf/slice */
function extractTableCells(rowXml: string): string[] {
  const cells: string[] = [];
  let pos = 0;
  while (pos < rowXml.length) {
    const cellOpenA = rowXml.indexOf('<w:tc>', pos);
    const cellOpenB = rowXml.indexOf('<w:tc ', pos);
    let cellStart = -1;
    if (cellOpenA !== -1 && cellOpenB !== -1) cellStart = Math.min(cellOpenA, cellOpenB);
    else if (cellOpenA !== -1) cellStart = cellOpenA;
    else if (cellOpenB !== -1) cellStart = cellOpenB;
    if (cellStart === -1) break;
    const cellClose = rowXml.indexOf('</w:tc>', cellStart);
    if (cellClose === -1) break;
    cells.push(rowXml.slice(cellStart, cellClose + 7));
    pos = cellClose + 7;
  }
  return cells;
}

function parseTableXml(xml: string): DocumentBlock | null {
  const rows: Array<Array<{ text: string; colSpan: number; isVMerge: boolean; bgColor: string | null; textColor: string | null; isBold: boolean }>> = [];

  for (const rowXml of extractTableRows(xml)) {
    const cells: Array<{ text: string; colSpan: number; isVMerge: boolean; bgColor: string | null; textColor: string | null; isBold: boolean }> = [];

    for (const cellXml of extractTableCells(rowXml)) {
      // Horizontal span
      const gridSpanMatch = /<w:gridSpan\s+w:val="(\d+)"/.exec(cellXml);
      const colSpan = gridSpanMatch ? parseInt(gridSpanMatch[1], 10) : 1;

      // Vertical merge continuation
      const vMergeMatch = /<w:vMerge(?:\s+w:val="([^"]*)")?/.exec(cellXml);
      const isVMerge = !!vMergeMatch && vMergeMatch[1] !== 'restart';

      // Cell background colour from w:shd fill attribute
      const shdMatch = /<w:shd\s[^>]*w:fill="([0-9A-Fa-f]{6})"/.exec(cellXml);
      const rawFill = shdMatch ? shdMatch[1].toUpperCase() : null;
      const bgColor = rawFill && rawFill !== 'FFFFFF' && rawFill !== 'AUTO' ? `#${rawFill}` : null;

      // Text colour
      const colorMatch = /<w:color\s+w:val="([0-9A-Fa-f]{6})"/.exec(cellXml);
      const rawColor = colorMatch ? colorMatch[1].toUpperCase() : null;
      const textColor = rawColor && rawColor !== 'AUTO' && rawColor !== '000000' ? `#${rawColor}` : null;

      // Bold
      const isBold = cellXml.includes('<w:b/>') || cellXml.includes('<w:b>') || cellXml.includes('<w:b ');

      const text = extractCellText(cellXml);
      cells.push({ text, colSpan, isVMerge, bgColor, textColor, isBold });
    }
    if (cells.length > 0) rows.push(cells);
  }

  if (rows.length === 0) return null;

  // Detect if this is a "form layout" table (label+field pairs, mostly 2-col,
  // many cells are empty or short labels) vs a data table with a real header row.
  const isFormTable = detectFormTable(rows);

  if (isFormTable) {
    // Render as a static HTML-style rich_text so the layout is preserved
    return buildFormTableBlock(rows);
  }

  // Data table — first row = headers
  const headerRow = rows[0];
  const dataRows = rows.slice(1);

  // If the header row has coloured cells, render as rich_text to preserve the colours.
  // The table block type doesn't support per-cell background colours, so we fall back
  // to the form-table HTML renderer which does.
  const headerHasColor = headerRow.some((c) => c.bgColor !== null);
  if (headerHasColor) {
    return buildFormTableBlock(rows);
  }

  // Build column list from header row, expanding colSpans
  const columns: Array<{ id: string; header: string; cellType: 'text'; width: number }> = [];
  for (const cell of headerRow) {
    const span = cell.colSpan || 1;
    columns.push({ id: newId(), header: cell.text, cellType: 'text', width: span });
    // Add placeholder columns for spanned cells
    for (let s = 1; s < span; s++) {
      columns.push({ id: newId(), header: '', cellType: 'text', width: 1 });
    }
  }

  const tableRows = dataRows.map((cells) => {
    const cellMap: Record<string, string> = {};
    let colIdx = 0;
    for (const cell of cells) {
      if (cell.isVMerge) { colIdx++; continue; }
      if (columns[colIdx]) cellMap[columns[colIdx].id] = cell.text;
      const span = cell.colSpan || 1;
      for (let s = 1; s < span; s++) {
        colIdx++;
        if (columns[colIdx]) cellMap[columns[colIdx].id] = '';
      }
      colIdx++;
    }
    return { id: newId(), cells: cellMap };
  });

  return {
    id: newId(),
    type: 'table',
    mode: 'static',
    columns,
    rows: tableRows,
    stripedRows: true,
  };
}

/** Detect whether a table is a form-layout table (label+field pairs) vs a data table */
function detectFormTable(rows: Array<Array<{ text: string; colSpan: number; isVMerge: boolean; bgColor: string | null; textColor: string | null; isBold: boolean }>>): boolean {
  if (rows.length === 0) return false;
  // If first row has a single cell spanning all columns → likely a section header → form table
  if (rows[0].length === 1 && rows[0][0].colSpan > 1) return true;
  // If more than 40% of cells are empty → form table (fields waiting to be filled)
  let total = 0; let empty = 0;
  for (const row of rows) {
    for (const cell of row) {
      total++;
      if (!cell.text.trim()) empty++;
    }
  }
  if (total > 0 && empty / total > 0.35) return true;
  // If most rows have exactly 2 columns → label+value form
  const twoColRows = rows.filter((r) => r.filter((c) => !c.isVMerge).length === 2).length;
  if (rows.length > 2 && twoColRows / rows.length > 0.5) return true;
  return false;
}

/** Determine if a hex colour is dark (luminance < 0.4) — used to pick white vs black text */
function isDarkColor(hex: string): boolean {
  const h = hex.replace('#', '');
  if (h.length !== 6) return false;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  // Relative luminance (sRGB)
  const toLinear = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const lum = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  return lum < 0.4;
}

/** Render a form-layout table as a rich_text block with an HTML table */
function buildFormTableBlock(rows: Array<Array<{ text: string; colSpan: number; isVMerge: boolean; bgColor: string | null; textColor: string | null; isBold: boolean }>>): DocumentBlock {
  const tableStyle = 'width:100%;border-collapse:collapse;font-size:12px;';
  // Default styles (used when no DOCX colour is present)
  const defaultLabelStyle = 'background:#f1f5f9;font-weight:600;padding:5px 8px;border:1px solid #cbd5e1;vertical-align:top;white-space:nowrap;';
  const defaultValueStyle = 'padding:5px 8px;border:1px solid #cbd5e1;vertical-align:top;min-height:24px;';
  const defaultHeaderStyle = 'background:#1e293b;color:#fff;font-weight:700;padding:6px 8px;border:1px solid #334155;text-align:left;';
  const spanStyle = 'padding:5px 8px;border:1px solid #cbd5e1;vertical-align:top;';

  let html = `<table style="${tableStyle}">`;
  for (const row of rows) {
    const visibleCells = row.filter((c) => !c.isVMerge);
    if (visibleCells.length === 0) continue;

    // Single full-width cell → section header
    const isSectionHeader = visibleCells.length === 1 && visibleCells[0].colSpan > 1;
    // All cells have text → likely all-label or all-header row
    const allHaveText = visibleCells.every((c) => c.text.trim().length > 0);
    // First cell is a label (short, ends with colon or is clearly a label)
    const firstIsLabel = visibleCells.length >= 2 && isLabelCell(visibleCells[0].text);

    html += '<tr>';
    for (const cell of visibleCells) {
      const span = cell.colSpan > 1 ? ` colspan="${cell.colSpan}"` : '';
      const text = escapeHtml(cell.text);

      // Build inline style from DOCX colours when available
      const buildCellStyle = (defaultStyle: string, forceHeader = false): string => {
        if (!cell.bgColor && !cell.textColor) return defaultStyle;
        const bg = cell.bgColor ?? (forceHeader ? '#1e293b' : '#ffffff');
        const fg = cell.textColor ?? (isDarkColor(bg) ? '#ffffff' : '#1e293b');
        const fw = (cell.isBold || forceHeader) ? '700' : '600';
        return `background:${bg};color:${fg};font-weight:${fw};padding:6px 8px;border:1px solid #334155;vertical-align:top;text-align:left;`;
      };

      if (isSectionHeader) {
        html += `<th${span} style="${buildCellStyle(defaultHeaderStyle, true)}">${text}</th>`;
      } else if (firstIsLabel && cell === visibleCells[0]) {
        html += `<td${span} style="${buildCellStyle(defaultLabelStyle)}">${text}</td>`;
      } else if (allHaveText && !firstIsLabel) {
        // Could be a header row — use cell colour if present, otherwise span style
        const style = cell.bgColor ? buildCellStyle(defaultHeaderStyle, true) : spanStyle;
        html += `<td${span} style="${style}">${text}</td>`;
      } else {
        html += `<td${span} style="${buildCellStyle(defaultValueStyle)}">${text || '&nbsp;'}</td>`;
      }
    }
    html += '</tr>';
  }
  html += '</table>';

  return { id: newId(), type: 'rich_text', html };
}

function isLabelCell(text: string): boolean {
  if (!text.trim()) return false;
  // Short text (under 40 chars), ends with colon, or is a known label pattern
  if (text.trim().endsWith(':')) return true;
  if (text.trim().length < 40 && /^[A-Z]/.test(text.trim())) return true;
  return false;
}

/** Extract all text from a table cell, including content controls and checkboxes.
 *  Uses bounded indexOf/slice — no [\s\S]*? patterns.
 */
function extractCellText(cellXml: string): string {
  // Expand w:sdt content controls using bounded indexOf/slice
  let expanded = '';
  let pos = 0;
  while (pos < cellXml.length) {
    const sdtOpenA = cellXml.indexOf('<w:sdt>', pos);
    const sdtOpenB = cellXml.indexOf('<w:sdt ', pos);
    let sdtStart = -1;
    if (sdtOpenA !== -1 && sdtOpenB !== -1) sdtStart = Math.min(sdtOpenA, sdtOpenB);
    else if (sdtOpenA !== -1) sdtStart = sdtOpenA;
    else if (sdtOpenB !== -1) sdtStart = sdtOpenB;

    if (sdtStart === -1) {
      expanded += cellXml.slice(pos);
      break;
    }
    expanded += cellXml.slice(pos, sdtStart);

    // Find matching </w:sdt> with depth tracking
    const tagEnd = cellXml.indexOf('>', sdtStart);
    let depth = 1;
    let searchPos = tagEnd !== -1 ? tagEnd + 1 : sdtStart + 7;
    while (depth > 0 && searchPos < cellXml.length) {
      const nextOpenA = cellXml.indexOf('<w:sdt>', searchPos);
      const nextOpenB = cellXml.indexOf('<w:sdt ', searchPos);
      let nextOpen = -1;
      if (nextOpenA !== -1 && nextOpenB !== -1) nextOpen = Math.min(nextOpenA, nextOpenB);
      else if (nextOpenA !== -1) nextOpen = nextOpenA;
      else if (nextOpenB !== -1) nextOpen = nextOpenB;
      const nextClose = cellXml.indexOf('</w:sdt>', searchPos);
      if (nextClose === -1) { searchPos = cellXml.length; break; }
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        const ne = cellXml.indexOf('>', nextOpen);
        searchPos = ne !== -1 ? ne + 1 : nextOpen + 7;
      } else {
        depth--;
        if (depth === 0) {
          const sdtInner = cellXml.slice(sdtStart, nextClose + 8);
          // Try alias name
          const aliasMatch = /<w:alias\s+w:val="([^"]+)"/.exec(sdtInner);
          const alias = aliasMatch ? aliasMatch[1] : '';
          // Get sdtContent text
          const cStart = sdtInner.indexOf('<w:sdtContent>');
          const cEnd = cStart !== -1 ? sdtInner.indexOf('</w:sdtContent>', cStart) : -1;
          const contentText = (cStart !== -1 && cEnd !== -1)
            ? extractPlainText(sdtInner.slice(cStart + 14, cEnd))
            : '';
          expanded += contentText || alias;
          pos = nextClose + 8;
        } else {
          searchPos = nextClose + 8;
        }
      }
    }
    if (depth !== 0) pos = cellXml.length;
  }

  // Handle checkboxes — w14:checked
  const withCheckboxes = expanded.replace(/<w14:checked\s+w14:val="(\d+)"[^/]*\/>/g, (_, val) => {
    return val === '1' ? '☑ ' : '☐ ';
  });

  return extractPlainText(withCheckboxes);
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
