/**
 * POST /api/owner-console/library/items/from-template
 *
 * Platform-owner only.
 *
 * Copies an existing platform-owner template (form, swms, or document) into
 * the global library_items table. Uses source_template_ref for upsert so
 * publishing the same source again updates the existing record instead of
 * creating a duplicate. Install/download counts are preserved on update.
 *
 * Body (JSON):
 *   sourceKind  — 'form' | 'swms' | 'document'
 *   sourceId    — integer id of the source template
 *   title       — required string
 *   type        — library item type (form, swms, policy, procedure, etc.)
 *   category    — optional
 *   discipline  — optional
 *   summary     — optional
 *   tags        — optional comma-separated string
 *   version     — default '1.0'
 *   status      — 'active' | 'draft'
 *   visibility  — 'public' | 'private'
 *
 * Returns: { ok: true, id: number, updated: boolean }
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../../lib/auth-middleware.js';
import type { ResultSetHeader } from 'mysql2';

const ALLOWED_TYPES = new Set([
  'policy', 'procedure', 'swms', 'form', 'checklist', 'induction',
  'toolbox_talk', 'prestart', 'report', 'recipe', 'estimate_recipe', 'scope_line', 'document',
]);

const ALLOWED_SOURCE_KINDS = new Set(['form', 'swms', 'document']);

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  // Platform owner check — must be platform_owner role
  const [ownerCheck] = await db.execute(sql.raw(
    `SELECT role FROM profiles WHERE user_id = '${auth.session.user.id}' LIMIT 1`
  )) as unknown as [Array<{ role: string }>, unknown];
  if (ownerCheck?.[0]?.role !== 'platform_owner') {
    return res.status(403).json({ error: 'Platform owner access required' });
  }

  const body = req.body as {
    sourceKind?: string;
    sourceId?: unknown;
    title?: string;
    type?: string;
    category?: string | null;
    discipline?: string | null;
    summary?: string | null;
    tags?: string | null;
    version?: string;
    status?: string;
    visibility?: string;
  };

  const sourceKind = (body.sourceKind ?? '').trim();
  const sourceId   = parseInt(String(body.sourceId ?? '0'));
  const title      = (body.title ?? '').trim();
  const type       = (body.type ?? 'form').trim();
  const category   = (body.category ?? '').trim() || null;
  const discipline = (body.discipline ?? '').trim() || null;
  const summary    = (body.summary ?? '').trim() || null;
  const tags       = (body.tags ?? '').trim() || null;
  const version    = (body.version ?? '1.0').trim() || '1.0';
  const status     = ['active', 'draft'].includes(body.status ?? '') ? (body.status as string) : 'active';
  const visibility = ['public', 'private'].includes(body.visibility ?? '') ? (body.visibility as string) : 'public';

  if (!ALLOWED_SOURCE_KINDS.has(sourceKind)) {
    return res.status(400).json({ error: 'Invalid sourceKind. Must be form, swms, or document.' });
  }
  if (!sourceId) return res.status(400).json({ error: 'Invalid sourceId' });
  if (!title)    return res.status(400).json({ error: 'Title is required' });
  if (!ALLOWED_TYPES.has(type)) {
    return res.status(400).json({ error: `Invalid type: ${type}` });
  }

  const safe = (s: string) => s.replace(/'/g, "''");

  try {
    // ── Fetch source template content ─────────────────────────────────────────
    let builderJson: string | null = null;

    if (sourceKind === 'form') {
      // Fetch form template + fields
      const [formRows] = await db.execute(sql.raw(
        `SELECT id, name, form_type, category, description FROM form_templates WHERE id = ${sourceId} LIMIT 1`
      )) as unknown as [Array<{ id: number; name: string; form_type: string; category: string | null; description: string | null }>, unknown];

      if (!formRows?.[0]) return res.status(404).json({ error: 'Form template not found' });

      const [fieldRows] = await db.execute(sql.raw(
        `SELECT label, field_type, required, options_json, field_order
         FROM form_template_fields
         WHERE template_id = ${sourceId}
         ORDER BY field_order ASC`
      )) as unknown as [Array<{ label: string; field_type: string; required: number; options_json: string | null; field_order: number }>, unknown];

      const fields = (fieldRows ?? []).map(f => ({
        label:     f.label,
        fieldType: f.field_type,
        isRequired: !!f.required,
        options:   f.options_json ? (() => { try { return JSON.parse(f.options_json!) as string[]; } catch { return []; } })() : [],
        sortOrder: f.field_order,
      }));

      builderJson = JSON.stringify({
        formType:    formRows[0].form_type,
        description: formRows[0].description ?? '',
        fields,
      });

    } else if (sourceKind === 'swms') {
      const [swmsRows] = await db.execute(sql.raw(
        `SELECT id, title, category, swms_body FROM swms_templates WHERE id = ${sourceId} LIMIT 1`
      )) as unknown as [Array<{ id: number; title: string; category: string | null; swms_body: string | null }>, unknown];

      if (!swmsRows?.[0]) return res.status(404).json({ error: 'SWMS template not found' });
      builderJson = swmsRows[0].swms_body ?? '{"blocks":[]}';

    } else {
      // document
      const [docRows] = await db.execute(sql.raw(
        `SELECT id, name, template_type, builder_json FROM document_templates WHERE id = ${sourceId} LIMIT 1`
      )) as unknown as [Array<{ id: number; name: string; template_type: string; builder_json: string | null }>, unknown];

      if (!docRows?.[0]) return res.status(404).json({ error: 'Document template not found' });
      builderJson = docRows[0].builder_json ?? '{"blocks":[],"systemFields":[],"sourceAttachments":[]}';
    }

    // ── Build source_template_ref ─────────────────────────────────────────────
    const sourceRef = `${sourceKind}:${sourceId}`;

    // ── Check if already published (upsert) ───────────────────────────────────
    const [existingRows] = await db.execute(sql.raw(
      `SELECT id, install_count, download_count FROM library_items WHERE source_template_ref = '${safe(sourceRef)}' LIMIT 1`
    )) as unknown as [Array<{ id: number; install_count: number; download_count: number }>, unknown];

    const existing = existingRows?.[0];

    const safeTitle      = safe(title);
    const safeType       = safe(type);
    const safeCategory   = category   ? `'${safe(category)}'`   : 'NULL';
    const safeDiscipline = discipline ? `'${safe(discipline)}'` : 'NULL';
    const safeSummary    = summary    ? `'${safe(summary)}'`    : 'NULL';
    const safeTags       = tags       ? `'${safe(tags)}'`       : 'NULL';
    const safeVersion    = safe(version);
    const safeBuilderJson = builderJson ? `'${safe(builderJson)}'` : 'NULL';
    const safeRef        = safe(sourceRef);

    let newId: number;
    let updated = false;

    if (existing) {
      // Update existing record — preserve install_count and download_count
      await db.execute(sql.raw(`
        UPDATE library_items SET
          title        = '${safeTitle}',
          type         = '${safeType}',
          category     = ${safeCategory},
          discipline   = ${safeDiscipline},
          summary      = ${safeSummary},
          tags         = ${safeTags},
          version      = '${safeVersion}',
          status       = '${status}',
          visibility   = '${visibility}',
          builder_json = ${safeBuilderJson},
          updated_at   = CURRENT_TIMESTAMP
        WHERE id = ${existing.id}
      `));
      newId   = existing.id;
      updated = true;
    } else {
      // Insert new record
      const [insertResult] = await db.execute(sql.raw(`
        INSERT INTO library_items
          (type, category, title, summary, tags, discipline, version, status, visibility,
           builder_json, source_template_ref, install_count, download_count)
        VALUES
          ('${safeType}', ${safeCategory}, '${safeTitle}', ${safeSummary}, ${safeTags},
           ${safeDiscipline}, '${safeVersion}', '${status}', '${visibility}',
           ${safeBuilderJson}, '${safeRef}', 0, 0)
      `)) as unknown as [ResultSetHeader, unknown];
      newId = insertResult.insertId;
    }

    return res.status(updated ? 200 : 201).json({ ok: true, id: newId, updated });

  } catch (err) {
    console.error('POST /api/owner-console/library/items/from-template error:', err);
    return res.status(500).json({ error: 'Failed to add template to library' });
  }
}
