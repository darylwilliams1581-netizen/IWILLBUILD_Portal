/**
 * POST /api/notifications/read
 * Mark one or all alerts as read. Persists read IDs in the user's profile.
 *
 * Body: { alertId: string }  — mark single alert as read
 *    OR { markAll: true }    — mark all current alerts as read
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { DEFAULT_PREFS } from '../prefs/GET.js';

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

    const { alertId, markAll, allIds } = req.body as {
      alertId?: string;
      markAll?: boolean;
      allIds?: string[];
    };

    // Parse existing prefs + readIds
    let stored: Record<string, unknown> = { ...DEFAULT_PREFS };
    if (profile.notificationPrefs) {
      try { stored = JSON.parse(profile.notificationPrefs) as Record<string, unknown>; } catch { /* ignore */ }
    }

    const readIds: Set<string> = new Set(
      Array.isArray(stored.readIds) ? (stored.readIds as string[]) : []
    );

    if (markAll && Array.isArray(allIds)) {
      for (const id of allIds) readIds.add(id);
    } else if (alertId) {
      readIds.add(alertId);
    }

    // Keep readIds capped at 500 to avoid unbounded growth
    const trimmed = [...readIds].slice(-500);

    const updated = { ...stored, readIds: trimmed };
    await db.update(profiles)
      .set({ notificationPrefs: JSON.stringify(updated) })
      .where(eq(profiles.id, profile.id));

    res.json({ ok: true });
  } catch (error) {
    console.error('POST /api/notifications/read error:', error);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
}
