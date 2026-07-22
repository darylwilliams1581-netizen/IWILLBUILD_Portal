/**
 * POST /api/fleet/driver-sessions/:id/telemetry
 *
 * Ingests a batch of GPS telemetry points for an active driving session.
 * Only stores data for metrics that are enabled in fleet_analytics_settings.
 *
 * Body: {
 *   points: Array<{
 *     recorded_at: string;   // ISO 8601
 *     lat: number;
 *     lng: number;
 *     speed_kmh?: number;
 *     heading?: number;
 *     accuracy_m?: number;
 *     is_collision?: boolean;
 *   }>
 * }
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../../lib/auth-middleware.js';

interface TelemetryPoint {
  recorded_at: string;
  lat: number;
  lng: number;
  speed_kmh?: number | null;
  heading?: number | null;
  accuracy_m?: number | null;
  is_collision?: boolean;
}

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  const sessionId = parseInt(req.params.id, 10);
  if (isNaN(sessionId)) return res.status(400).json({ error: 'Invalid session id' });

  const companyId = auth.profile.companyId;
  const userId    = auth.session.user.id;

  const { points } = req.body as { points?: TelemetryPoint[] };
  if (!Array.isArray(points) || points.length === 0) {
    return res.status(400).json({ error: 'points array is required' });
  }
  // Cap batch size to prevent abuse
  const batch = points.slice(0, 500);

  try {
    // Verify session belongs to this user + company and is still active
    const [sessionRows] = await db.execute(
      sql`SELECT id, status FROM fleet_driver_sessions
          WHERE id = ${sessionId} AND company_id = ${companyId} AND user_id = ${userId}
          LIMIT 1`
    ) as unknown as [Array<{ id: number; status: string }>, unknown];

    if (!sessionRows.length) return res.status(404).json({ error: 'Session not found' });
    if (sessionRows[0].status !== 'active') {
      return res.status(400).json({ error: 'Session is no longer active' });
    }

    // Fetch analytics settings to know which fields to store
    const [settingsRows] = await db.execute(
      sql`SELECT track_distance, track_drive_time, track_speed, enable_collision_alerts
          FROM fleet_analytics_settings
          WHERE company_id = ${companyId}
          LIMIT 1`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    const settings = settingsRows[0] ?? {};
    const trackDistance  = settings.track_distance  !== undefined ? !!settings.track_distance  : true;
    const trackSpeed     = settings.track_speed     !== undefined ? !!settings.track_speed     : true;
    const trackCollision = settings.enable_collision_alerts !== undefined ? !!settings.enable_collision_alerts : false;

    // If no tracking is enabled at all, skip storage
    if (!trackDistance && !trackSpeed && !trackCollision) {
      return res.json({ ok: true, stored: 0, skipped: batch.length });
    }

    // Build multi-row INSERT
    const valueClauses: string[] = [];
    for (const pt of batch) {
      const lat = parseFloat(String(pt.lat));
      const lng = parseFloat(String(pt.lng));
      if (isNaN(lat) || isNaN(lng)) continue;

      const recAt    = new Date(pt.recorded_at).toISOString().slice(0, 23).replace('T', ' ');
      const speed    = trackSpeed && pt.speed_kmh != null ? parseFloat(String(pt.speed_kmh)) : null;
      const heading  = pt.heading  != null ? parseFloat(String(pt.heading))  : null;
      const accuracy = pt.accuracy_m != null ? parseFloat(String(pt.accuracy_m)) : null;
      const collision = trackCollision && pt.is_collision ? 1 : 0;

      valueClauses.push(
        `(${companyId}, ${sessionId}, '${recAt}', ${lat}, ${lng}, ` +
        `${speed !== null ? speed : 'NULL'}, ` +
        `${heading !== null ? heading : 'NULL'}, ` +
        `${accuracy !== null ? accuracy : 'NULL'}, ` +
        `${collision})`
      );
    }

    if (valueClauses.length === 0) {
      return res.json({ ok: true, stored: 0 });
    }

    await db.execute(sql.raw(`
      INSERT INTO fleet_session_telemetry
        (company_id, session_id, recorded_at, lat, lng, speed_kmh, heading, accuracy_m, is_collision)
      VALUES ${valueClauses.join(', ')}
    `));

    return res.json({ ok: true, stored: valueClauses.length });
  } catch (err) {
    console.error('POST /api/fleet/driver-sessions/:id/telemetry error:', err);
    return res.status(500).json({ error: 'Failed to store telemetry' });
  }
}
