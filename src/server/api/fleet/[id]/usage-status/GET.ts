/**
 * GET /api/fleet/:id/usage-status
 * Returns the current active session (if any) + today's and this-week's totals.
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

    // Verify asset belongs to company
    const [assetRows] = await db.execute(
      sql`SELECT id, name, type, rego FROM fleet_assets
          WHERE id = ${fleetId} AND company_id = ${companyId} AND archived = 0 LIMIT 1`
    ) as unknown as [Array<{ id: number; name: string; type: string; rego: string }>, unknown];

    if (!assetRows.length) return res.status(404).json({ error: 'Asset not found' });

    // Active session
    const [activeRows] = await db.execute(
      sql`SELECT ful.id, ful.user_id, ful.actor_type, ful.started_at, ful.job_id,
                 ful.meter_start, ful.note, ful.source,
                 TIMESTAMPDIFF(MINUTE, ful.started_at, NOW()) AS elapsed_minutes,
                 j.name AS job_name, j.job_number
          FROM fleet_usage_logs ful
          LEFT JOIN jobs j ON j.id = ful.job_id
          WHERE ful.fleet_id = ${fleetId}
            AND ful.company_id = ${companyId}
            AND ful.ended_at IS NULL
          ORDER BY ful.started_at DESC
          LIMIT 1`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    const activeSession = activeRows[0] ?? null;
    // Stale warning: session open > 12 hours
    const staleWarning = activeSession
      ? Number(activeSession.elapsed_minutes ?? 0) >= 720
      : false;

    // Today totals (AEST = UTC+10, no DST)
    const [todayRows] = await db.execute(
      sql`SELECT
            COUNT(*) AS session_count,
            COALESCE(SUM(duration_minutes), 0) AS total_minutes
          FROM fleet_usage_logs
          WHERE fleet_id = ${fleetId}
            AND company_id = ${companyId}
            AND ended_at IS NOT NULL
            AND DATE(CONVERT_TZ(started_at, '+00:00', '+10:00')) = DATE(CONVERT_TZ(NOW(), '+00:00', '+10:00'))`
    ) as unknown as [Array<{ session_count: number; total_minutes: number }>, unknown];

    // This week totals (Mon–Sun AEST)
    const [weekRows] = await db.execute(
      sql`SELECT
            COUNT(*) AS session_count,
            COALESCE(SUM(duration_minutes), 0) AS total_minutes
          FROM fleet_usage_logs
          WHERE fleet_id = ${fleetId}
            AND company_id = ${companyId}
            AND ended_at IS NOT NULL
            AND YEARWEEK(CONVERT_TZ(started_at, '+00:00', '+10:00'), 1)
                = YEARWEEK(CONVERT_TZ(NOW(), '+00:00', '+10:00'), 1)`
    ) as unknown as [Array<{ session_count: number; total_minutes: number }>, unknown];

    // Recent closed sessions (last 10)
    const [recentRows] = await db.execute(
      sql`SELECT ful.id, ful.user_id, ful.actor_type, ful.started_at, ful.ended_at,
                 ful.duration_minutes, ful.job_id, ful.source, ful.note,
                 ful.meter_start, ful.meter_end,
                 j.name AS job_name, j.job_number
          FROM fleet_usage_logs ful
          LEFT JOIN jobs j ON j.id = ful.job_id
          WHERE ful.fleet_id = ${fleetId}
            AND ful.company_id = ${companyId}
            AND ful.ended_at IS NOT NULL
          ORDER BY ful.started_at DESC
          LIMIT 10`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    res.json({
      ok: true,
      asset: assetRows[0],
      activeSession,
      staleWarning,
      today: {
        sessionCount: Number(todayRows[0]?.session_count ?? 0),
        totalMinutes: Number(todayRows[0]?.total_minutes ?? 0),
      },
      thisWeek: {
        sessionCount: Number(weekRows[0]?.session_count ?? 0),
        totalMinutes: Number(weekRows[0]?.total_minutes ?? 0),
      },
      recentSessions: recentRows,
    });
  } catch (error) {
    console.error('GET /api/fleet/:id/usage-status error:', error);
    res.status(500).json({ error: 'Failed to fetch usage status' });
  }
}
