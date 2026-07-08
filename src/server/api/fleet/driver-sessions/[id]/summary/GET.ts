/**
 * GET /api/fleet/driver-sessions/:id/summary
 *
 * Returns the analytics summary for a completed (or active) driving session.
 * If the session is completed and summary_computed_at is set, returns stored values.
 * If the session is active or summary not yet computed, computes on-the-fly from telemetry.
 *
 * Returns:
 * {
 *   ok: true,
 *   session: { id, asset_name, driver_name, start_at, end_at, status },
 *   summary: {
 *     drive_time_seconds: number | null,
 *     total_distance_km: number | null,
 *     avg_speed_kmh: number | null,
 *     max_speed_kmh: number | null,
 *     collision_count: number,
 *     settings: FleetAnalyticsSettings,
 *   }
 * }
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../../lib/auth-middleware.js';

/** Haversine distance in km between two lat/lng points */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  const sessionId = parseInt(req.params.id, 10);
  if (isNaN(sessionId)) return res.status(400).json({ error: 'Invalid session id' });

  const companyId = auth.profile.companyId;
  const userId    = auth.session.user.id;
  const isAdmin   = auth.profile.role === 'admin' || auth.profile.role === 'owner';

  try {
    // Fetch session — user can see their own; admin can see any
    const [sessionRows] = await db.execute(
      sql`SELECT fds.id, fds.user_id, fds.driver_name, fds.start_at, fds.end_at, fds.status,
                 fds.total_distance_km, fds.active_drive_seconds,
                 fds.avg_speed_kmh, fds.max_speed_kmh, fds.collision_count,
                 fds.summary_computed_at,
                 fa.name AS asset_name, fa.rego
          FROM fleet_driver_sessions fds
          JOIN fleet_assets fa ON fa.id = fds.fleet_asset_id
          WHERE fds.id = ${sessionId} AND fds.company_id = ${companyId}
          LIMIT 1`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    if (!sessionRows.length) return res.status(404).json({ error: 'Session not found' });
    const ds = sessionRows[0];

    if (ds.user_id !== userId && !isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Fetch analytics settings
    const [settingsRows] = await db.execute(
      sql`SELECT track_distance, track_drive_time, track_speed,
                 enable_speeding_alerts, speeding_threshold_kmh, enable_collision_alerts
          FROM fleet_analytics_settings
          WHERE company_id = ${companyId}
          LIMIT 1`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    const sr = settingsRows[0] ?? {};
    const settings = {
      track_distance:          sr.track_distance          !== undefined ? !!sr.track_distance          : true,
      track_drive_time:        sr.track_drive_time        !== undefined ? !!sr.track_drive_time        : true,
      track_speed:             sr.track_speed             !== undefined ? !!sr.track_speed             : true,
      enable_speeding_alerts:  sr.enable_speeding_alerts  !== undefined ? !!sr.enable_speeding_alerts  : false,
      speeding_threshold_kmh:  Number(sr.speeding_threshold_kmh ?? 110),
      enable_collision_alerts: sr.enable_collision_alerts !== undefined ? !!sr.enable_collision_alerts : false,
    };

    // If summary already computed and stored, return it directly
    if (ds.summary_computed_at && ds.status === 'completed') {
      return res.json({
        ok: true,
        session: {
          id:          ds.id,
          asset_name:  ds.asset_name,
          driver_name: ds.driver_name,
          start_at:    ds.start_at,
          end_at:      ds.end_at,
          status:      ds.status,
        },
        summary: {
          drive_time_seconds: settings.track_drive_time ? Number(ds.active_drive_seconds ?? null) : null,
          total_distance_km:  settings.track_distance   ? Number(ds.total_distance_km ?? null)    : null,
          avg_speed_kmh:      settings.track_speed      ? Number(ds.avg_speed_kmh ?? null)        : null,
          max_speed_kmh:      settings.track_speed      ? Number(ds.max_speed_kmh ?? null)        : null,
          collision_count:    Number(ds.collision_count ?? 0),
          settings,
        },
      });
    }

    // Compute on-the-fly from telemetry points
    const [telRows] = await db.execute(
      sql`SELECT lat, lng, speed_kmh, recorded_at, is_collision
          FROM fleet_session_telemetry
          WHERE session_id = ${sessionId} AND company_id = ${companyId}
          ORDER BY recorded_at ASC`
    ) as unknown as [Array<{
      lat: string; lng: string; speed_kmh: string | null;
      recorded_at: string; is_collision: number;
    }>, unknown];

    const pts = telRows ?? [];

    let totalDistanceKm = 0;
    let maxSpeedKmh     = 0;
    let speedSum        = 0;
    let speedCount      = 0;
    let collisionCount  = 0;

    for (let i = 0; i < pts.length; i++) {
      const pt = pts[i];
      if (pt.is_collision) collisionCount++;

      if (pt.speed_kmh !== null) {
        const s = parseFloat(String(pt.speed_kmh));
        if (!isNaN(s)) {
          speedSum += s;
          speedCount++;
          if (s > maxSpeedKmh) maxSpeedKmh = s;
        }
      }

      if (i > 0) {
        const prev = pts[i - 1];
        totalDistanceKm += haversineKm(
          parseFloat(String(prev.lat)), parseFloat(String(prev.lng)),
          parseFloat(String(pt.lat)),  parseFloat(String(pt.lng)),
        );
      }
    }

    // Drive time: from session start to end (or now if still active)
    const startMs = new Date(String(ds.start_at)).getTime();
    const endMs   = ds.end_at ? new Date(String(ds.end_at)).getTime() : Date.now();
    const driveTimeSec = Math.round((endMs - startMs) / 1000);

    return res.json({
      ok: true,
      session: {
        id:          ds.id,
        asset_name:  ds.asset_name,
        driver_name: ds.driver_name,
        start_at:    ds.start_at,
        end_at:      ds.end_at,
        status:      ds.status,
      },
      summary: {
        drive_time_seconds: settings.track_drive_time ? driveTimeSec                                   : null,
        total_distance_km:  settings.track_distance   ? Math.round(totalDistanceKm * 1000) / 1000      : null,
        avg_speed_kmh:      settings.track_speed && speedCount > 0
          ? Math.round((speedSum / speedCount) * 10) / 10 : null,
        max_speed_kmh:      settings.track_speed && speedCount > 0
          ? Math.round(maxSpeedKmh * 10) / 10 : null,
        collision_count:    collisionCount,
        settings,
      },
    });
  } catch (err) {
    console.error('GET /api/fleet/driver-sessions/:id/summary error:', err);
    return res.status(500).json({ error: 'Failed to fetch session summary' });
  }
}
