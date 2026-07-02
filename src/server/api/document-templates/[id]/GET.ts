/**
 * GET /api/document-templates/:id
 * Load a single document template (full builder JSON).
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { profiles } from '../../../db/schema.js';
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

    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid ID' });

    const [rows] = await db.execute(sql.raw(
      `SELECT * FROM document_templates WHERE id = ${id} AND company_id = ${profile.companyId} LIMIT 1`
    )) as unknown as [Array<Record<string, unknown>>, unknown];

    const row = rows?.[0];
    if (!row) return res.status(404).json({ error: 'Template not found' });

    // Parse JSON blobs
    let builderData: Record<string, unknown> = {};
    try { builderData = JSON.parse(String(row.builder_json ?? '{}')); } catch { /* ignore */ }
    let pageLayout: unknown = {};
    try { pageLayout = JSON.parse(String(row.page_layout_json ?? '{}')); } catch { /* ignore */ }
    let theme: unknown = {};
    try { theme = JSON.parse(String(row.theme_json ?? '{}')); } catch { /* ignore */ }

    return res.json({
      template: {
        id: row.id,
        companyId: row.company_id,
        name: row.name,
        templateType: row.template_type,
        blocks: builderData.blocks ?? [],
        systemFields: builderData.systemFields ?? [],
        sourceAttachments: builderData.sourceAttachments ?? [],
        pageLayout,
        theme,
        sourceDocxPath: row.source_docx_path,
        sourceDocxName: row.source_docx_name,
        isActive: Boolean(row.is_active),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (err) {
    console.error('GET /api/document-templates/:id error:', err);
    return res.status(500).json({ error: 'Failed to load template' });
  }
}
