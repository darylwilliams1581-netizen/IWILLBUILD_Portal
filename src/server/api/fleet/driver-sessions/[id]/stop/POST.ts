/**
 * POST /api/fleet/driver-sessions/:id/stop
 * Stop a driving session. User can stop their own; admin/owner can stop any.
 * On stop, computes and persists the analytics summary from telemetry points.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { profiles } from '../../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';

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
      sql`SELECT id, user_id, status, fleet_asset_id, start_at FROM fleet_driver_sessions
          WHERE id = ${sessionId} AND company_id = ${profile.companyId}`
    ) as unknown as [Array<{ id: number; user_id: string; status: string; fleet_asset_id: number; start_at: string }>, unknown];

    if (!rows.length) return res.status(404).json({ error: 'Session not found' });
    const ds = rows[0];

    if (ds.user_id !== betterSession.user.id && !isAdminOrOwner) {
      return res.status(403).json({ error: 'You can only stop your own driving session' });
    }

    if (ds.status !== 'active') {
      return res.status(400).json({ error: 'Session is already completed' });
    }

    // Mark session completed
    await db.execute(
      sql`UPDATE fleet_driver_sessions SET status = 'completed', end_at = NOW(), updated_at = NOW()
          WHERE id = ${sessionId} AND company_id = ${profile.companyId}`
    );

    // ── Compute analytics summary from telemetry ──────────────────────────
    try {
      // Fetch analytics settings
      const [settingsRows] = await db.execute(
        sql`SELECT track_distance, track_drive_time, track_speed, enable_collision_alerts
            FROM fleet_analytics_settings
            WHERE company_id = ${profile.companyId}
            LIMIT 1`
      ) as unknown as [Array<Record<string, unknown>>, unknown];

      const sr = settingsRows[0] ?? {};
      const trackDistance  = sr.track_distance  !== undefined ? !!sr.track_distance  : true;
      const trackDriveTime = sr.track_drive_time !== undefined ? !!sr.track_drive_time : true;
      const trackSpeed     = sr.track_speed     !== undefined ? !!sr.track_speed     : true;

      // Fetch telemetry points
      const [telRows] = await db.execute(
        sql`SELECT lat, lng, speed_kmh, recorded_at, is_collision
            FROM fleet_session_telemetry
            WHERE session_id = ${sessionId} AND company_id = ${profile.companyId}
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

      // Drive time from session start to now
      const rawStart = String(ds.start_at ?? '');
      const startIso = (rawStart.endsWith('Z') || rawStart.includes('+')) ? rawStart : rawStart.replace(' ', 'T') + 'Z';
      const startMs    = new Date(startIso).getTime();
      const driveTimeSec = Math.round((Date.now() - startMs) / 1000);

      const distKm   = trackDistance  ? Math.round(totalDistanceKm * 1000) / 1000 : null;
      const driveSec = trackDriveTime ? driveTimeSec : null;
      const avgSpeed = trackSpeed && speedCount > 0 ? Math.round((speedSum / speedCount) * 10) / 10 : null;
      const maxSpeed = trackSpeed && speedCount > 0 ? Math.round(maxSpeedKmh * 10) / 10 : null;

      await db.execute(sql`
        UPDATE fleet_driver_sessions SET
          total_distance_km    = ${distKm},
          active_drive_seconds = ${driveSec},
          avg_speed_kmh        = ${avgSpeed},
          max_speed_kmh        = ${maxSpeed},
          collision_count      = ${collisionCount},
          summary_computed_at  = NOW()
        WHERE id = ${sessionId} AND company_id = ${profile.companyId}
      `);

      return res.json({
        ok: true,
        summary: {
          drive_time_seconds: driveSec,
          total_distance_km:  distKm,
          avg_speed_kmh:      avgSpeed,
          max_speed_kmh:      maxSpeed,
          collision_count:    collisionCount,
        },
      });
    } catch (summaryErr) {
      // Summary computation is best-effort — session is already stopped
      console.warn('Fleet session summary computation failed (non-fatal):', summaryErr);
      return res.json({ ok: true, summary: null });
    }
  } catch (error) {
    console.error('POST /api/fleet/driver-sessions/:id/stop error:', error);
    res.status(500).json({ error: 'Failed to stop driving session' });
  }
}
