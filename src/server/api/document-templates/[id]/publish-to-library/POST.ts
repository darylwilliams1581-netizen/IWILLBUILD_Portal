/**
 * POST /api/document-templates/:id/publish-to-library
 *
 * Platform-owner only.
 * Copies a document template's builder_json into the global library_items table
 * so it becomes available to all companies via the Library tab.
 *
 * Body (JSON):
 *   title       — optional override (defaults to template name)
 *   type        — policy|procedure|swms|form|recipe (default: 'form')
 *   category    — optional
 *   discipline  — optional
 *   summary     — optional description
 *
 * Returns: { ok: true, libraryItemId: number }
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../lib/auth-middleware.js';

const ALLOWED_TYPES = new Set([
  'policy', 'procedure', 'swms', 'form', 'recipe', 'estimate_recipe', 'scope_line',
]);

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  // Platform owner only
  const [ownerCheck] = await db.execute(sql.raw(
    `SELECT role FROM profiles WHERE user_id = '${auth.session.user.id}' LIMIT 1`
  )) as unknown as [Array<{ role: string }>, unknown];
  if (ownerCheck?.[0]?.role !== 'platform_owner') {
    return res.status(403).json({ error: 'Platform owner access required' });
  }

  const templateId = Number(req.params.id);
  if (!templateId) return res.status(400).json({ error: 'Invalid template ID' });

  // Fetch the template
  const [rows] = await db.execute(sql.raw(
    `SELECT id, name, builder_json, company_id FROM document_templates WHERE id = ${templateId} LIMIT 1`
  )) as unknown as [Array<{ id: number; name: string; builder_json: string | null; company_id: number }>, unknown];

  const template = rows?.[0];
  if (!template) return res.status(404).json({ error: 'Template not found' });

  const body = req.body as {
    title?: string;
    type?: string;
    category?: string;
    discipline?: string;
    summary?: string;
  };

  const title      = (body.title ?? template.name ?? 'Untitled').trim();
  const type       = ALLOWED_TYPES.has(body.type ?? '') ? (body.type ?? 'form') : 'form';
  const category   = (body.category ?? '').trim() || null;
  const discipline = (body.discipline ?? '').trim() || null;
  const summary    = (body.summary ?? '').trim() || null;
  const builderJson = template.builder_json ?? '{"blocks":[]}';

  try {
    const [result] = await db.execute(sql.raw(
      `INSERT INTO library_items (title, type, category, discipline, summary, builder_json, status, visibility, version, created_at, updated_at)
       VALUES (
         ${JSON.stringify(title)},
         ${JSON.stringify(type)},
         ${category ? JSON.stringify(category) : 'NULL'},
         ${discipline ? JSON.stringify(discipline) : 'NULL'},
         ${summary ? JSON.stringify(summary) : 'NULL'},
         ${JSON.stringify(builderJson)},
         'active',
         'public',
         '1.0',
         NOW(),
         NOW()
       )`
    )) as unknown as [{ insertId: number }, unknown];

    const libraryItemId = (result as unknown as { insertId: number }).insertId;

    return res.json({ ok: true, libraryItemId });
  } catch (err) {
    console.error('publish-to-library error:', err);
    return res.status(500).json({ error: 'Failed to publish to library' });
  }
}
