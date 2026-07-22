/**
 * GET /api/fleet/driver-sessions/live
 *
 * Returns all currently active driving sessions for the company,
 * each with the driver's latest GPS telemetry point.
 * Admin / owner / manager only.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../lib/auth-middleware.js';

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  const { profile } = auth;
  const companyId = profile.companyId;

  // Only admin/owner/manager can see all drivers on the map
  const role = profile.role ?? '';
  const allowed = ['owner', 'admin', 'manager', 'platform_owner'];
  if (!allowed.includes(role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  try {
    // Auto-expire stale sessions:
    // - Sessions with no telemetry that started more than 2 hours ago
    // - Sessions whose last telemetry ping is more than 4 hours old
    await db.execute(sql.raw(`
      UPDATE fleet_driver_sessions
      SET status = 'completed', end_at = NOW()
      WHERE company_id = ${companyId}
        AND status = 'active'
        AND (
          -- No GPS ever received and session is older than 2 hours
          (
            NOT EXISTS (
              SELECT 1 FROM fleet_session_telemetry
              WHERE session_id = fleet_driver_sessions.id
            )
            AND start_at < NOW() - INTERVAL 2 HOUR
          )
          OR
          -- Last GPS ping is older than 4 hours
          (
            EXISTS (
              SELECT 1 FROM fleet_session_telemetry
              WHERE session_id = fleet_driver_sessions.id
            )
            AND (
              SELECT MAX(recorded_at) FROM fleet_session_telemetry
              WHERE session_id = fleet_driver_sessions.id
            ) < NOW() - INTERVAL 4 HOUR
          )
        )
    `));

    // Get all active sessions with their latest telemetry point
    const [rows] = await db.execute(sql.raw(`
      SELECT
        fds.id            AS session_id,
        fds.fleet_asset_id,
        fds.driver_name,
        fds.start_at,
        fds.status,
        fa.name           AS asset_name,
        fa.type           AS asset_type,
        fa.rego,
        t.lat,
        t.lng,
        t.speed_kmh,
        t.heading,
        t.recorded_at     AS last_seen_at
      FROM fleet_driver_sessions fds
      JOIN fleet_assets fa ON fa.id = fds.fleet_asset_id
      LEFT JOIN fleet_session_telemetry t
        ON t.id = (
          SELECT id FROM fleet_session_telemetry
          WHERE session_id = fds.id
          ORDER BY recorded_at DESC
          LIMIT 1
        )
      WHERE fds.company_id = ${companyId}
        AND fds.status = 'active'
      ORDER BY fds.start_at DESC
    `)) as unknown as [Array<Record<string, unknown>>, unknown];

    return res.json({ sessions: rows ?? [] });
  } catch (err) {
    console.error('GET /api/fleet/driver-sessions/live error:', err);
    return res.status(500).json({ error: 'Failed to fetch live sessions' });
  }
}
