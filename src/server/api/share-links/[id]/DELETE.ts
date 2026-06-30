/**
 * DELETE /api/share-links/:id
 * Revoke a secure share link (soft-delete — sets revoked=1).
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { profiles } from '../../../db/schema.js';
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
    const [rows] = await db.execute(sql`
      SELECT id FROM secure_share_links
      WHERE id = ${id} AND company_id = ${profile.companyId}
      LIMIT 1
    `) as unknown as [Array<{ id: number }>];

    if (!rows.length) return res.status(404).json({ error: 'Not found' });

    await db.execute(sql`
      UPDATE secure_share_links SET revoked = 1, updated_at = NOW()
      WHERE id = ${id}
    `);

    await db.execute(sql`
      INSERT INTO secure_share_events
        (share_link_id, company_id, event_type, ip_address, user_agent)
      VALUES
        (${id}, ${profile.companyId}, 'revoked',
         ${req.ip ?? null}, ${req.headers['user-agent']?.slice(0, 500) ?? null})
    `);

    return res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/share-links/:id error:', err);
    return res.status(500).json({ error: 'Failed to revoke link' });
  }
}
