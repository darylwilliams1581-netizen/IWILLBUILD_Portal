/**
 * GET /api/owner-console/library/items
 * Platform owner only. Returns all library items (all statuses/visibilities).
 * Supports ?type=, ?status=, ?search=, ?page=, ?limit= filters.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getPlatformOwnerInfo } from '../../../../lib/platform-owner-guard.js';

export default async function handler(req: Request, res: Response) {
  const info = await getPlatformOwnerInfo(req);
  if (!info) return res.status(401).json({ error: 'Unauthorised' });
  if (!info.isPlatformOwner) return res.status(403).json({ error: 'Platform owner access required' });

  const { type, status, search, page = '1', limit = '50' } = req.query as Record<string, string>;
  const pageNum  = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit) || 50));
  const offset   = (pageNum - 1) * limitNum;

  const where: string[] = [];
  if (type)   where.push(`type = '${type.replace(/'/g, "''")}'`);
  if (status) where.push(`status = '${status.replace(/'/g, "''")}'`);
  if (search) {
    const s = search.replace(/'/g, "''");
    where.push(`(title LIKE '%${s}%' OR summary LIKE '%${s}%' OR tags LIKE '%${s}%')`);
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  try {
    const [rows] = await db.execute(sql.raw(
      `SELECT id, type, category, title, summary, tags, discipline, version,
              status, visibility, install_count, download_count,
              source_file_name, file_path,
              created_at, updated_at
       FROM library_items
       ${whereClause}
       ORDER BY updated_at DESC
       LIMIT ${limitNum} OFFSET ${offset}`
    )) as unknown as [Array<Record<string, unknown>>, unknown];

    const [countRows] = await db.execute(sql.raw(
      `SELECT COUNT(*) AS total FROM library_items ${whereClause}`
    )) as unknown as [Array<{ total: number }>, unknown];

    return res.json({
      ok: true,
      items: rows ?? [],
      total: Number(countRows?.[0]?.total ?? 0),
      page: pageNum,
      limit: limitNum,
    });
  } catch (err) {
    console.error('GET /api/owner-console/library/items error:', err);
    return res.status(500).json({ error: 'Failed to load library items' });
  }
}
