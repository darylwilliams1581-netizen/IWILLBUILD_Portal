/**
 * DELETE /api/push/subscribe
 * ─────────────────────────────────────────────────────────────────────────────
 * Revoke a push subscription for the current user.
 * Body: { endpoint }
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { getAuth } from '../../../../lib/auth/auth.js';
import { sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const { endpoint } = req.body as { endpoint?: string };
    if (!endpoint) return res.status(400).json({ error: 'endpoint is required' });

    await db.execute(sql`
      UPDATE push_subscriptions
      SET revoked = 1, updated_at = NOW()
      WHERE user_id = ${session.user.id}
        AND endpoint = ${endpoint}
    `);

    return res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/push/subscribe error:', err);
    return res.status(500).json({ error: 'Failed to revoke subscription' });
  }
}
