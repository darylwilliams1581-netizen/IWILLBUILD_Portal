/**
 * PUT /api/notifications/prefs
 * Saves the current user's notification preferences.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { DEFAULT_PREFS, type NotificationPrefs } from './GET.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, session.user.id),
    });
    if (!profile) return res.status(403).json({ error: 'No profile' });

    const incoming = req.body as Partial<NotificationPrefs>;
    const merged: NotificationPrefs = { ...DEFAULT_PREFS, ...incoming };

    await db.update(profiles)
      .set({ notificationPrefs: JSON.stringify(merged) })
      .where(eq(profiles.id, profile.id));

    res.json({ ok: true, prefs: merged });
  } catch (error) {
    console.error('PUT /api/notifications/prefs error:', error);
    res.status(500).json({ error: 'Failed to save notification preferences' });
  }
}
