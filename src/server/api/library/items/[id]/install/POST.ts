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
 * Access: owner, admin, estimator, member roles.
 * Members can browse and download library items into company templates.
 * They cannot publish, edit, or delete Global Library masters (those remain
 * platform-developer only via /api/owner-console/sources/* endpoints).
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../../lib/auth-middleware.js';
import { getSubscriptionInfo } from '../../../../../lib/subscription-gate.js';
import type { ResultSetHeader } from 'mysql2';

const ALLOWED_ROLES = new Set(['owner', 'admin', 'estimator', 'member']);

/** Subscription statuses that are allowed to install library items */
const INSTALL_ALLOWED_STATUSES = new Set([
  'active', 'trial', 'cancel_at_period_end', 'past_due',
]);

// Types that map to form_templates
const FORM_TYPES = new Set([
  'form', 'checklist', 'induction', 'prestart', 'report', 'toolbox_talk',
]);

// Types that map to swms_templates
const SWMS_TYPES = new Set(['swms']);

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  if (!ALLOWED_ROLES.has(auth.profile.role)) {
    return res.status(403).json({ error: 'Only owners, admins, and estimators can download library items.' });
  }

  // ── Subscription gate ───────────────────────────────────────────────────────
  // Platform developers bypass; everyone else must be on an active/trial plan.
  const isPlatformDev = auth.profile.role === 'platform_owner';
  if (!isPlatformDev) {
    const sub = await getSubscriptionInfo(req);
    const status = sub?.status ?? 'no_company';
    const isViewOnly = sub?.isViewOnly ?? true;
    if (isViewOnly || !INSTALL_ALLOWED_STATUSES.has(status)) {
      return res.status(402).json({
        error: 'Library downloads require an active IWILLBUILD plan.',
        code: 'library_locked',
      });
    }
  }

  const sourceId = parseInt(req.params.id);
  if (!sourceId) return res.status(400).json({ error: 'Invalid id' });

  const companyId = auth.profile.companyId;

  try {
    // ── Fetch source item ─────────────────────────────────────────────────────
    // NOTE: page_layout_json / theme_json / pdf_settings_json are document_templates
    // columns, NOT library_items columns. Read them from metadata_json instead when
    // present, or fall back to safe defaults. Never SELECT non-existent columns.
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

      // Insert fields — company_id is required; errors are surfaced not swallowed
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

      // page_layout_json / theme_json / pdf_settings_json are NOT columns on
      // library_items — extract from metadata_json if the publisher stored them there
      let pageLayoutVal  = "'{}'";
      let themeVal       = "'{}'";
      let pdfSettingsVal = 'NULL';
      if (source.metadata_json) {
        try {
          const meta = JSON.parse(source.metadata_json) as {
            page_layout_json?: string; theme_json?: string; pdf_settings_json?: string;
          };
          if (meta.page_layout_json)  pageLayoutVal  = `'${safe(meta.page_layout_json)}'`;
          if (meta.theme_json)        themeVal       = `'${safe(meta.theme_json)}'`;
          if (meta.pdf_settings_json) pdfSettingsVal = `'${safe(meta.pdf_settings_json)}'`;
        } catch { /* leave defaults */ }
      }

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
