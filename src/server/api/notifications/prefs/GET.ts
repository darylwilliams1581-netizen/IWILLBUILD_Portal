/**
 * GET /api/notifications/prefs
 * Returns the current user's notification preferences.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';

export const DEFAULT_PREFS = {
  enabled: true,
  todoOverdue: true,
  todoDueToday: true,
  fleetServiceDue: true,
  fleetRegoDue: true,
  fleetPrestartFlag: true,
  formCompleted: true,
  estimateApproved: true,
  companyBanner: true,
};

export type NotificationPrefs = typeof DEFAULT_PREFS;

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

    let prefs: NotificationPrefs = { ...DEFAULT_PREFS };
    if (profile.notificationPrefs) {
      try {
        prefs = { ...DEFAULT_PREFS, ...JSON.parse(profile.notificationPrefs) };
      } catch { /* use defaults */ }
    }

    res.json({ prefs });
  } catch (error) {
    console.error('GET /api/notifications/prefs error:', error);
    res.status(500).json({ error: 'Failed to load notification preferences' });
  }
}
