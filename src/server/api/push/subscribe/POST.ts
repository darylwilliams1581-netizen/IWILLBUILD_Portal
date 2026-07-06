/**
 * POST /api/push/subscribe
 * ─────────────────────────────────────────────────────────────────────────────
 * Save a browser PushSubscription for the current user.
 * Body: { endpoint, keys: { p256dh, auth } }
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
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

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const { endpoint, keys } = req.body as {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    };

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: 'endpoint and keys (p256dh, auth) are required' });
    }

    // Upsert — same endpoint may re-subscribe after key rotation
    await db.execute(sql`
      INSERT INTO push_subscriptions
        (user_id, company_id, endpoint, p256dh, auth, revoked, created_at, updated_at)
      VALUES
        (${session.user.id}, ${profile.companyId}, ${endpoint}, ${keys.p256dh}, ${keys.auth}, 0, NOW(), NOW())
      ON DUPLICATE KEY UPDATE
        p256dh = VALUES(p256dh),
        auth = VALUES(auth),
        revoked = 0,
        updated_at = NOW()
    `);

    return res.status(201).json({ ok: true });
  } catch (err) {
    console.error('POST /api/push/subscribe error:', err);
    return res.status(500).json({ error: 'Failed to save subscription' });
  }
}
