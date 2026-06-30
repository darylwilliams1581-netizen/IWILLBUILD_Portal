/**
 * GET /api/share-links/:id/events
 * Audit log for a specific share link.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { profiles } from '../../../../db/schema.js';
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

    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

    // Verify ownership
    const [check] = await db.execute(sql`
      SELECT id FROM secure_share_links
      WHERE id = ${id} AND company_id = ${profile.companyId}
      LIMIT 1
    `) as unknown as [Array<{ id: number }>];
    if (!check.length) return res.status(404).json({ error: 'Not found' });

    const [rows] = await db.execute(sql`
      SELECT id, event_type, ip_address, user_agent, file_id, created_at
      FROM secure_share_events
      WHERE share_link_id = ${id}
      ORDER BY created_at DESC
      LIMIT 100
    `) as unknown as [unknown[]];

    return res.json({ events: rows });
  } catch (err) {
    console.error('GET /api/share-links/:id/events error:', err);
    return res.status(500).json({ error: 'Failed to load events' });
  }
}
