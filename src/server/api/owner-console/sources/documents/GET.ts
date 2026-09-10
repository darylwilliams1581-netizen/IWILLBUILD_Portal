/**
 * GET /api/owner-console/sources/documents
 * ─────────────────────────────────────────────────────────────────────────────
 * Platform-developer view of ALL document_templates, enriched with their
 * Global Library publish state.
 *
 * Access: platform_role = 'developer' (or PLATFORM_OWNER_EMAIL fallback).
 *
 * Publish state is derived by joining library_items on
 *   source_ref = 'document:{templateId}'
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getPlatformOwnerInfo } from '../../../../lib/platform-owner-guard.js';

export default async function handler(req: Request, res: Response) {
  try {
    const info = await getPlatformOwnerInfo(req);
    if (!info) return res.status(401).json({ error: 'Unauthorised' });
    if (!info.isPlatformOwner) return res.status(403).json({ error: 'Platform developer access required' });

    const [rows] = await db.execute(sql`
      SELECT
        dt.id,
        dt.name,
        dt.type,
        dt.category,
        dt.status,
        dt.company_id,
        dt.created_at,
        dt.updated_at,
        li.id            AS library_item_id,
        li.status        AS library_status,
        li.visibility    AS library_visibility,
        COALESCE(li.install_count, 0) AS install_count
      FROM document_templates dt
      LEFT JOIN library_items li
        ON li.source_ref = CONCAT('document:', dt.id)
        AND li.status != 'deleted'
      ORDER BY dt.name ASC
    `) as unknown as [Array<{
      id: number;
      name: string;
      type: string | null;
      category: string | null;
      status: string;
      company_id: number | null;
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
      type: r.type,
      category: r.category,
      status: r.status,
      companyId: r.company_id,
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
    console.error('GET /api/owner-console/sources/documents error:', err);
    return res.status(500).json({ error: 'Failed to load document sources' });
  }
}
