/**
 * GET /api/fleet/:id/usage-summary
 * Aggregated usage hours for a fleet asset.
 *
 * Query params:
 *   from   ISO date string (default: 30 days ago)
 *   to     ISO date string (default: today)
 *   jobId  optional job filter
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

    const { from, to, jobId } = req.query as { from?: string; to?: string; jobId?: string };

    // Default: last 30 days (AEST)
    const fromDate = from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const toDate   = to   ?? new Date().toISOString().slice(0, 10);
    const jobIdNum = jobId ? parseInt(jobId) : null;

    // Per-day breakdown
    const [dailyRows] = await db.execute(
      sql`SELECT
            DATE(CONVERT_TZ(started_at, '+00:00', '+10:00')) AS day,
            COUNT(*) AS session_count,
            COALESCE(SUM(duration_minutes), 0) AS total_minutes
          FROM fleet_usage_logs
          WHERE fleet_id   = ${fleetId}
            AND company_id = ${companyId}
            AND ended_at IS NOT NULL
            AND DATE(CONVERT_TZ(started_at, '+00:00', '+10:00')) BETWEEN ${fromDate} AND ${toDate}
            ${jobIdNum ? sql`AND job_id = ${jobIdNum}` : sql``}
          GROUP BY day
          ORDER BY day DESC`
    ) as unknown as [Array<{ day: string; session_count: number; total_minutes: number }>, unknown];

    // Per-user breakdown
    const [userRows] = await db.execute(
      sql`SELECT
            user_id,
            actor_type,
            COUNT(*) AS session_count,
            COALESCE(SUM(duration_minutes), 0) AS total_minutes
          FROM fleet_usage_logs
          WHERE fleet_id   = ${fleetId}
            AND company_id = ${companyId}
            AND ended_at IS NOT NULL
            AND DATE(CONVERT_TZ(started_at, '+00:00', '+10:00')) BETWEEN ${fromDate} AND ${toDate}
            ${jobIdNum ? sql`AND job_id = ${jobIdNum}` : sql``}
          GROUP BY user_id, actor_type
          ORDER BY total_minutes DESC`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    // Per-job breakdown
    const [jobRows] = await db.execute(
      sql`SELECT
            ful.job_id,
            j.name AS job_name,
            j.job_number,
            COUNT(*) AS session_count,
            COALESCE(SUM(ful.duration_minutes), 0) AS total_minutes
          FROM fleet_usage_logs ful
          LEFT JOIN jobs j ON j.id = ful.job_id
          WHERE ful.fleet_id   = ${fleetId}
            AND ful.company_id = ${companyId}
            AND ful.ended_at IS NOT NULL
            AND DATE(CONVERT_TZ(ful.started_at, '+00:00', '+10:00')) BETWEEN ${fromDate} AND ${toDate}
            ${jobIdNum ? sql`AND ful.job_id = ${jobIdNum}` : sql``}
          GROUP BY ful.job_id, j.name, j.job_number
          ORDER BY total_minutes DESC`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    // Grand totals
    const [totalsRows] = await db.execute(
      sql`SELECT
            COUNT(*) AS session_count,
            COALESCE(SUM(duration_minutes), 0) AS total_minutes
          FROM fleet_usage_logs
          WHERE fleet_id   = ${fleetId}
            AND company_id = ${companyId}
            AND ended_at IS NOT NULL
            AND DATE(CONVERT_TZ(started_at, '+00:00', '+10:00')) BETWEEN ${fromDate} AND ${toDate}
            ${jobIdNum ? sql`AND job_id = ${jobIdNum}` : sql``}`
    ) as unknown as [Array<{ session_count: number; total_minutes: number }>, unknown];

    res.json({
      ok: true,
      period: { from: fromDate, to: toDate },
      totals: {
        sessionCount: Number(totalsRows[0]?.session_count ?? 0),
        totalMinutes: Number(totalsRows[0]?.total_minutes ?? 0),
      },
      byDay:  dailyRows.map(r => ({ ...r, session_count: Number(r.session_count), total_minutes: Number(r.total_minutes) })),
      byUser: userRows,
      byJob:  jobRows,
    });
  } catch (error) {
    console.error('GET /api/fleet/:id/usage-summary error:', error);
    res.status(500).json({ error: 'Failed to fetch usage summary' });
  }
}
