/**
 * POST /api/document-templates/:id/duplicate
 * Creates a copy of an existing document template.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { profiles } from '../../../../db/schema.js';
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

    const templateId = parseInt(req.params.id, 10);
    if (!templateId || isNaN(templateId)) return res.status(400).json({ error: 'Invalid id' });

    // Fetch original
    const [rows] = await db.execute(sql.raw(
      `SELECT * FROM document_templates WHERE id = ${templateId} AND company_id = ${profile.companyId} LIMIT 1`
    )) as unknown as [Array<Record<string, unknown>>, unknown];

    const orig = rows?.[0];
    if (!orig) return res.status(404).json({ error: 'Not found' });

    const newName = `${String(orig.name ?? 'Document')} (Copy)`;
    const pageLayout = orig.page_layout_json ? JSON.stringify(orig.page_layout_json) : 'NULL';
    const theme = orig.theme_json ? JSON.stringify(orig.theme_json) : 'NULL';
    const templateType = orig.template_type ? `'${String(orig.template_type).replace(/'/g, "''")}'` : 'NULL';
    const sourceDocx = orig.source_docx_name ? `'${String(orig.source_docx_name).replace(/'/g, "''")}'` : 'NULL';

    await db.execute(sql.raw(
      `INSERT INTO document_templates (company_id, name, template_type, page_layout_json, theme_json, source_docx_name, is_active, created_by_user_id, created_at, updated_at)
       VALUES (
         ${profile.companyId},
         '${newName.replace(/'/g, "''")}',
         ${templateType},
         ${pageLayout !== 'NULL' ? `'${String(orig.page_layout_json).replace(/'/g, "''")}'` : 'NULL'},
         ${theme !== 'NULL' ? `'${String(orig.theme_json).replace(/'/g, "''")}'` : 'NULL'},
         ${sourceDocx},
         1,
         '${session.user.id}',
         NOW(),
         NOW()
       )`
    ));

    return res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/document-templates/:id/duplicate error:', err);
    return res.status(500).json({ error: 'Failed to duplicate' });
  }
}
