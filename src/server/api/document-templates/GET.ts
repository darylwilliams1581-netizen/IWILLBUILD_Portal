/**
 * GET /api/document-templates
 * List all document templates for the authenticated company.
 * Falls back to a minimal column set if newer columns don't exist yet on the DB.
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';
import { profiles } from '../../db/schema.js';
import { eq } from 'drizzle-orm';

// Full column list — requires all colsToEnsure columns to exist
const FULL_SELECT = (companyId: number) =>
  `SELECT id, company_id, name, template_type, page_layout_json, theme_json,
          source_docx_name, is_active, created_by_user_id, created_at, updated_at,
          doc_kind, requires_acknowledgement, acknowledgement_label, acknowledgement_text,
          submit_label, requires_signature, doc_status,
          safety_category, source_widget_type, source_record_id
   FROM document_templates
   WHERE company_id = ${companyId}
   ORDER BY updated_at DESC`;

// Safe fallback — only columns present in the original CREATE TABLE DDL
const SAFE_SELECT = (companyId: number) =>
  `SELECT id, company_id, name, template_type, page_layout_json, theme_json,
          source_docx_name, is_active, created_by_user_id, created_at, updated_at,
          'doc'   AS doc_kind,
          0       AS requires_acknowledgement,
          ''      AS acknowledgement_label,
          ''      AS acknowledgement_text,
          ''      AS submit_label,
          0       AS requires_signature,
          'draft' AS doc_status,
          NULL    AS safety_category,
          NULL    AS source_widget_type,
          NULL    AS source_record_id
   FROM document_templates
   WHERE company_id = ${companyId}
   ORDER BY updated_at DESC`;

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

    let rows: Array<Record<string, unknown>>;

    try {
      // Try the full query first (normal path once all columns exist)
      const [result] = await db.execute(sql.raw(FULL_SELECT(profile.companyId))) as unknown as [Array<Record<string, unknown>>, unknown];
      rows = result ?? [];
    } catch (innerErr: unknown) {
      const msg = String((innerErr as Error)?.message ?? innerErr);
      // ER_BAD_FIELD_ERROR = column doesn't exist yet — fall back to safe query
      if (msg.includes('ER_BAD_FIELD_ERROR') || msg.includes('Unknown column')) {
        console.warn('[document-templates GET] Newer columns missing — using safe fallback query. Redeploy to apply migrations.');
        const [result] = await db.execute(sql.raw(SAFE_SELECT(profile.companyId))) as unknown as [Array<Record<string, unknown>>, unknown];
        rows = result ?? [];
      } else {
        throw innerErr;
      }
    }

    return res.json({ templates: rows });
  } catch (err) {
    console.error('GET /api/document-templates error:', err);
    return res.status(500).json({ error: 'Failed to load document templates' });
  }
}
