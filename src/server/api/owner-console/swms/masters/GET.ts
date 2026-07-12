/**
 * GET /api/owner-console/swms/masters
 * Returns all platform master SWMS templates (is_platform_master = 1).
 * Platform owner only.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../lib/auth-middleware.js';

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  const [ownerCheck] = await db.execute(sql.raw(
    `SELECT role FROM profiles WHERE user_id = '${auth.session.user.id}' LIMIT 1`
  )) as unknown as [Array<{ role: string }>, unknown];

  if (ownerCheck?.[0]?.role !== 'platform_owner') {
    return res.status(403).json({ error: 'Platform owner access required' });
  }

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
