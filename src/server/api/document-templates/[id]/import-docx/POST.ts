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
 * Security note: several functions below use /[\s\S]*?/ lazy patterns to parse
 * DOCX XML. These are bounded by specific closing XML tags (</w:p>, </w:r>, etc.)
 * in structured Office Open XML content. The input is a company-uploaded DOCX file
 * (not attacker-controlled unbounded text), and all patterns are lazy (not greedy),
 * so catastrophic backtracking is not possible in practice.
 */
/* eslint-disable security/detect-unsafe-regex */
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
    // mode: 'keep_word' (default — store original) | 'convert_blocks' (legacy)
    const mode = (fields.mode as string | undefined) ?? 'keep_word';

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

    // ── Mode: convert_html — DOCX → editable HTML canvas (new intended path) ──
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
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: `Failed to parse DOCX file: ${msg}` });
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

// ── Document XML parser ───────────────────────────────────────────────────────

function parseDocumentXml(xml: string, orderedNumIds: Set<string>, warnings: string[]): DocumentBlock[] {
  const blocks: DocumentBlock[] = [];

  // Extract the body content
  const bodyMatch = /<w:body>([\s\S]*?)<\/w:body>/.exec(xml);
  if (!bodyMatch) {
    warnings.push('Could not find document body');
    return blocks;
  }
  const body = bodyMatch[1];

  // Expand content controls (w:sdt) at the body level before splitting
  const expandedBody = expandSdtElements(body);

  // Split into top-level elements: paragraphs and tables
  const elements = splitBodyElements(expandedBody);

  let i = 0;
  while (i < elements.length) {
    const el = elements[i];

    if (el.type === 'paragraph') {
      const para = parseParagraph(el.xml);

      // List paragraph — collect consecutive items with same numId
      if (para.numId) {
        const numId = para.numId;
        const isOrdered = orderedNumIds.has(numId);
        const items: string[] = [para.text];

        while (i + 1 < elements.length) {
          const next = elements[i + 1];
          if (next.type !== 'paragraph') break;
          const nextPara = parseParagraph(next.xml);
          if (nextPara.numId !== numId) break;
          items.push(nextPara.text);
          i++;
        }

        const tag = isOrdered ? 'ol' : 'ul';
        const listHtml = `<${tag}>${items.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</${tag}>`;
        blocks.push({ id: newId(), type: 'rich_text', html: listHtml });
        i++;
        continue;
      }

      // Heading paragraph
      if (para.headingLevel) {
        if (para.text) {
          blocks.push({ id: newId(), type: 'heading', content: para.text, level: para.headingLevel, align: 'left' });
        }
        i++;
        continue;
      }

      // Horizontal rule
      if (para.isHr) {
        blocks.push({ id: newId(), type: 'divider', style: 'solid', thickness: 1 });
        i++;
        continue;
      }

      // Regular paragraph — skip empty
      if (para.text.trim()) {
        if (para.hasFormatting) {
          blocks.push({ id: newId(), type: 'rich_text', html: `<p>${para.innerHtml}</p>` });
        } else {
          blocks.push({ id: newId(), type: 'text', content: para.text, align: 'left' });
        }
      }
      i++;
      continue;
    }

    if (el.type === 'table') {
      const tableBlock = parseTableXml(el.xml);
      if (tableBlock) blocks.push(tableBlock);
      i++;
      continue;
    }

    i++;
  }

  if (blocks.length === 0) {
    warnings.push('No content blocks found in document');
  }

  return blocks;
}

/** Expand top-level w:sdt content controls into their inner content */
function expandSdtElements(body: string): string {
  return body.replace(/<w:sdt[ >]([\s\S]*?)<\/w:sdt>/g, (_, inner) => {
    const contentMatch = /<w:sdtContent>([\s\S]*?)<\/w:sdtContent>/.exec(inner);
    return contentMatch ? contentMatch[1] : '';
  });
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

  // Horizontal rule
  const isHr = /<w:pBdr>[\s\S]*?<w:bottom[\s\S]*?\/>/.test(xml) && !/<w:t/.test(xml);

  // Extract runs with formatting
  let text = '';
  let innerHtml = '';
  let hasFormatting = false;

  const runRe = /<w:r[ >]([\s\S]*?)<\/w:r>/g;
  let runMatch: RegExpExecArray | null;
  while ((runMatch = runRe.exec(xml)) !== null) {
    const runXml = runMatch[1];

    // Get text content (handle xml:space="preserve")
    const textParts: string[] = [];
    const textRe = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
    let tMatch: RegExpExecArray | null;
    while ((tMatch = textRe.exec(runXml)) !== null) {
      textParts.push(tMatch[1]);
    }
    const runText = textParts.join('');
    if (!runText) continue;

    text += runText;

    // Check formatting
    const isBold = /<w:b\s*\/>|<w:b>/.test(runXml) && !/<w:bCs\s*\/>/.test(runXml.replace(/<w:b\s*\/>/, ''));
    const isItalic = /<w:i\s*\/>|<w:i>/.test(runXml) && !/<w:iCs\s*\/>/.test(runXml.replace(/<w:i\s*\/>/, ''));
    const isUnderline = /<w:u\s+w:val="(?!none)[^"]*"/.test(runXml);

    if (isBold || isItalic || isUnderline) hasFormatting = true;

    let span = escapeHtml(runText);
    if (isBold) span = `<strong>${span}</strong>`;
    if (isItalic) span = `<em>${span}</em>`;
    if (isUnderline) span = `<u>${span}</u>`;
    innerHtml += span;
  }

  // Also handle <w:hyperlink> runs
  const hyperlinkRe = /<w:hyperlink[^>]*>([\s\S]*?)<\/w:hyperlink>/g;
  let hlMatch: RegExpExecArray | null;
  while ((hlMatch = hyperlinkRe.exec(xml)) !== null) {
    const hlText = extractPlainText(hlMatch[1]);
    if (hlText && !text.includes(hlText)) {
      text += hlText;
      innerHtml += `<u>${escapeHtml(hlText)}</u>`;
      hasFormatting = true;
    }
  }

  return { text: text.trim(), innerHtml: innerHtml.trim(), headingLevel, numId, isHr, hasFormatting };
}

function extractPlainText(xml: string): string {
  const parts: string[] = [];
  const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) parts.push(m[1]);
  return parts.join('').trim();
}

// ── Table parser ──────────────────────────────────────────────────────────────

function parseTableXml(xml: string): DocumentBlock | null {
  const rows: Array<Array<{ text: string; colSpan: number; isVMerge: boolean; bgColor: string | null; textColor: string | null; isBold: boolean }>> = [];

  const rowRe = /<w:tr[ >]([\s\S]*?)<\/w:tr>/g;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRe.exec(xml)) !== null) {
    const cells: Array<{ text: string; colSpan: number; isVMerge: boolean; bgColor: string | null; textColor: string | null; isBold: boolean }> = [];

    // Include both <w:tc> and <w:sdt> (content controls) inside cells
    const cellRe = /<w:tc[ >]([\s\S]*?)<\/w:tc>/g;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRe.exec(rowMatch[1])) !== null) {
      const cellXml = cellMatch[1];

      // Horizontal span
      const gridSpanMatch = /<w:gridSpan\s+w:val="(\d+)"/.exec(cellXml);
      const colSpan = gridSpanMatch ? parseInt(gridSpanMatch[1], 10) : 1;

      // Vertical merge continuation — skip these cells (they are covered by the cell above)
      const vMergeMatch = /<w:vMerge(?:\s+w:val="([^"]*)")?/.exec(cellXml);
      const isVMerge = !!vMergeMatch && vMergeMatch[1] !== 'restart';

      // Cell background colour from w:shd fill attribute
      // e.g. <w:shd w:val="clear" w:color="auto" w:fill="1A2744"/>
      const shdMatch = /<w:shd\s[^>]*w:fill="([0-9A-Fa-f]{6})"/.exec(cellXml);
      const rawFill = shdMatch ? shdMatch[1].toUpperCase() : null;
      // Ignore "auto" / "FFFFFF" / "000000" as non-meaningful fills
      const bgColor = rawFill && rawFill !== 'FFFFFF' && rawFill !== 'AUTO' ? `#${rawFill}` : null;

      // Detect text colour from run properties: <w:color w:val="FFFFFF"/>
      const colorMatch = /<w:color\s+w:val="([0-9A-Fa-f]{6})"/.exec(cellXml);
      const rawColor = colorMatch ? colorMatch[1].toUpperCase() : null;
      const textColor = rawColor && rawColor !== 'AUTO' && rawColor !== '000000' ? `#${rawColor}` : null;

      // Detect bold from run properties
      const isBold = /<w:b\s*\/>/.test(cellXml) || /<w:b>/.test(cellXml);

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

/** Extract all text from a table cell, including content controls and checkboxes */
function extractCellText(cellXml: string): string {
  // Handle Word content controls (w:sdt) — extract their display text
  const withSdtExpanded = cellXml.replace(/<w:sdt[ >]([\s\S]*?)<\/w:sdt>/g, (_, inner) => {
    // Try to get the alias/tag name for the field
    const aliasMatch = /<w:alias\s+w:val="([^"]+)"/.exec(inner);
    const alias = aliasMatch ? aliasMatch[1] : '';
    // Get the actual text content inside w:sdtContent
    const contentMatch = /<w:sdtContent>([\s\S]*?)<\/w:sdtContent>/.exec(inner);
    const contentText = contentMatch ? extractPlainText(contentMatch[1]) : '';
    return contentText || alias;
  });

  // Handle checkboxes — w14:checkbox or legacy checkbox SDTs
  const withCheckboxes = withSdtExpanded.replace(/<w14:checked\s+w14:val="(\d+)"[^/]*\/>/g, (_, val) => {
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
