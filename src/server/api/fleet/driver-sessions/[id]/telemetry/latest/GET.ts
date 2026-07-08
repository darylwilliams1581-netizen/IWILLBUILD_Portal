/**
 * GET /api/fleet/driver-sessions/:id/telemetry/latest
 *
 * Returns the single most-recent telemetry point for a session.
 * The session must belong to the requesting user's company.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../../../lib/auth-middleware.js';

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  const sessionId = parseInt(req.params.id, 10);
  if (isNaN(sessionId)) return res.status(400).json({ error: 'Invalid session id' });

  const companyId = auth.profile.companyId;

  try {
    // Verify session belongs to this company
    const [sessionRows] = await db.execute(sql.raw(
      `SELECT id FROM fleet_driver_sessions WHERE id = ${sessionId} AND company_id = ${companyId} LIMIT 1`
    )) as unknown as [Array<{ id: number }>, unknown];

    if (!sessionRows?.length) return res.status(404).json({ error: 'Session not found' });

    const [rows] = await db.execute(sql.raw(`
      SELECT lat, lng, speed_kmh, heading, accuracy_m, recorded_at
      FROM fleet_session_telemetry
      WHERE session_id = ${sessionId}
      ORDER BY recorded_at DESC
      LIMIT 1
    `)) as unknown as [Array<Record<string, unknown>>, unknown];

    return res.json({ point: rows?.[0] ?? null });
  } catch (err) {
    console.error('GET /api/fleet/driver-sessions/:id/telemetry/latest error:', err);
    return res.status(500).json({ error: 'Failed to fetch latest telemetry' });
  }
}
