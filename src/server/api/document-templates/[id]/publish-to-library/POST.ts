/**
 * POST /api/document-templates/:id/publish-to-library
 *
 * Platform owner ONLY — publishes a document template to the Global Library.
 * Regular company users cannot publish to the Global Library.
 *
 * Body (JSON):
 *   title       — optional override (defaults to template name)
 *   type        — policy|procedure|swms|form|checklist|induction|toolbox_talk|prestart|report|recipe
 *   category    — optional
 *   discipline  — optional
 *   summary     — optional description
 *   version     — optional (default '1.0')
 *   tags        — optional comma-separated
 *
 * Returns: { ok: true, libraryItemId: number }
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getPlatformOwnerInfo } from '../../../../lib/platform-owner-guard.js';

const ALLOWED_TYPES = new Set([
  'policy', 'procedure', 'swms', 'form', 'recipe', 'estimate_recipe', 'scope_line',
  'checklist', 'induction', 'report', 'toolbox_talk', 'prestart',
]);

export default async function handler(req: Request, res: Response) {
  // Platform owner only — no review queue, no pending submissions
  const info = await getPlatformOwnerInfo(req);
  if (!info) return res.status(401).json({ error: 'Unauthorised' });
  if (!info.isPlatformOwner) {
    return res.status(403).json({ error: 'Only the platform owner can publish to the Global Library.' });
  }

  const templateId = Number(req.params.id);
  if (!templateId) return res.status(400).json({ error: 'Invalid template ID' });

  // Fetch the template — platform owner can access any template
  const [rows] = await db.execute(sql.raw(
    `SELECT id, name, builder_json FROM document_templates WHERE id = ${templateId} LIMIT 1`
  )) as unknown as [Array<{ id: number; name: string; builder_json: string | null }>, unknown];

  const template = rows?.[0];
  if (!template) return res.status(404).json({ error: 'Template not found' });

  const body = req.body as {
    title?: string;
    type?: string;
    category?: string;
    discipline?: string;
    summary?: string;
    version?: string;
    tags?: string;
  };

  const title      = (body.title ?? template.name ?? 'Untitled').trim();
  const type       = ALLOWED_TYPES.has(body.type ?? '') ? (body.type ?? 'form') : 'form';
  const category   = (body.category ?? '').trim() || null;
  const discipline = (body.discipline ?? '').trim() || null;
  const summary    = (body.summary ?? '').trim() || null;
  const version    = (body.version ?? '1.0').trim();
  const tags       = (body.tags ?? '').trim() || null;
  const builderJson = template.builder_json ?? '{"blocks":[]}';

  const safe = (s: string) => s.replace(/'/g, "''");
  const sourceRef = `document:${templateId}`;

  try {
    const [result] = await db.execute(sql.raw(
      `INSERT INTO library_items (
         source_template_ref,
         title, type, category, discipline, summary, tags, builder_json,
         status, visibility, version,
         install_count, download_count, rating_sum, rating_count,
         created_at, updated_at
       )
       VALUES (
         '${safe(sourceRef)}',
         '${safe(title)}',
         '${safe(type)}',
         ${category   ? `'${safe(category)}'`   : 'NULL'},
         ${discipline ? `'${safe(discipline)}'` : 'NULL'},
         ${summary    ? `'${safe(summary)}'`    : 'NULL'},
         ${tags       ? `'${safe(tags)}'`       : 'NULL'},
         '${safe(builderJson)}',
         'active',
         'public',
         '${safe(version)}',
         0, 0, 0, 0,
         NOW(), NOW()
       )
       ON DUPLICATE KEY UPDATE
         title        = VALUES(title),
         type         = VALUES(type),
         category     = VALUES(category),
         discipline   = VALUES(discipline),
         summary      = VALUES(summary),
         tags         = VALUES(tags),
         builder_json = VALUES(builder_json),
         version      = VALUES(version),
         status       = 'active',
         visibility   = 'public',
         updated_at   = NOW()`
    )) as unknown as [{ insertId: number }, unknown];

    let libraryItemId = (result as unknown as { insertId: number }).insertId;
    if (!libraryItemId) {
      const [refRows] = await db.execute(sql.raw(
        `SELECT id FROM library_items WHERE source_template_ref = '${safe(sourceRef)}' LIMIT 1`
      )) as unknown as [Array<{ id: number }>, unknown];
      libraryItemId = refRows?.[0]?.id ?? 0;
    }

    return res.json({ ok: true, libraryItemId, updated: !(result as unknown as { insertId: number }).insertId });
  } catch (err) {
    console.error('publish-to-library error:', err);
    return res.status(500).json({ error: 'Failed to publish to library' });
  }
}
