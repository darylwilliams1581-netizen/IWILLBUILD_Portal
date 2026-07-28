/**
 * GET /api/fleet/last-known-positions
 *
 * Returns the most recent GPS telemetry point for each fleet asset,
 * sourced from any session (not just active ones).
 * Used by the Fleet Live Map as a fallback when no drivers are currently active.
 *
 * Admin / owner / manager only.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../lib/auth-middleware.js';

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  const { profile } = auth;
  const companyId = profile.companyId;

  const role = profile.role ?? '';
  const allowed = ['owner', 'admin', 'manager', 'platform_owner'];
  if (!allowed.includes(role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  try {
    // For each fleet asset belonging to this company, find the single most
    // recent telemetry point across all sessions (active or completed).
    const [rows] = await db.execute(sql.raw(`
      SELECT
        fa.id                   AS asset_id,
        fa.name                 AS asset_name,
        fa.type                 AS asset_type,
        fa.rego,
        t.lat,
        t.lng,
        t.speed_kmh,
        t.recorded_at           AS last_seen_at,
        fds.driver_name         AS last_driver_name,
        fds.start_at            AS last_session_start
      FROM fleet_assets fa
      JOIN fleet_driver_sessions fds
        ON fds.id = (
          SELECT s2.id
          FROM fleet_driver_sessions s2
          WHERE s2.fleet_asset_id = fa.id
            AND s2.company_id = ${companyId}
          ORDER BY s2.start_at DESC
          LIMIT 1
        )
      JOIN fleet_session_telemetry t
        ON t.id = (
          SELECT t2.id
          FROM fleet_session_telemetry t2
          WHERE t2.session_id = fds.id
          ORDER BY t2.recorded_at DESC
          LIMIT 1
        )
      WHERE fa.company_id = ${companyId}
        AND fa.status = 'active'
      ORDER BY t.recorded_at DESC
    `)) as unknown as [Array<Record<string, unknown>>, unknown];

    return res.json({ positions: rows ?? [] });
  } catch (err) {
    console.error('GET /api/fleet/last-known-positions error:', err);
    return res.status(500).json({ error: 'Failed to fetch last known positions' });
  }
}
