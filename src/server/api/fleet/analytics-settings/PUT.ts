/**
 * PUT /api/fleet/analytics-settings
 * Upserts the company's fleet analytics toggle settings.
 * Requires admin or owner role.
 *
 * Body: Partial<FleetAnalyticsSettings>
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../lib/auth-middleware.js';

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  if (auth.profile.role !== 'owner' && auth.profile.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const companyId = auth.profile.companyId;
  const body = req.body as Record<string, unknown>;

  // Coerce booleans safely
  function bool(v: unknown, fallback: boolean): number {
    if (v === undefined || v === null) return fallback ? 1 : 0;
    return v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0;
  }
  function num(v: unknown, fallback: number): number {
    const n = parseInt(String(v ?? fallback), 10);
    return isNaN(n) ? fallback : Math.max(1, Math.min(300, n));
  }

  const trackDistance        = bool(body.track_distance, true);
  const trackDriveTime       = bool(body.track_drive_time, true);
  const trackSpeed           = bool(body.track_speed, true);
  const enableSpeedingAlerts = bool(body.enable_speeding_alerts, false);
  const speedingThreshold    = num(body.speeding_threshold_kmh, 110);
  const enableCollision      = bool(body.enable_collision_alerts, false);

  try {
    await db.execute(sql`
      INSERT INTO fleet_analytics_settings
        (company_id, track_distance, track_drive_time, track_speed,
         enable_speeding_alerts, speeding_threshold_kmh, enable_collision_alerts)
      VALUES
        (${companyId}, ${trackDistance}, ${trackDriveTime}, ${trackSpeed},
         ${enableSpeedingAlerts}, ${speedingThreshold}, ${enableCollision})
      ON DUPLICATE KEY UPDATE
        track_distance          = VALUES(track_distance),
        track_drive_time        = VALUES(track_drive_time),
        track_speed             = VALUES(track_speed),
        enable_speeding_alerts  = VALUES(enable_speeding_alerts),
        speeding_threshold_kmh  = VALUES(speeding_threshold_kmh),
        enable_collision_alerts = VALUES(enable_collision_alerts)
    `);

    return res.json({ ok: true });
  } catch (err) {
    console.error('PUT /api/fleet/analytics-settings error:', err);
    return res.status(500).json({ error: 'Failed to save analytics settings' });
  }
}
