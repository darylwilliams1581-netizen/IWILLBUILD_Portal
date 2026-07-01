/**
 * GET /api/fleet/driver-sessions/active
 * Returns the current user's active driving session (if any).
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const betterSession = await auth.api.getSession({ headers });
    if (!betterSession?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, betterSession.user.id),
    });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const [rows] = await db.execute(
      sql`SELECT fds.id, fds.fleet_asset_id, fds.driver_name, fds.start_at, fds.status, fds.source,
                 fa.name as asset_name, fa.type as asset_type, fa.rego
          FROM fleet_driver_sessions fds
          JOIN fleet_assets fa ON fa.id = fds.fleet_asset_id
          WHERE fds.company_id = ${profile.companyId}
            AND fds.user_id = ${betterSession.user.id}
            AND fds.status = 'active'
          ORDER BY fds.start_at DESC LIMIT 1`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    res.json({ session: rows[0] ?? null });
  } catch (error) {
    console.error('GET /api/fleet/driver-sessions/active error:', error);
    res.status(500).json({ error: 'Failed to fetch active session' });
  }
}
