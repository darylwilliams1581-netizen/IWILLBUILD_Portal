/**
 * POST /api/document-templates/:id/publish-to-library
 *
 * Any authenticated user can submit a document to the global library.
 *
 * - Platform owners  → visibility='public',  status='active'  (live immediately)
 * - Regular users    → visibility='pending', status='draft'   (queued for review)
 *
 * Body (JSON):
 *   title       — optional override (defaults to template name)
 *   type        — policy|procedure|swms|form|recipe (default: 'form')
 *   category    — optional
 *   discipline  — optional
 *   summary     — optional description
 *
 * Returns: { ok: true, libraryItemId: number, visibility: 'public'|'pending' }
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../lib/auth-middleware.js';

const ALLOWED_TYPES = new Set([
  'policy', 'procedure', 'swms', 'form', 'recipe', 'estimate_recipe', 'scope_line',
  'checklist', 'induction', 'report', 'toolbox_talk', 'prestart',
]);

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  // Check if platform owner
  const [ownerRows] = await db.execute(sql.raw(
    `SELECT role FROM profiles WHERE user_id = '${auth.session.user.id}' LIMIT 1`
  )) as unknown as [Array<{ role: string }>, unknown];
  const isPlatformOwner = ownerRows?.[0]?.role === 'platform_owner';

  const templateId = Number(req.params.id);
  if (!templateId) return res.status(400).json({ error: 'Invalid template ID' });

  // Fetch the template — must belong to the user's company (or any for platform owner)
  const companyClause = isPlatformOwner
    ? `id = ${templateId}`
    : `id = ${templateId} AND company_id = ${auth.profile.company_id ?? 0}`;

  const [rows] = await db.execute(sql.raw(
    `SELECT id, name, builder_json, company_id FROM document_templates WHERE ${companyClause} LIMIT 1`
  )) as unknown as [Array<{ id: number; name: string; builder_json: string | null; company_id: number }>, unknown];

  const template = rows?.[0];
  if (!template) return res.status(404).json({ error: 'Template not found or access denied' });

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

  // Platform owners publish immediately; regular users go into review queue
  const visibility = isPlatformOwner ? 'public' : 'pending';
  const status     = isPlatformOwner ? 'active'  : 'draft';

  // Store submitter info for review queue
  const submittedByCompany = template.company_id ?? null;
  const submittedByUser    = auth.session.user.id;

  try {
    const [result] = await db.execute(sql.raw(
      `INSERT INTO library_items (
         title, type, category, discipline, summary, builder_json,
         status, visibility, version,
         submitted_by_company_id, submitted_by_user_id,
         created_at, updated_at
       )
       VALUES (
         ${JSON.stringify(title)},
         ${JSON.stringify(type)},
         ${category   ? JSON.stringify(category)   : 'NULL'},
         ${discipline ? JSON.stringify(discipline) : 'NULL'},
         ${summary    ? JSON.stringify(summary)    : 'NULL'},
         ${JSON.stringify(builderJson)},
         ${JSON.stringify(status)},
         ${JSON.stringify(visibility)},
         '1.0',
         ${submittedByCompany ?? 'NULL'},
         ${JSON.stringify(submittedByUser)},
         NOW(),
         NOW()
       )`
    )) as unknown as [{ insertId: number }, unknown];

    const libraryItemId = (result as unknown as { insertId: number }).insertId;

    return res.json({ ok: true, libraryItemId, visibility });
  } catch (err) {
    console.error('publish-to-library error:', err);
    return res.status(500).json({ error: 'Failed to publish to library' });
  }
}
