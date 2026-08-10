/**
 * GET /api/bug-reports
 * Owner-only. Returns paginated list with optional filters.
 * Query: status, category, search, page, limit
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import { getPlatformOwnerInfo } from '../../lib/platform-owner-guard.js';
import { getSignedUrl } from '../../storage/storage-service.js';

export default async function handler(req: Request, res: Response) {
  try {
    const ownerInfo = await getPlatformOwnerInfo(req);
    if (!ownerInfo) return res.status(401).json({ error: 'Unauthorised' });
    if (!ownerInfo.isPlatformOwner) return res.status(403).json({ error: 'Owner access required.' });

    const status   = (req.query.status   as string) || '';
    const category = (req.query.category as string) || '';
    const search   = (req.query.search   as string) || '';
    const page     = Math.max(1, parseInt(req.query.page   as string) || 1);
    const limit    = Math.min(100, parseInt(req.query.limit as string) || 50);
    const offset   = (page - 1) * limit;

    const conditions: string[] = [];
    if (status)   conditions.push(`br.status = '${status.replace(/'/g, "''")}'`);
    if (category) conditions.push(`br.category = '${category.replace(/'/g, "''")}'`);
    if (search) {
      const s = search.replace(/'/g, "''");
      conditions.push(`(br.description LIKE '%${s}%' OR br.submitted_by_name LIKE '%${s}%' OR br.submitted_by_email LIKE '%${s}%' OR br.page_url LIKE '%${s}%')`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows, countRows] = await Promise.all([
      db.execute(sql.raw(`
        SELECT br.id, br.submitted_by_user_id, br.submitted_by_name, br.submitted_by_email,
               br.company_id, br.category, br.description, br.page_url, br.user_agent,
               br.screenshot_path, br.screenshot_bucket, br.status, br.resolution_note,
               br.resolved_by_name, br.resolved_at,
               br.platform, br.app_version, br.current_route, br.diagnostic_events,
               br.created_at, br.updated_at,
               c.name AS company_name
        FROM bug_reports br
        LEFT JOIN companies c ON c.id = br.company_id
        ${where}
        ORDER BY br.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `)) as unknown as Array<Record<string, unknown>>,
      db.execute(sql.raw(`
        SELECT COUNT(*) AS total FROM bug_reports br ${where}
      `)) as unknown as Array<{ total: number }>,
    ]);

    // Generate signed URLs for screenshots
    const reports = await Promise.all(rows.map(async (r) => {
      let screenshotUrl: string | null = null;
      if (r.screenshot_path && r.screenshot_bucket) {
        try {
          screenshotUrl = await getSignedUrl(
            r.screenshot_path as string,
            r.screenshot_bucket as string,
            3600,
          );
        } catch { /* ignore */ }
      }
      return { ...r, screenshotUrl };
    }));

    // Count by status for badge
    const statusCounts = await db.execute(sql.raw(`
      SELECT status, COUNT(*) AS cnt FROM bug_reports GROUP BY status
    `)) as unknown as Array<{ status: string; cnt: number }>;

    const counts = { open: 0, in_progress: 0, resolved: 0, closed: 0 };
    for (const row of statusCounts) {
      const s = row.status as keyof typeof counts;
      if (s in counts) counts[s] = Number(row.cnt);
    }

    return res.json({
      reports,
      total: Number(countRows[0]?.total ?? 0),
      page,
      limit,
      counts,
    });
  } catch (err) {
    console.error('[bug-reports/GET]', err);
    return res.status(500).json({ error: 'Failed to fetch bug reports.' });
  }
}
