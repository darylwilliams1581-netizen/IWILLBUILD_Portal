/**
 * POST /api/owner-console/library/items
 *
 * Platform-owner only. Creates a new global library item.
 * Accepts multipart/form-data with optional file upload (docx or pdf)
 * plus metadata fields.
 *
 * Fields:
 *   title        — required
 *   type         — policy|procedure|swms|form|recipe|estimate_recipe|scope_line
 *   category     — optional string
 *   discipline   — optional string
 *   summary      — optional description
 *   tags         — comma-separated string
 *   version      — default '1.0'
 *   status       — active|draft  (default 'active')
 *   visibility   — public|private (default 'public')
 *   file         — optional .docx or .pdf
 *                  • DOCX: parsed to builder_json via JSZip + custom XML parser
 *                  • PDF:  parsed to builder_json via pure-JS zlib extractor
 *                  • Both: saved to persistent storage so users can download the original
 *
 * Returns: { ok: true, id: number }
 */
import type { Request, Response } from 'express';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../lib/auth-middleware.js';
import { parseMultipartForm } from '../../../../lib/file-upload.js';
import { nanoid } from 'nanoid';
import { extractPdfText } from '../../../../lib/pdf-text-extract.js';
import JSZip from 'jszip';

const ALLOWED_TYPES = new Set([
  'policy', 'procedure', 'swms', 'form', 'recipe', 'estimate_recipe', 'scope_line',
]);

// Persistent storage for original uploaded files
const UPLOAD_DIR = '/shared-storage/public/assets/uploads/library-files';

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  // Platform owner check
  const [ownerCheck] = await db.execute(sql.raw(
    `SELECT role FROM profiles WHERE user_id = '${auth.session.user.id}' LIMIT 1`
  )) as unknown as [Array<{ role: string }>, unknown];
  if (ownerCheck?.[0]?.role !== 'platform_owner') {
    return res.status(403).json({ error: 'Platform owner access required' });
  }

  try {
    // Parse multipart (file is optional)
    const { fields, files } = await parseMultipartForm(req, { maxFileSize: 30 * 1024 * 1024 });

    const title      = (fields.title ?? '').trim();
    const type       = (fields.type ?? 'procedure').trim();
    const category   = (fields.category ?? '').trim() || null;
    const discipline = (fields.discipline ?? '').trim() || null;
    const summary    = (fields.summary ?? '').trim() || null;
    const tags       = (fields.tags ?? '').trim() || null;
    const version    = (fields.version ?? '1.0').trim();
    const status     = ['active', 'draft', 'archived'].includes(fields.status ?? '') ? fields.status : 'active';
    const visibility = fields.visibility === 'private' ? 'private' : 'public';

    if (!title) return res.status(400).json({ error: 'Title is required' });
    if (!ALLOWED_TYPES.has(type)) return res.status(400).json({ error: `Invalid type: ${type}` });

    // ── Parse + save uploaded file ────────────────────────────────────────────
    let builderJson: string | null = null;
    let sourceFileName: string | null = null;
    let savedFilePath: string | null = null;
    let savedFileMime: string | null = null;

    const uploadedFile = files[0];
    if (uploadedFile?.buffer) {
      const fname = (uploadedFile.originalname ?? '').toLowerCase();
      sourceFileName = uploadedFile.originalname ?? null;

      // ── Save original file to persistent storage ──────────────────────────
      try {
        await fs.mkdir(UPLOAD_DIR, { recursive: true });
        const slug = `${nanoid(10)}-${(uploadedFile.originalname ?? 'file').replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const filePath = path.join(UPLOAD_DIR, slug);
        await fs.writeFile(filePath, uploadedFile.buffer);
        savedFilePath = filePath;
        savedFileMime = uploadedFile.mimetype ?? (fname.endsWith('.pdf') ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      } catch (saveErr) {
        console.warn('Library file save failed (non-fatal):', saveErr);
        // Continue — builder_json parsing still works even if file save fails
      }

      if (fname.endsWith('.docx')) {
        // Parse DOCX → builder blocks using JSZip (pure-JS, no mammoth)
        try {
          const blocks = await parseDocxToBlocks(uploadedFile.buffer);
          builderJson = JSON.stringify({ blocks });
        } catch (docxErr) {
          console.warn('DOCX parse failed:', docxErr);
          builderJson = JSON.stringify({
            blocks: [{
              id: nanoid(10),
              type: 'rich_text',
              html: `<p><em>Could not parse DOCX content automatically. The original file is available for download.</em></p>`,
            }],
          });
        }
      } else if (fname.endsWith('.pdf')) {
        // Parse PDF → builder blocks using pure-JS zlib extractor
        const { text, warnings } = await extractPdfText(uploadedFile.buffer);

        if (text.trim()) {
          const blocks = pdfTextToBlocks(text);
          builderJson = JSON.stringify({ blocks });
        } else {
          // Scanned/image PDF — produce a rich_text block with a download hint
          const reason = warnings[0] ?? 'No extractable text found in this PDF.';
          builderJson = JSON.stringify({
            blocks: [
              {
                id: nanoid(10),
                type: 'heading',
                content: title,
                level: 2,
                align: 'left',
              },
              {
                id: nanoid(10),
                type: 'rich_text',
                html: `<p><em>${escapeHtml(reason)}</em></p><p>Download the original PDF to view its full content.</p>`,
              },
            ],
          });
        }
      }
    }

    // ── Insert into library_items ─────────────────────────────────────────────
    const safeTitle      = title.replace(/'/g, "''");
    const safeCategory   = category ? category.replace(/'/g, "''") : null;
    const safeDiscipline = discipline ? discipline.replace(/'/g, "''") : null;
    const safeSummary    = summary ? summary.replace(/'/g, "''") : null;
    const safeTags       = tags ? tags.replace(/'/g, "''") : null;
    const safeVersion    = version.replace(/'/g, "''");
    const safeSourceFile = sourceFileName ? sourceFileName.replace(/'/g, "''") : null;
    const safeFilePath   = savedFilePath ? savedFilePath.replace(/'/g, "''") : null;
    const safeFileMime   = savedFileMime ? savedFileMime.replace(/'/g, "''") : null;

    const builderJsonSql = builderJson
      ? `'${builderJson.replace(/'/g, "''")}'`
      : 'NULL';

    await db.execute(sql.raw(`
      INSERT INTO library_items
        (type, category, title, summary, tags, discipline, version, status, visibility,
         builder_json, source_file_name, file_path, file_mime,
         install_count, download_count, rating_sum, rating_count,
         created_at, updated_at)
      VALUES (
        '${type}',
        ${safeCategory   ? `'${safeCategory}'`   : 'NULL'},
        '${safeTitle}',
        ${safeSummary    ? `'${safeSummary}'`    : 'NULL'},
        ${safeTags       ? `'${safeTags}'`       : 'NULL'},
        ${safeDiscipline ? `'${safeDiscipline}'` : 'NULL'},
        '${safeVersion}',
        '${status}',
        '${visibility}',
        ${builderJsonSql},
        ${safeSourceFile ? `'${safeSourceFile}'` : 'NULL'},
        ${safeFilePath   ? `'${safeFilePath}'`   : 'NULL'},
        ${safeFileMime   ? `'${safeFileMime}'`   : 'NULL'},
        0, 0, 0, 0,
        NOW(), NOW()
      )
    `));

    const [idRows] = await db.execute(sql.raw('SELECT LAST_INSERT_ID() AS id')) as unknown as [Array<{ id: number }>, unknown];
    const newId = Number(idRows?.[0]?.id ?? 0);

    return res.status(201).json({ ok: true, id: newId });
  } catch (err) {
    console.error('POST /api/owner-console/library/items error:', err);
    return res.status(500).json({ error: 'Failed to create library item' });
  }
}

// ── DOCX → builder blocks (JSZip + custom XML parser) ────────────────────────

async function parseDocxToBlocks(buffer: Buffer): Promise<Array<Record<string, unknown>>> {
  const zip = await JSZip.loadAsync(buffer);
  const docXml = await zip.file('word/document.xml')?.async('string');
  if (!docXml) throw new Error('word/document.xml not found in DOCX');

  const blocks: Array<Record<string, unknown>> = [];

  // Extract paragraphs and tables
  const bodyMatch = docXml.match(/<w:body>([\s\S]*?)<\/w:body>/);
  if (!bodyMatch) return blocks;

  const body = bodyMatch[1];

  // Process paragraph elements
  const paraRe = /<w:p[ >]([\s\S]*?)<\/w:p>/g;
  let m: RegExpExecArray | null;

  while ((m = paraRe.exec(body)) !== null) {
    const paraXml = m[1];

    // Detect heading style
    const styleMatch = paraXml.match(/<w:pStyle w:val="([^"]+)"/);
    const style = styleMatch?.[1] ?? '';
    const headingMatch = style.match(/^[Hh]eading(\d)/);
    const level = headingMatch ? Math.min(4, parseInt(headingMatch[1])) : 0;

    // Extract text runs
    const text = extractRunText(paraXml);
    if (!text.trim()) continue;

    if (level > 0) {
      blocks.push({ id: nanoid(10), type: 'heading', content: text, level, align: 'left' });
    } else {
      blocks.push({ id: nanoid(10), type: 'rich_text', html: `<p>${escapeHtml(text)}</p>` });
    }
  }

  if (blocks.length === 0) {
    blocks.push({ id: nanoid(10), type: 'rich_text', html: '<p>Document content imported.</p>' });
  }

  return blocks;
}

function extractRunText(paraXml: string): string {
  const parts: string[] = [];
  const runRe = /<w:r[ >]([\s\S]*?)<\/w:r>/g;
  let m: RegExpExecArray | null;
  while ((m = runRe.exec(paraXml)) !== null) {
    const tMatch = m[1].match(/<w:t[^>]*>([^<]*)<\/w:t>/);
    if (tMatch) parts.push(tMatch[1]);
  }
  return parts.join('');
}

// ── PDF text → builder blocks ─────────────────────────────────────────────────

function pdfTextToBlocks(text: string): Array<Record<string, unknown>> {
  const blocks: Array<Record<string, unknown>> = [];
  const lines = text.split(/\r?\n/);
  let paragraphLines: string[] = [];

  const flushParagraph = () => {
    const para = paragraphLines.join(' ').trim();
    paragraphLines = [];
    if (!para) return;

    // Heading heuristic: short, starts with capital/digit, no trailing punctuation
    if (
      para.length < 80 &&
      /^[A-Z0-9]/.test(para) &&
      !para.endsWith('.') &&
      !para.endsWith(',') &&
      !para.endsWith(';')
    ) {
      blocks.push({ id: nanoid(10), type: 'heading', content: para, level: 2, align: 'left' });
    } else {
      blocks.push({ id: nanoid(10), type: 'rich_text', html: `<p>${escapeHtml(para)}</p>` });
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flushParagraph(); continue; }
    paragraphLines.push(line);
  }
  flushParagraph();

  if (blocks.length === 0) {
    blocks.push({ id: nanoid(10), type: 'rich_text', html: `<p>${escapeHtml(text.trim())}</p>` });
  }

  return blocks;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
