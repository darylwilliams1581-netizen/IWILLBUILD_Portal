/**
 * POST /api/fleet/:id/signout
 * Close the active usage session for a fleet asset.
 *
 * Body: { note?, meterEnd? }
 *
 * Rules:
 *  - Returns 400 if no active session exists.
 *  - Calculates duration_minutes = CEIL((ended_at - started_at) / 60s).
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../lib/auth-middleware.js';

export default async function handler(req: Request, res: Response) {
  try {
    const ctx = await getSessionAndProfile(req, res);
    if (!ctx) return;

    const fleetId   = parseInt(req.params.id);
    const companyId = ctx.profile.companyId;

    if (!fleetId) return res.status(400).json({ error: 'Invalid fleet id' });

    const {
      note     = null,
      meterEnd = null,
    } = req.body as { note?: string | null; meterEnd?: number | null };

    // Find active session
    const [activeRows] = await db.execute(
      sql`SELECT id, started_at,
                 TIMESTAMPDIFF(SECOND, started_at, NOW()) AS elapsed_seconds
          FROM fleet_usage_logs
          WHERE fleet_id = ${fleetId}
            AND company_id = ${companyId}
            AND ended_at IS NULL
          ORDER BY started_at DESC
          LIMIT 1`
    ) as unknown as [Array<{ id: number; started_at: string; elapsed_seconds: number }>, unknown];

    if (!activeRows.length) {
      return res.status(400).json({ error: 'No active usage session found for this asset.' });
    }

    const session = activeRows[0];
    const elapsedSeconds = Number(session.elapsed_seconds ?? 0);
    // Ceiling to nearest minute (minimum 1 minute)
    const durationMinutes = Math.max(1, Math.ceil(elapsedSeconds / 60));

    // Close the session
    await db.execute(
      sql`UPDATE fleet_usage_logs
          SET ended_at         = NOW(),
              duration_minutes = ${durationMinutes},
              note             = COALESCE(${note}, note),
              meter_end        = COALESCE(${meterEnd}, meter_end),
              updated_at       = NOW()
          WHERE id = ${session.id}`
    );

    // Return closed session
    const [closedRows] = await db.execute(
      sql`SELECT id, fleet_id, job_id, user_id, actor_type,
                 started_at, ended_at, duration_minutes, source, note,
                 meter_start, meter_end
          FROM fleet_usage_logs
          WHERE id = ${session.id} LIMIT 1`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    res.json({ ok: true, session: closedRows[0] ?? null });
  } catch (error) {
    console.error('POST /api/fleet/:id/signout error:', error);
    res.status(500).json({ error: 'Failed to end usage session' });
  }
}
