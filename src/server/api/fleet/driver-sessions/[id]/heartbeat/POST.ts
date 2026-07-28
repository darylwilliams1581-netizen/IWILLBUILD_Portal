/**
 * POST /api/fleet/driver-sessions/:id/heartbeat
 *
 * Lightweight status ping from the driver app.
 * Stores the driver's current location permission status and GPS fix status
 * so the office Fleet view can show meaningful status instead of "No GPS yet".
 *
 * Body: {
 *   locationPermissionStatus: 'granted' | 'prompt' | 'denied' | 'unavailable' | 'unknown';
 *   gpsStatus: 'live' | 'waiting_permission' | 'denied' | 'unavailable' | 'waiting_fix' | 'stale';
 * }
 *
 * Called by the driver app:
 *  - On session start
 *  - Whenever permission status changes
 *  - Every 30s while session is active (same cadence as session refresh)
 *  - Even when GPS is denied — so office can see "denied" rather than silence
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../../lib/auth-middleware.js';

const VALID_PERMISSION_STATUSES = new Set(['granted', 'prompt', 'denied', 'unavailable', 'unknown']);
const VALID_GPS_STATUSES = new Set(['live', 'waiting_permission', 'denied', 'unavailable', 'waiting_fix', 'stale']);

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  const sessionId = parseInt(req.params.id, 10);
  if (isNaN(sessionId)) return res.status(400).json({ error: 'Invalid session id' });

  const companyId = auth.profile.companyId;
  const userId    = auth.session.user.id;

  const { locationPermissionStatus, gpsStatus } = req.body as {
    locationPermissionStatus?: string;
    gpsStatus?: string;
  };

  // Validate — accept unknown values gracefully (store as 'unknown' / 'waiting_fix')
  const permStatus = VALID_PERMISSION_STATUSES.has(locationPermissionStatus ?? '')
    ? locationPermissionStatus!
    : 'unknown';
  const gpsStatusVal = VALID_GPS_STATUSES.has(gpsStatus ?? '')
    ? gpsStatus!
    : 'waiting_fix';

  try {
    // Verify session belongs to this user + company and is still active
    const [sessionRows] = await db.execute(
      sql`SELECT id, status FROM fleet_driver_sessions
          WHERE id = ${sessionId}
            AND company_id = ${companyId}
            AND user_id = ${userId}
          LIMIT 1`
    ) as unknown as [Array<{ id: number; status: string }>, unknown];

    if (!sessionRows?.length) return res.status(404).json({ error: 'Session not found' });
    if (sessionRows[0].status !== 'active') {
      return res.status(400).json({ error: 'Session is no longer active' });
    }

    await db.execute(sql.raw(`
      UPDATE fleet_driver_sessions
      SET
        location_permission_status = '${permStatus}',
        gps_status                 = '${gpsStatusVal}',
        last_heartbeat_at          = NOW()
      WHERE id = ${sessionId}
        AND company_id = ${companyId}
        AND user_id = '${userId}'
    `));

    return res.json({ ok: true, locationPermissionStatus: permStatus, gpsStatus: gpsStatusVal });
  } catch (err) {
    console.error('POST /api/fleet/driver-sessions/:id/heartbeat error:', err);
    return res.status(500).json({ error: 'Failed to store heartbeat' });
  }
}
