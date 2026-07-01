/**
 * POST /api/fleet/driver-sessions/:id/stop
 * Stop a driving session. User can stop their own; admin/owner can stop any.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { profiles } from '../../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';

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

    const sessionId = parseInt(req.params.id, 10);
    if (isNaN(sessionId)) return res.status(400).json({ error: 'Invalid session id' });

    const isAdminOrOwner = profile.role === 'admin' || profile.role === 'owner';

    // Fetch the session
    const [rows] = await db.execute(
      sql`SELECT id, user_id, status, fleet_asset_id FROM fleet_driver_sessions
          WHERE id = ${sessionId} AND company_id = ${profile.companyId}`
    ) as unknown as [Array<{ id: number; user_id: string; status: string; fleet_asset_id: number }>, unknown];

    if (!rows.length) return res.status(404).json({ error: 'Session not found' });
    const ds = rows[0];

    if (ds.user_id !== betterSession.user.id && !isAdminOrOwner) {
      return res.status(403).json({ error: 'You can only stop your own driving session' });
    }

    if (ds.status !== 'active') {
      return res.status(400).json({ error: 'Session is already completed' });
    }

    await db.execute(
      sql`UPDATE fleet_driver_sessions SET status = 'completed', end_at = NOW(), updated_at = NOW()
          WHERE id = ${sessionId} AND company_id = ${profile.companyId}`
    );

    res.json({ ok: true });
  } catch (error) {
    console.error('POST /api/fleet/driver-sessions/:id/stop error:', error);
    res.status(500).json({ error: 'Failed to stop driving session' });
  }
}
