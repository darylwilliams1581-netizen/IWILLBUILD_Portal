/**
 * POST /api/active-ping
 * Called periodically by the frontend to update last_active_at.
 * Lightweight — no response body needed.
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { profiles } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).end();

    await db
      .update(profiles)
      .set({ lastActiveAt: new Date() })
      .where(eq(profiles.userId, session.user.id));

    res.status(204).end();
  } catch {
    // Silent — don't break the app over a ping failure
    res.status(204).end();
  }
}
