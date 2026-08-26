/**
 * POST /api/document-templates/:id/duplicate
 *
 * Creates a full copy of an existing document template.
 *
 * Strategy: INSERT … SELECT — copies every content column verbatim from the
 * source row and resets only the identity/ownership fields that must differ on
 * the new record:
 *   - id          → AUTO_INCREMENT (omitted from SELECT)
 *   - name        → "<original name> (Copy)"
 *   - created_by_user_id → current session user
 *   - created_at / updated_at → NOW()
 *
 * All other columns — including builder_json, page_layout_json, theme_json,
 * pdf_settings_json, doc_kind, requires_acknowledgement, acknowledgement_label,
 * acknowledgement_text, submit_label, requires_signature, source_job_id,
 * doc_status, use_type, source_docx_path, source_docx_name, is_active — are
 * copied exactly from the source row.
 *
 * Resilience: newer columns (pdf_settings_json, doc_kind, etc.) are added via
 * colsToEnsure at startup.  If a column does not yet exist on an older DB the
 * INSERT…SELECT will fail with ER_BAD_FIELD_ERROR; we fall back to copying only
 * the core columns that are guaranteed to exist from the initial CREATE TABLE.
 * This mirrors the same pattern used in POST.ts and PUT.ts.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { profiles } from '../../../../db/schema.js';
import { eq } from 'drizzle-orm';

// ── Column lists ──────────────────────────────────────────────────────────────
// FULL_COLS: every column present after all colsToEnsure migrations have run.
// CORE_COLS: only the columns present in the initial CREATE TABLE — used as a
//            fallback when the DB has not yet been migrated.
//
// Rules:
//   • id is omitted (AUTO_INCREMENT generates a new PK).
//   • name, created_by_user_id, created_at, updated_at are supplied as literals
//     (not copied from the source row).
//   • All other columns are copied verbatim via SELECT.

const COPY_COLS_FULL = [
  'company_id',
  'template_type',
  'builder_json',
  'page_layout_json',
  'theme_json',
  'pdf_settings_json',
  'source_docx_path',
  'source_docx_name',
  'use_type',
  'doc_kind',
  'requires_acknowledgement',
  'acknowledgement_label',
  'acknowledgement_text',
  'submit_label',
  'requires_signature',
  'source_job_id',
  'doc_status',
  'is_active',
] as const;

const COPY_COLS_CORE = [
  'company_id',
  'template_type',
  'builder_json',
  'page_layout_json',
  'theme_json',
  'source_docx_path',
  'source_docx_name',
  'is_active',
] as const;

// ── Handler ───────────────────────────────────────────────────────────────────

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

    const templateId = parseInt(req.params.id, 10);
    if (!templateId || isNaN(templateId)) return res.status(400).json({ error: 'Invalid id' });

    // ── Verify the source template exists and belongs to this company ──────────
    const [checkRows] = await db.execute(sql.raw(
      `SELECT id, name FROM document_templates WHERE id = ${templateId} AND company_id = ${profile.companyId} LIMIT 1`
    )) as unknown as [Array<{ id: number; name: string }>, unknown];

    const source = Array.isArray(checkRows) ? checkRows[0] : null;
    if (!source) return res.status(404).json({ error: 'Template not found' });

    const newName = `${String(source.name ?? 'Document')} (Copy)`;
    const escapedName = newName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const escapedUserId = String(session.user.id).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

    // ── INSERT … SELECT — full column copy ────────────────────────────────────
    // The literal columns (name, created_by_user_id, created_at, updated_at)
    // are supplied as SQL expressions; all other columns are read from the
    // source row.  id is omitted so AUTO_INCREMENT assigns a new PK.

    const buildInsertSelect = (copyCols: readonly string[]): string => {
      const insertCols = ['name', 'created_by_user_id', 'created_at', 'updated_at', ...copyCols];
      const selectExprs = [
        `'${escapedName}'`,
        `'${escapedUserId}'`,
        'NOW()',
        'NOW()',
        ...copyCols,
      ];
      return (
        `INSERT INTO document_templates (${insertCols.join(', ')}) ` +
        `SELECT ${selectExprs.join(', ')} ` +
        `FROM document_templates ` +
        `WHERE id = ${templateId} AND company_id = ${profile.companyId}`
      );
    };

    let insertId: number;

    try {
      const [result] = await db.execute(sql.raw(buildInsertSelect(COPY_COLS_FULL))) as unknown as [{ insertId: number }, unknown];
      insertId = result.insertId;
    } catch (insertErr: unknown) {
      const errObj = insertErr as { message?: string; cause?: { message?: string; sqlMessage?: string } };
      const combined = String(errObj?.message ?? insertErr) + ' ' + String(errObj?.cause?.message ?? errObj?.cause?.sqlMessage ?? '');
      if (combined.includes('ER_BAD_FIELD_ERROR') || combined.includes('Unknown column')) {
        // Newer columns not yet migrated — fall back to core columns only
        console.warn('[document-templates duplicate] Newer columns missing — copying core fields only. Redeploy to apply migrations.');
        const [result] = await db.execute(sql.raw(buildInsertSelect(COPY_COLS_CORE))) as unknown as [{ insertId: number }, unknown];
        insertId = result.insertId;
      } else {
        throw insertErr;
      }
    }

    return res.status(201).json({ id: insertId, ok: true });
  } catch (err) {
    console.error('POST /api/document-templates/:id/duplicate error:', err);
    return res.status(500).json({ error: 'Failed to duplicate template' });
  }
}
