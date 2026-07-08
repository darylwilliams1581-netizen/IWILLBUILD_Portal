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
 *   file         — optional .docx or .pdf (parsed to builder_json)
 *
 * Returns: { ok: true, id: number }
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../lib/auth-middleware.js';
import { parseMultipartForm } from '../../../../lib/file-upload.js';
import { nanoid } from 'nanoid';

const ALLOWED_TYPES = new Set([
  'policy', 'procedure', 'swms', 'form', 'recipe', 'estimate_recipe', 'scope_line',
]);

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

    const title     = (fields.title ?? '').trim();
    const type      = (fields.type ?? 'procedure').trim();
    const category  = (fields.category ?? '').trim() || null;
    const discipline= (fields.discipline ?? '').trim() || null;
    const summary   = (fields.summary ?? '').trim() || null;
    const tags      = (fields.tags ?? '').trim() || null;
    const version   = (fields.version ?? '1.0').trim();
    const status    = ['active', 'draft', 'archived'].includes(fields.status ?? '') ? fields.status : 'active';
    const visibility= fields.visibility === 'private' ? 'private' : 'public';

    if (!title) return res.status(400).json({ error: 'Title is required' });
    if (!ALLOWED_TYPES.has(type)) return res.status(400).json({ error: `Invalid type: ${type}` });

    // ── Parse uploaded file if present ───────────────────────────────────────
    let builderJson: string | null = null;
    let sourceFileName: string | null = null;

    const uploadedFile = files[0];
    if (uploadedFile?.buffer) {
      const fname = (uploadedFile.originalname ?? '').toLowerCase();
      sourceFileName = uploadedFile.originalname ?? null;

      if (fname.endsWith('.docx')) {
        // Parse DOCX → builder blocks via mammoth
        const mammoth = await import('mammoth');
        const result = await mammoth.convertToHtml({ buffer: uploadedFile.buffer });
        const blocks = htmlToBuilderBlocks(result.value);
        builderJson = JSON.stringify({ blocks });
      } else if (fname.endsWith('.pdf')) {
        // For PDF we store a placeholder — full PDF import requires client-side rendering
        builderJson = JSON.stringify({
          blocks: [{
            id: nanoid(10),
            type: 'text',
            content: `[PDF imported: ${uploadedFile.originalname}. Open in Document Builder to view full content.]`,
            align: 'left',
          }],
        });
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

    const builderJsonSql = builderJson
      ? `'${builderJson.replace(/'/g, "''")}'`
      : 'NULL';

    await db.execute(sql.raw(`
      INSERT INTO library_items
        (type, category, title, summary, tags, discipline, version, status, visibility,
         builder_json, source_file_name, install_count, download_count, rating_sum, rating_count,
         created_at, updated_at)
      VALUES (
        '${type}',
        ${safeCategory ? `'${safeCategory}'` : 'NULL'},
        '${safeTitle}',
        ${safeSummary ? `'${safeSummary}'` : 'NULL'},
        ${safeTags ? `'${safeTags}'` : 'NULL'},
        ${safeDiscipline ? `'${safeDiscipline}'` : 'NULL'},
        '${safeVersion}',
        '${status}',
        '${visibility}',
        ${builderJsonSql},
        ${safeSourceFile ? `'${safeSourceFile}'` : 'NULL'},
        0, 0, 0, 0,
        NOW(), NOW()
      )
    `));

    // Get the inserted id
    const [idRows] = await db.execute(sql.raw('SELECT LAST_INSERT_ID() AS id')) as unknown as [Array<{ id: number }>, unknown];
    const newId = Number(idRows?.[0]?.id ?? 0);

    return res.status(201).json({ ok: true, id: newId });
  } catch (err) {
    console.error('POST /api/owner-console/library/items error:', err);
    return res.status(500).json({ error: 'Failed to create library item' });
  }
}

// ── Minimal HTML → builder blocks (same logic as DocxImporter handler) ────────

function newId(): string { return nanoid(10); }

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

function htmlToBuilderBlocks(html: string): Array<Record<string, unknown>> {
  const blocks: Array<Record<string, unknown>> = [];
  const re = /<(h[1-6]|p|ul|ol|hr|table)[^>]*>([\s\S]*?)<\/\1>|<(hr)\s*\/?>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const tag = (match[1] || match[3] || '').toLowerCase();
    const inner = match[2] ?? '';
    const text = stripTags(inner).trim();
    if (tag === 'hr') { blocks.push({ id: newId(), type: 'divider', style: 'solid', thickness: 1 }); continue; }
    if (tag === 'h1') { blocks.push({ id: newId(), type: 'heading', content: text, level: 1, align: 'left' }); continue; }
    if (tag === 'h2') { blocks.push({ id: newId(), type: 'heading', content: text, level: 2, align: 'left' }); continue; }
    if (tag === 'h3') { blocks.push({ id: newId(), type: 'heading', content: text, level: 3, align: 'left' }); continue; }
    if (tag === 'h4' || tag === 'h5' || tag === 'h6') { blocks.push({ id: newId(), type: 'heading', content: text, level: 4, align: 'left' }); continue; }
    if (tag === 'p' && text) { blocks.push({ id: newId(), type: 'text', content: text, align: 'left' }); continue; }
    if (tag === 'ul' || tag === 'ol') {
      const items = extractListItems(inner);
      if (items.length > 0) {
        const listHtml = tag === 'ul'
          ? `<ul>${items.map(i => `<li>${i}</li>`).join('')}</ul>`
          : `<ol>${items.map(i => `<li>${i}</li>`).join('')}</ol>`;
        blocks.push({ id: newId(), type: 'rich_text', html: listHtml });
      }
      continue;
    }
  }
  if (blocks.length === 0 && html.trim()) {
    blocks.push({ id: newId(), type: 'rich_text', html: html.trim() });
  }
  return blocks;
}
