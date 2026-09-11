/**
 * DELETE /api/risk-register/:id/share-token
 * Revoke all active share tokens for a hazard entry.
 * After revocation the public link returns 410 Gone.
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

    await db.execute(sql`
      UPDATE hazard_share_tokens
      SET revoked = 1
      WHERE hazard_id = ${entryId} AND company_id = ${profile.companyId}
    `);

    return res.json({ ok: true });
  } catch (err) {
    console.error('[hazard share-token DELETE] error:', err);
    return res.status(500).json({ error: 'Failed to revoke share link' });
  }
}
