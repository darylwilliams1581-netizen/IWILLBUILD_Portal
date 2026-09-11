/**
 * GET /api/risk-register/:id/public-comments
 * Returns public comments submitted via the share link for a hazard entry.
 * Authenticated — company-scoped.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';

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

    const entryId = parseInt(String(req.params.id), 10);
    if (isNaN(entryId) || entryId <= 0) return res.status(400).json({ error: 'Invalid ID' });

    const [rows] = await db.execute(sql`
      SELECT id, commenter_name, comment, action_taken, previous_status, new_status, created_at
      FROM hazard_public_comments
      WHERE hazard_id = ${entryId} AND company_id = ${profile.companyId}
      ORDER BY created_at ASC
    `) as unknown as [Array<Record<string, unknown>>];

    return res.json({ comments: rows ?? [] });
  } catch (err) {
    console.error('[hazard public-comments GET] error:', err);
    return res.status(500).json({ error: 'Failed to load comments' });
  }
}
