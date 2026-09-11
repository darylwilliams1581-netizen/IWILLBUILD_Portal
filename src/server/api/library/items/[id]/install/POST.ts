/**
 * POST /api/library/items/:id/install
 *
 * Downloads a global library item into the company's own templates.
 *
 * Behaviour by type:
 *   form / checklist / induction / prestart / report / toolbox_talk
 *     → INSERT into form_templates + form_template_fields
 *     → redirectTarget: '/forms'
 *
 *   swms
 *     → INSERT into swms_templates
 *     → redirectTarget: '/safety'
 *
 *   document / procedure / policy / recipe / scope_line / estimate_recipe
 *     → INSERT into document_templates
 *     → redirectTarget: '/studio-documents'
 *
 * Each download always creates a fresh copy — users can download again if they
 * want a clean reset. No deduplication check.
 *
 * Access: any authenticated company user.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../../lib/auth-middleware.js';
import type { ResultSetHeader } from 'mysql2';

// Types that map to form_templates
const FORM_TYPES = new Set([
  'form', 'checklist', 'induction', 'prestart', 'report', 'toolbox_talk',
]);

// Types that map to swms_templates
const SWMS_TYPES = new Set(['swms']);

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  const sourceId = parseInt(req.params.id);
  if (!sourceId) return res.status(400).json({ error: 'Invalid id' });

  const companyId = auth.profile.companyId;

  try {
    // ── Fetch source item ─────────────────────────────────────────────────────
    const [sourceRows] = await db.execute(
      sql.raw(`
        SELECT id, type, category, title, builder_json, content, version, metadata_json
        FROM library_items
        WHERE id = ${sourceId} AND visibility = 'public' AND status = 'active'
        LIMIT 1
      `)
    ) as unknown as [Array<{
      id: number; type: string; category: string | null; title: string;
      builder_json: string | null; content: string | null; version: string;
      metadata_json: string | null;
    }>, unknown];

    const source = sourceRows?.[0];
    if (!source) return res.status(404).json({ error: 'Library item not found or not available.' });

    const safe = (s: string) => s.replace(/'/g, "''");
    const safeTitle = safe(source.title ?? 'Untitled');
    const safeCategory = source.category ? `'${safe(source.category)}'` : 'NULL';

    let newId: number;
    let redirectTarget: string;
    let redirectLabel: string;

    // ── FORM types ────────────────────────────────────────────────────────────
    if (FORM_TYPES.has(source.type)) {
      // builder_json shape: { formType, description, fields: [{ label, fieldType, isRequired, options, sortOrder }] }
      let formType = 'Job';
      let description = '';
      let fields: Array<{
        label: string; fieldType: string; isRequired: boolean;
        options: string[]; sortOrder: number;
      }> = [];

      if (source.builder_json) {
        try {
          const parsed = JSON.parse(source.builder_json) as {
            formType?: string; description?: string;
            fields?: Array<{ label: string; fieldType: string; isRequired?: boolean; options?: string[]; sortOrder?: number }>;
          };
          formType = parsed.formType ?? 'Job';
          description = parsed.description ?? '';
          fields = (parsed.fields ?? []).map((f, i) => ({
            label: f.label ?? '',
            fieldType: f.fieldType ?? 'text',
            isRequired: !!f.isRequired,
            options: Array.isArray(f.options) ? f.options : [],
            sortOrder: f.sortOrder ?? i,
          }));
        } catch { /* leave defaults */ }
      }

      const safeFormType = safe(formType);
      const safeDesc = description ? `'${safe(description)}'` : 'NULL';

      const [insertResult] = await db.execute(
        sql.raw(`
          INSERT INTO form_templates
            (company_id, name, form_type, category, description, is_active, shared_in_library)
          VALUES
            (${companyId}, '${safeTitle}', '${safeFormType}', ${safeCategory}, ${safeDesc}, 1, 0)
        `)
      ) as unknown as [ResultSetHeader, unknown];

      newId = insertResult.insertId;

      // Insert fields
      for (const field of fields) {
        const safeLabel = safe(field.label);
        const safeFieldType = safe(field.fieldType);
        const optionsJson = field.options.length > 0
          ? `'${safe(JSON.stringify(field.options))}'`
          : 'NULL';
        await db.execute(
          sql.raw(`
          INSERT INTO form_template_fields
              (template_id, company_id, label, field_type, required, options_json, field_order)
            VALUES
              (${newId}, ${companyId}, '${safeLabel}', '${safeFieldType}', ${field.isRequired ? 1 : 0}, ${optionsJson}, ${field.sortOrder})
          `)
        );
      }

      redirectTarget = '/forms';
      redirectLabel = 'Forms';

    // ── SWMS types ────────────────────────────────────────────────────────────
    } else if (SWMS_TYPES.has(source.type)) {
      // builder_json is the swms_body JSON string
      const swmsBody = source.builder_json ?? '{"blocks":[]}';
      const safeBody = safe(swmsBody);

      const [insertResult] = await db.execute(
        sql.raw(`
          INSERT INTO swms_templates
            (company_id, title, category, swms_body, build_mode, document_type)
          VALUES
            (${companyId}, '${safeTitle}', ${safeCategory}, '${safeBody}', 'builder', 'swms')
        `)
      ) as unknown as [ResultSetHeader, unknown];

      newId = insertResult.insertId;
      redirectTarget = '/safety';
      redirectLabel = 'Safety';

    // ── DOCUMENT types (everything else) ─────────────────────────────────────
    } else {
      const builderJson = source.builder_json ?? '{"blocks":[],"systemFields":[],"sourceAttachments":[]}';
      const safeBuilderJson = safe(builderJson);
      const tType = safe(source.type ?? 'document');
      // Document-only settings are carried inside the library item's metadata.
      let metadata: Record<string, unknown> = {};
      if (source.metadata_json) {
        try {
          metadata = JSON.parse(source.metadata_json) as Record<string, unknown>;
        } catch { /* use document defaults */ }
      }
      const metadataValue = (value: unknown, fallback: unknown): string => {
        const resolved = value ?? fallback;
        return resolved === null
          ? 'NULL'
          : `'${safe(typeof resolved === 'string' ? resolved : JSON.stringify(resolved))}'`;
      };
      const pageLayoutVal = metadataValue(
        metadata.page_layout_json ?? metadata.pageLayout,
        {},
      );
      const themeVal = metadataValue(
        metadata.theme_json ?? metadata.theme,
        {},
      );
      const pdfSettingsVal = metadataValue(
        metadata.pdf_settings_json ?? metadata.pdfSettings,
        null,
      );

      const [insertResult] = await db.execute(
        sql.raw(`
          INSERT INTO document_templates
            (company_id, name, template_type, builder_json, page_layout_json, theme_json, pdf_settings_json, doc_status)
          VALUES
            (${companyId}, '${safeTitle}', '${tType}', '${safeBuilderJson}', ${pageLayoutVal}, ${themeVal}, ${pdfSettingsVal}, 'draft')
        `)
      ) as unknown as [ResultSetHeader, unknown];

      newId = insertResult.insertId;
      redirectTarget = '/studio-documents';
      redirectLabel = 'Documents';
    }

    // ── Increment install_count on source ─────────────────────────────────────
    await db.execute(
      sql.raw(`UPDATE library_items SET install_count = install_count + 1 WHERE id = ${sourceId}`)
    ).catch(() => { /* non-critical */ });

    return res.status(201).json({
      ok: true,
      newId,
      redirectTarget,
      redirectLabel,
      message: `"${source.title}" downloaded to your ${redirectLabel}.`,
    });

  } catch (err) {
    console.error('POST /api/library/items/:id/install error:', err);
    return res.status(500).json({ error: 'Failed to download library item' });
  }
}
