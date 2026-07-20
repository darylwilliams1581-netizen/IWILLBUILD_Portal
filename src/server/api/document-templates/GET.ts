/**
 * GET /api/document-templates
 * List all document templates for the authenticated company.
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';
import { profiles } from '../../db/schema.js';
import { eq } from 'drizzle-orm';

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

    const [rows] = await db.execute(sql.raw(
      `SELECT id, company_id, name, template_type, page_layout_json, theme_json,
              source_docx_name, is_active, created_by_user_id, created_at, updated_at,
              doc_kind, requires_acknowledgement, acknowledgement_label, acknowledgement_text,
              submit_label, requires_signature
       FROM document_templates
       WHERE company_id = ${profile.companyId}
       ORDER BY updated_at DESC`
    )) as unknown as [Array<Record<string, unknown>>, unknown];

    return res.json({ templates: rows ?? [] });
  } catch (err) {
    console.error('GET /api/document-templates error:', err);
    return res.status(500).json({ error: 'Failed to load document templates' });
  }
}
