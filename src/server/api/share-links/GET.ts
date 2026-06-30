/**
 * GET /api/share-links
 * List all secure share links for the authenticated company.
 * Supports ?targetType=&targetId= filters.
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';
import { profiles } from '../../db/schema.js';
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

    const { targetType, targetId } = req.query as Record<string, string>;

    const [rows] = await db.execute(sql`
      SELECT
        sl.id, sl.link_type, sl.target_type, sl.target_id, sl.title,
        sl.permissions_json, sl.metadata_json,
        sl.expires_at, sl.max_uses, sl.use_count, sl.revoked,
        sl.created_at, sl.updated_at,
        p.name AS created_by_name,
        (SELECT COUNT(*) FROM secure_share_events e WHERE e.share_link_id = sl.id) AS event_count
      FROM secure_share_links sl
      LEFT JOIN profiles p ON p.user_id = sl.created_by_user_id
      WHERE sl.company_id = ${profile.companyId}
        ${targetType ? sql`AND sl.target_type = ${targetType}` : sql``}
        ${targetId   ? sql`AND sl.target_id   = ${targetId}`   : sql``}
      ORDER BY sl.created_at DESC
      LIMIT 200
    `) as unknown as [unknown[]];

    return res.json({ links: rows });
  } catch (err) {
    console.error('GET /api/share-links error:', err);
    return res.status(500).json({ error: 'Failed to load share links' });
  }
}
