/**
 * GET /api/owner-console/sources/swms
 * ─────────────────────────────────────────────────────────────────────────────
 * Platform-owner view of ALL swms_templates belonging to the developer company,
 * enriched with their Global Library publish state.
 *
 * Publish state is derived by joining library_items on
 *   source_ref = 'swms:{templateId}'
 *
 * Response:
 *   { ok: true, templates: SwmsSourceRow[] }
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
        st.id,
        st.title,
        st.category,
        st.status,
        st.build_mode,
        st.document_type,
        st.revision_number,
        st.created_at,
        st.updated_at,
        li.id            AS library_item_id,
        li.status        AS library_status,
        li.visibility    AS library_visibility,
        COALESCE(li.install_count, 0) AS install_count
      FROM swms_templates st
      LEFT JOIN library_items li
        ON li.source_ref = CONCAT('swms:', st.id)
        AND li.status != 'deleted'
      WHERE st.company_id = ${profile.companyId}
      ORDER BY st.title ASC
    `) as unknown as [Array<{
      id: number;
      title: string;
      category: string | null;
      status: string;
      build_mode: string | null;
      document_type: string | null;
      revision_number: string | null;
      created_at: string;
      updated_at: string;
      library_item_id: number | null;
      library_status: string | null;
      library_visibility: string | null;
      install_count: number;
    }>, unknown];

    const templates = (rows ?? []).map(r => ({
      id: r.id,
      title: r.title,
      category: r.category,
      status: r.status,
      buildMode: r.build_mode,
      documentType: r.document_type,
      revisionNumber: r.revision_number,
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
    console.error('GET /api/owner-console/sources/swms error:', err);
    return res.status(500).json({ error: 'Failed to load SWMS sources' });
  }
}
