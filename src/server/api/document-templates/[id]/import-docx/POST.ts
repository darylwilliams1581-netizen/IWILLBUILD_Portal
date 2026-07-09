/**
 * POST /api/document-templates/:id/import-docx
 * Parse an uploaded DOCX file and return builder blocks.
 *
 * Multipart form: field "docx" = the .docx file
 *
 * Returns: { blocks, sourceDocxName, warnings }
 * The caller saves the blocks into the template via PUT.
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
// Static import — Rollup resolves CJS interop at bundle time, preserving
// Node built-ins (util.promisify etc.) that break under dynamic import().
import mammothPkg from 'mammoth';

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

    // Use statically-imported mammoth — CJS interop is handled by Rollup at
    // bundle time so util.promisify and other Node built-ins stay intact.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mammoth = (mammothPkg as any).default ?? mammothPkg;
    const result = await mammoth.convertToHtml({ buffer: docxFile.buffer }) as { value: string; messages: Array<{ message: string }> };
    const html = result.value;
    const warnings = result.messages.map((m: { message: string }) => m.message);

    // Convert HTML → builder blocks
    const blocks = htmlToBuilderBlocks(html);

    // Store source DOCX path reference in the template
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

// ── HTML → Builder Blocks converter ──────────────────────────────────────────

function newId(): string {
  return nanoid(10);
}

function htmlToBuilderBlocks(html: string): DocumentBlock[] {
  // Parse the HTML string into a DOM-like structure using regex
  // (server-side — no DOM available)
  const blocks: DocumentBlock[] = [];

  // Split by block-level tags
  const tagPattern = /<(h[1-6]|p|table|ul|ol|hr|br)[^>]*>([\s\S]*?)<\/\1>|<(hr|br)\s*\/?>/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const re = new RegExp(tagPattern.source, 'gi');

  while ((match = re.exec(html)) !== null) {
    const tag = (match[1] || match[3] || '').toLowerCase();
    const inner = match[2] ?? '';
    const text = stripTags(inner).trim();

    if (tag === 'hr') {
      blocks.push({ id: newId(), type: 'divider', style: 'solid', thickness: 1 });
      continue;
    }

    if (tag === 'h1') {
      blocks.push({ id: newId(), type: 'heading', content: text, level: 1, align: 'left' });
      continue;
    }
    if (tag === 'h2') {
      blocks.push({ id: newId(), type: 'heading', content: text, level: 2, align: 'left' });
      continue;
    }
    if (tag === 'h3') {
      blocks.push({ id: newId(), type: 'heading', content: text, level: 3, align: 'left' });
      continue;
    }
    if (tag === 'h4' || tag === 'h5' || tag === 'h6') {
      blocks.push({ id: newId(), type: 'heading', content: text, level: 4, align: 'left' });
      continue;
    }

    if (tag === 'p' && text) {
      // Check if it looks like a heading (short, no period, all caps or title case)
      if (text.length < 80 && /^[A-Z]/.test(text) && !text.includes('.')) {
        blocks.push({ id: newId(), type: 'heading', content: text, level: 3, align: 'left' });
      } else {
        blocks.push({ id: newId(), type: 'text', content: text, align: 'left' });
      }
      continue;
    }

    if (tag === 'ul' || tag === 'ol') {
      const items = extractListItems(inner);
      if (items.length > 0) {
        const listHtml = tag === 'ul'
          ? `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`
          : `<ol>${items.map((i) => `<li>${i}</li>`).join('')}</ol>`;
        blocks.push({ id: newId(), type: 'rich_text', html: listHtml });
      }
      continue;
    }

    if (tag === 'table') {
      const tableBlock = parseTableBlock(inner);
      if (tableBlock) blocks.push(tableBlock);
      continue;
    }

    lastIndex = re.lastIndex;
  }

  // If nothing was parsed, treat the whole thing as a rich text block
  if (blocks.length === 0 && html.trim()) {
    blocks.push({ id: newId(), type: 'rich_text', html: html.trim() });
  }

  return blocks;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim();
}

function extractListItems(html: string): string[] {
  const items: string[] = [];
  const re = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const text = stripTags(m[1]).trim();
    if (text) items.push(text);
  }
  return items;
}

function parseTableBlock(tableHtml: string): DocumentBlock | null {
  // Extract header row
  const headerMatch = /<thead[^>]*>([\s\S]*?)<\/thead>/i.exec(tableHtml);
  const bodyMatch = /<tbody[^>]*>([\s\S]*?)<\/tbody>/i.exec(tableHtml);

  const headerCells = extractCells(headerMatch?.[1] ?? '', 'th');
  const bodyRows = extractRows(bodyMatch?.[1] ?? tableHtml);

  if (headerCells.length === 0 && bodyRows.length === 0) return null;

  // Build columns from header cells (or first row)
  const colHeaders = headerCells.length > 0 ? headerCells : (bodyRows[0] ?? []);
  const columns = colHeaders.map((h) => ({
    id: newId(),
    header: h,
    cellType: 'text' as const,
    width: 1,
  }));

  // Build rows from body
  const dataRows = headerCells.length > 0 ? bodyRows : bodyRows.slice(1);
  const rows = dataRows.map((cells) => {
    const cellMap: Record<string, string> = {};
    columns.forEach((col, i) => {
      cellMap[col.id] = cells[i] ?? '';
    });
    return { id: newId(), cells: cellMap };
  });

  return {
    id: newId(),
    type: 'table',
    mode: 'static',
    columns,
    rows,
    stripedRows: true,
  };
}

function extractCells(html: string, tag: 'th' | 'td'): string[] {
  const cells: string[] = [];
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    cells.push(stripTags(m[1]).trim());
  }
  return cells;
}

function extractRows(html: string): string[][] {
  const rows: string[][] = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRe.exec(html)) !== null) {
    const cells = extractCells(rowMatch[1], 'td');
    if (cells.length > 0) rows.push(cells);
  }
  return rows;
}
