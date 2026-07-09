/**
 * GET /api/library/items
 *
 * Server-side paginated, filtered list of global library source items.
 * Returns summaries only — no full content payload.
 *
 * Query params:
 *   type        — filter by item type (policy|procedure|swms|form|recipe|estimate_recipe|scope_line)
 *   category    — filter by category string
 *   tag         — filter by tag (substring match in tags column)
 *   discipline  — filter by discipline
 *   search      — full-text search on title/summary/tags
 *   status      — default 'active'
 *   limit       — default 20, max 100
 *   page        — 1-based, default 1
 *
 * Access: any authenticated user with a company.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../lib/auth-middleware.js';

const ALLOWED_TYPES = new Set([
  'policy', 'procedure', 'swms', 'form', 'recipe', 'estimate_recipe', 'scope_line',
]);

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  try {
    const {
      type, category, tag, discipline, search,
      status = 'active',
      limit: rawLimit = '20',
      page: rawPage = '1',
    } = req.query as Record<string, string>;

    const limit = Math.min(Math.max(1, parseInt(rawLimit) || 20), 100);
    const page  = Math.max(1, parseInt(rawPage) || 1);
    const offset = (page - 1) * limit;

    // ── Build WHERE clauses ───────────────────────────────────────────────────
    const conditions: string[] = [
      `visibility = 'public'`,
      `status = ${db.execute ? `'${status.replace(/'/g, '')}'` : "'active'"}`,
    ];

    // Safely escape status (only allow known values)
    const safeStatus = ['active', 'draft', 'archived'].includes(status) ? status : 'active';
    conditions[1] = `status = '${safeStatus}'`;

    if (type && ALLOWED_TYPES.has(type)) {
      conditions.push(`type = '${type}'`);
    }
    if (category) {
      const safeCategory = category.replace(/'/g, '').slice(0, 100);
      conditions.push(`category = '${safeCategory}'`);
    }
    if (discipline) {
      const safeDiscipline = discipline.replace(/'/g, '').slice(0, 100);
      conditions.push(`discipline = '${safeDiscipline}'`);
    }
    if (tag) {
      const safeTag = tag.replace(/'/g, '').slice(0, 100);
      conditions.push(`tags LIKE '%${safeTag}%'`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // ── Full-text search (if provided) ────────────────────────────────────────
    let searchClause = '';
    let orderClause = 'ORDER BY install_count DESC, updated_at DESC';
    if (search && search.trim().length >= 2) {
      const safeSearch = search.replace(/['"\\]/g, '').slice(0, 200);
      searchClause = `AND MATCH(title, summary, tags) AGAINST('${safeSearch}' IN BOOLEAN MODE)`;
      orderClause = `ORDER BY MATCH(title, summary, tags) AGAINST('${safeSearch}' IN BOOLEAN MODE) DESC, install_count DESC`;
    }

    const fullWhere = whereClause
      ? `${whereClause} ${searchClause}`
      : searchClause ? `WHERE ${searchClause.replace(/^AND /, '')}` : '';

    // ── Count ─────────────────────────────────────────────────────────────────
    const [countRows] = await db.execute(
      sql.raw(`SELECT COUNT(*) AS total FROM library_items ${fullWhere}`)
    ) as unknown as [Array<{ total: number }>, unknown];
    const total = Number(countRows?.[0]?.total ?? 0);

    // ── Items (summary only — no content column) ──────────────────────────────
    const [rows] = await db.execute(
      sql.raw(`
        SELECT
          id, type, category, title, summary, tags, discipline,
          version, status, visibility,
          install_count, download_count,
          ROUND(CASE WHEN rating_count > 0 THEN rating_sum / rating_count ELSE 0 END, 1) AS avg_rating,
          rating_count,
          source_file_name,
          CASE WHEN file_path IS NOT NULL THEN 1 ELSE 0 END AS has_file,
          created_at, updated_at
        FROM library_items
        ${fullWhere}
        ${orderClause}
        LIMIT ${limit} OFFSET ${offset}
      `)
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    return res.json({
      ok: true,
      items: rows ?? [],
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('GET /api/library/items error:', err);
    return res.status(500).json({ error: 'Failed to fetch library items' });
  }
}
