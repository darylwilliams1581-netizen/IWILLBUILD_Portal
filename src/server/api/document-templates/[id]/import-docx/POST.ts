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
    const { files } = await parseMultipartForm(req, { maxFileSize: 20 * 1024 * 1024 });
    const docxFile = files.find((f) => f.fieldname === 'docx' || f.originalname?.endsWith('.docx'));
    if (!docxFile?.buffer) {
      return res.status(400).json({ error: 'No DOCX file uploaded. Upload a .docx file in the "docx" field.' });
    }

    // Parse DOCX using JSZip (pure-JS, bundles cleanly) + custom XML→blocks
    const { blocks, warnings } = await parseDocxToBlocks(docxFile.buffer);

    // Store source DOCX reference in the template
    const storedName = `docx-${nanoid(8)}-${docxFile.originalname ?? 'import.docx'}`;
    await db.execute(sql.raw(
      `UPDATE document_templates SET source_docx_name = ${JSON.stringify(docxFile.originalname ?? 'import.docx')}, source_docx_path = ${JSON.stringify(storedName)} WHERE id = ${id}`
    ));

    return res.json({
      blocks,
      sourceDocxName: docxFile.originalname ?? 'import.docx',
      warnings: warnings.slice(0, 10),
    });
  } catch (err) {
    console.error('POST /api/document-templates/:id/import-docx error:', err);
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: `Failed to parse DOCX file: ${msg}` });
  }
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
  const abstractRe = /<w:abstractNum\s+w:abstractNumId="(\d+)"[^>]*>([\s\S]*?)<\/w:abstractNum>/g;
  let m: RegExpExecArray | null;
  while ((m = abstractRe.exec(xml)) !== null) {
    const abstractId = m[1];
    const body = m[2];
    if (/<w:numFmt\s+w:val="(?:decimal|lowerLetter|upperLetter|lowerRoman|upperRoman)"/.test(body)) {
      ordered.add(abstractId);
    }
  }
  // Map numId → abstractNumId
  const numRe = /<w:num\s+w:numId="(\d+)"[^>]*>[\s\S]*?<w:abstractNumId\s+w:val="(\d+)"[^>]*\/>/g;
  const orderedNumIds = new Set<string>();
  while ((m = numRe.exec(xml)) !== null) {
    if (ordered.has(m[2])) orderedNumIds.add(m[1]);
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

  // Split into top-level elements: paragraphs and tables
  // We'll collect consecutive list paragraphs into a single list block
  const elements = splitBodyElements(body);

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

        // Collect following paragraphs with the same numId
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
        // Preserve inline formatting as rich_text if there's bold/italic/underline
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

// ── Split body into paragraph/table elements ──────────────────────────────────

interface BodyElement {
  type: 'paragraph' | 'table' | 'other';
  xml: string;
}

function splitBodyElements(body: string): BodyElement[] {
  const elements: BodyElement[] = [];
  // Match top-level <w:p> and <w:tbl> elements
  const re = /(<w:p[ >][\s\S]*?<\/w:p>|<w:p\/>|<w:tbl[ >][\s\S]*?<\/w:tbl>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const xml = m[1];
    if (xml.startsWith('<w:tbl')) {
      elements.push({ type: 'table', xml });
    } else {
      elements.push({ type: 'paragraph', xml });
    }
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
  const rows: string[][] = [];

  const rowRe = /<w:tr[ >]([\s\S]*?)<\/w:tr>/g;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRe.exec(xml)) !== null) {
    const cells: string[] = [];
    const cellRe = /<w:tc[ >]([\s\S]*?)<\/w:tc>/g;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRe.exec(rowMatch[1])) !== null) {
      cells.push(extractPlainText(cellMatch[1]));
    }
    if (cells.length > 0) rows.push(cells);
  }

  if (rows.length === 0) return null;

  const headerRow = rows[0];
  const dataRows = rows.slice(1);

  const columns = headerRow.map((h) => ({
    id: newId(),
    header: h,
    cellType: 'text' as const,
    width: 1,
  }));

  const tableRows = dataRows.map((cells) => {
    const cellMap: Record<string, string> = {};
    columns.forEach((col, i) => { cellMap[col.id] = cells[i] ?? ''; });
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

// ── Utilities ─────────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
