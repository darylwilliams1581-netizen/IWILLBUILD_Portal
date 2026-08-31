/**
 * GET /api/library/my-installed/:id
 *
 * Returns a single company_library_items row (including full content)
 * for the current company. Used by the edit modal to pre-populate fields.
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

  const companyId = auth.profile.companyId;

  try {
    const [rows] = await db.execute(
      sql.raw(`
        SELECT
          cli.id, cli.source_item_id, cli.type, cli.category, cli.title,
          cli.content, cli.metadata_json,
          cli.source_version, cli.update_available,
          cli.installed_at, cli.updated_at,
          li.title AS source_title,
          li.summary AS source_summary
        FROM company_library_items cli
        LEFT JOIN library_items li ON li.id = cli.source_item_id
        WHERE cli.id = ${id} AND cli.company_id = ${companyId}
        LIMIT 1
      `)
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    const item = rows?.[0];
    if (!item) return res.status(404).json({ error: 'Installed item not found.' });

    return res.json({ ok: true, item });
  } catch (err) {
    console.error('GET /api/library/my-installed/:id error:', err);
    return res.status(500).json({ error: 'Failed to fetch installed item' });
  }
}
