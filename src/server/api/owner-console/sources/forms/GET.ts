/**
 * GET /api/owner-console/sources/forms
 * ─────────────────────────────────────────────────────────────────────────────
 * Platform-owner view of ALL form_templates belonging to the developer company,
 * enriched with their Global Library publish state.
 *
 * Publish state is derived by joining library_items on
 *   source_ref = 'form:{templateId}'
 *
 * Response:
 *   { ok: true, templates: FormSourceRow[] }
 *
 * FormSourceRow:
 *   id, name, category, form_type, status, created_at, updated_at,
 *   libraryItemId (null if not published),
 *   libraryStatus ('not_published' | 'published' | 'archived'),
 *   libraryVisibility ('public' | 'private' | null),
 *   installCount (number)
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

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });
    if (profile.platformRole !== 'owner') return res.status(403).json({ error: 'Platform owner access required' });

    const [rows] = await db.execute(sql`
      SELECT
        ft.id,
        ft.name,
        ft.category,
        ft.form_type,
        ft.status,
        ft.created_at,
        ft.updated_at,
        li.id            AS library_item_id,
        li.status        AS library_status,
        li.visibility    AS library_visibility,
        COALESCE(li.install_count, 0) AS install_count
      FROM form_templates ft
      LEFT JOIN library_items li
        ON li.source_ref = CONCAT('form:', ft.id)
        AND li.status != 'deleted'
      WHERE ft.company_id = ${profile.companyId}
      ORDER BY ft.name ASC
    `) as unknown as [Array<{
      id: number;
      name: string;
      category: string | null;
      form_type: string | null;
      status: string;
      created_at: string;
      updated_at: string;
      library_item_id: number | null;
      library_status: string | null;
      library_visibility: string | null;
      install_count: number;
    }>, unknown];

    const templates = (rows ?? []).map(r => ({
      id: r.id,
      name: r.name,
      category: r.category,
      formType: r.form_type,
      status: r.status,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      libraryItemId: r.library_item_id ?? null,
      libraryStatus: r.library_item_id
        ? (r.library_status === 'archived' ? 'archived' : 'published')
        : 'not_published',
      libraryVisibility: r.library_visibility ?? null,
      installCount: Number(r.install_count ?? 0),
    }));

    return res.json({ ok: true, templates });
  } catch (err) {
    console.error('GET /api/owner-console/sources/forms error:', err);
    return res.status(500).json({ error: 'Failed to load form sources' });
  }
}
