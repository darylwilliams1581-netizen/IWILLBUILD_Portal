/**
 * GET /api/fleet/analytics-settings
 * Returns the company's fleet analytics toggle settings.
 * If no row exists yet, returns the defaults (all tracking on, alerts off).
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../lib/auth-middleware.js';

export interface FleetAnalyticsSettings {
  track_distance: boolean;
  track_drive_time: boolean;
  track_speed: boolean;
  enable_speeding_alerts: boolean;
  speeding_threshold_kmh: number;
  enable_collision_alerts: boolean;
}

const DEFAULTS: FleetAnalyticsSettings = {
  track_distance: true,
  track_drive_time: true,
  track_speed: true,
  enable_speeding_alerts: false,
  speeding_threshold_kmh: 110,
  enable_collision_alerts: false,
};

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  const companyId = auth.profile.companyId;

  try {
    const [rows] = await db.execute(
      sql`SELECT track_distance, track_drive_time, track_speed,
                 enable_speeding_alerts, speeding_threshold_kmh, enable_collision_alerts
          FROM fleet_analytics_settings
          WHERE company_id = ${companyId}
          LIMIT 1`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    if (!rows.length) {
      return res.json({ ok: true, settings: DEFAULTS });
    }

    const r = rows[0];
    return res.json({
      ok: true,
      settings: {
        track_distance:          !!r.track_distance,
        track_drive_time:        !!r.track_drive_time,
        track_speed:             !!r.track_speed,
        enable_speeding_alerts:  !!r.enable_speeding_alerts,
        speeding_threshold_kmh:  Number(r.speeding_threshold_kmh ?? 110),
        enable_collision_alerts: !!r.enable_collision_alerts,
      } satisfies FleetAnalyticsSettings,
    });
  } catch (err) {
    console.error('GET /api/fleet/analytics-settings error:', err);
    return res.status(500).json({ error: 'Failed to fetch analytics settings' });
  }
}
