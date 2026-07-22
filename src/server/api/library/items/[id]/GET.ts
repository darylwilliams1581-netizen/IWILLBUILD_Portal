/**
 * GET /api/library/items/:id
 *
 * Full detail of a single global library source item, including content.
 * Also returns whether the current company has already installed it.
 *
 * Access: any authenticated user with a company.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../lib/auth-middleware.js';

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });

  try {
    const [rows] = await db.execute(
      sql.raw(`
        SELECT
          id, type, category, title, summary, tags, discipline,
          version, status, visibility,
          content, metadata_json, source_links,
          install_count, download_count,
          ROUND(CASE WHEN rating_count > 0 THEN rating_sum / rating_count ELSE 0 END, 1) AS avg_rating,
          rating_count,
          created_at, updated_at
        FROM library_items
        WHERE id = ${id} AND visibility = 'public' AND status = 'active'
        LIMIT 1
      `)
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    const item = rows?.[0];
    if (!item) return res.status(404).json({ error: 'Library item not found' });

    // Check if this company has already installed it
    const [installedRows] = await db.execute(
      sql.raw(`
        SELECT id, source_version, update_available, installed_at
        FROM company_library_items
        WHERE company_id = ${auth.profile.companyId} AND source_item_id = ${id}
        LIMIT 1
      `)
    ) as unknown as [Array<{ id: number; source_version: string; update_available: number; installed_at: string }>, unknown];

    const installed = installedRows?.[0] ?? null;

    return res.json({
      ok: true,
      item,
      installed: installed
        ? {
            companyItemId: installed.id,
            sourceVersion: installed.source_version,
            updateAvailable: Boolean(installed.update_available),
            installedAt: installed.installed_at,
          }
        : null,
    });
  } catch (err) {
    console.error('GET /api/library/items/:id error:', err);
    return res.status(500).json({ error: 'Failed to fetch library item' });
  }
}
