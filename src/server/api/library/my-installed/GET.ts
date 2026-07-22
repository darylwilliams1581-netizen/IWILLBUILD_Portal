/**
 * GET /api/library/my-installed
 *
 * Returns all library items installed by the current company.
 * Includes update_available flag when the source version has changed.
 *
 * Query params:
 *   type     — filter by item type
 *   category — filter by category
 *   search   — title substring search
 *   limit    — default 50, max 200
 *   page     — 1-based, default 1
 *
 * Access: any authenticated user with a company.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../lib/auth-middleware.js';

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  const companyId = auth.profile.companyId;

  try {
    const {
      type, category, search,
      limit: rawLimit = '50',
      page: rawPage = '1',
    } = req.query as Record<string, string>;

    const limit  = Math.min(Math.max(1, parseInt(rawLimit) || 50), 200);
    const page   = Math.max(1, parseInt(rawPage) || 1);
    const offset = (page - 1) * limit;

    const conditions: string[] = [`cli.company_id = ${companyId}`];

    if (type) {
      const safeType = type.replace(/'/g, '').slice(0, 50);
      conditions.push(`cli.type = '${safeType}'`);
    }
    if (category) {
      const safeCat = category.replace(/'/g, '').slice(0, 100);
      conditions.push(`cli.category = '${safeCat}'`);
    }
    if (search && search.trim().length >= 2) {
      const safeSearch = search.replace(/'/g, '').slice(0, 200);
      conditions.push(`cli.title LIKE '%${safeSearch}%'`);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // Count
    const [countRows] = await db.execute(
      sql.raw(`
        SELECT COUNT(*) AS total
        FROM company_library_items cli
        ${whereClause}
      `)
    ) as unknown as [Array<{ total: number }>, unknown];
    const total = Number(countRows?.[0]?.total ?? 0);

    // Items — join source for version comparison
    const [rows] = await db.execute(
      sql.raw(`
        SELECT
          cli.id, cli.source_item_id, cli.type, cli.category, cli.title,
          cli.source_version, cli.update_available,
          cli.installed_by, cli.installed_at, cli.updated_at,
          li.version AS current_source_version,
          li.title   AS source_title,
          li.status  AS source_status
        FROM company_library_items cli
        LEFT JOIN library_items li ON li.id = cli.source_item_id
        ${whereClause}
        ORDER BY cli.updated_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `)
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    return res.json({
      ok: true,
      items: rows ?? [],
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('GET /api/library/my-installed error:', err);
    return res.status(500).json({ error: 'Failed to fetch installed library items' });
  }
}
