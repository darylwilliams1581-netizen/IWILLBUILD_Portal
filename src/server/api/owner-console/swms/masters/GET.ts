/**
 * GET /api/owner-console/swms/masters
 * Returns all platform master SWMS templates (is_platform_master = 1).
 * Platform owner only.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getPlatformOwnerInfo } from '../../../../lib/platform-owner-guard.js';

export default async function handler(req: Request, res: Response) {
  const info = await getPlatformOwnerInfo(req);
  if (!info) return res.status(401).json({ error: 'Unauthorised' });
  if (!info.isPlatformOwner) return res.status(403).json({ error: 'Platform owner access required' });

  try {
    const [rows] = await db.execute(sql.raw(
      `SELECT id, title, category, build_mode, document_type, status,
              revision_number, review_date, author_name, approved_by_name,
              is_platform_master, created_at, updated_at
       FROM swms_templates
       WHERE is_platform_master = 1
       ORDER BY title ASC`
    )) as unknown as [Array<Record<string, unknown>>, unknown];

    return res.json({ masters: rows ?? [] });
  } catch (err) {
    console.error('GET /api/owner-console/swms/masters error:', err);
    return res.status(500).json({ error: String(err) });
  }
}
