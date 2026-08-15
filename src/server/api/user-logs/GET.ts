/**
 * GET /api/user-logs
 *
 * Company-scoped user activity report across 4 log types.
 * All types returned together, each keyed separately in the response.
 *
 * Query params:
 *   userId    — profile user_id (uuid string); omit for all users
 *   jobId     — filter by job id (number)
 *   dateFrom  — YYYY-MM-DD
 *   dateTo    — YYYY-MM-DD
 *   types     — comma-separated subset: signin,fleet,timeentries,activity
 *               default: all four
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../lib/auth-middleware.js';

function esc(v: string) { return v.replace(/'/g, "''"); }

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  const companyId = auth.profile.companyId;
  const userId    = (req.query.userId   as string | undefined)?.trim() || null;
  const jobId     = req.query.jobId ? parseInt(req.query.jobId as string) : null;
  const dateFrom  = (req.query.dateFrom as string | undefined)?.trim() || null;
  const dateTo    = (req.query.dateTo   as string | undefined)?.trim() || null;
  const typesRaw  = (req.query.types    as string | undefined) || 'signin,fleet,timeentries,activity';
  const types     = new Set(typesRaw.split(',').map(t => t.trim()));

  try {
    const result: Record<string, unknown[]> = {
      signin:      [],
      fleet:       [],
      timeentries: [],
      activity:    [],
    };

    // ── 1. Job site sign-ins (job_attendance) ─────────────────────────────
    if (types.has('signin')) {
      const w: string[] = [`ja.company_id = ${companyId}`];
      if (userId)   w.push(`ja.user_id = '${esc(userId)}'`);
      if (jobId)    w.push(`ja.job_id = ${jobId}`);
      if (dateFrom) w.push(`DATE(ja.created_at) >= '${esc(dateFrom)}'`);
      if (dateTo)   w.push(`DATE(ja.created_at) <= '${esc(dateTo)}'`);

      const [rows] = await db.execute(sql.raw(`
        SELECT
          ja.id,
          u.name        AS user_name,
          u.email       AS user_email,
          j.name        AS job_name,
          j.job_number,
          ja.action,
          ja.source,
          ja.actor_type,
          ja.notes,
          ja.created_at
        FROM job_attendance ja
        LEFT JOIN user u ON u.id = ja.user_id
        LEFT JOIN jobs j  ON j.id = ja.job_id
        WHERE ${w.join(' AND ')}
        ORDER BY ja.created_at DESC
        LIMIT 500
      `)) as unknown as [Array<Record<string, unknown>>, unknown];
      result.signin = rows ?? [];
    }

    // ── 2. Fleet / vehicle usage (fleet_usage_logs) ───────────────────────
    if (types.has('fleet')) {
      const w: string[] = [`ful.company_id = ${companyId}`];
      if (userId)   w.push(`ful.user_id = '${esc(userId)}'`);
      if (jobId)    w.push(`ful.job_id = ${jobId}`);
      if (dateFrom) w.push(`DATE(ful.started_at) >= '${esc(dateFrom)}'`);
      if (dateTo)   w.push(`DATE(ful.started_at) <= '${esc(dateTo)}'`);

      const [rows] = await db.execute(sql.raw(`
        SELECT
          ful.id,
          u.name                AS user_name,
          u.email               AS user_email,
          fa.name               AS fleet_name,
          fa.rego AS fleet_registration,
          j.name                AS job_name,
          j.job_number,
          ful.started_at,
          ful.ended_at,
          ful.duration_minutes,
          ful.meter_start,
          ful.meter_end,
          ful.note,
          ful.source
        FROM fleet_usage_logs ful
        LEFT JOIN users u         ON u.id  = ful.user_id
        LEFT JOIN fleet_assets fa ON fa.id = ful.fleet_id
        LEFT JOIN jobs j          ON j.id  = ful.job_id
        WHERE ${w.join(' AND ')}
        ORDER BY ful.started_at DESC
        LIMIT 500
      `)) as unknown as [Array<Record<string, unknown>>, unknown];
      result.fleet = rows ?? [];
    }

    // ── 3. Time entries (team_time_entries) ───────────────────────────────
    if (types.has('timeentries')) {
      const w: string[] = [`te.company_id = ${companyId}`];
      // time entries use profile_id; resolve from user_id if provided
      if (userId) {
        w.push(`te.profile_id = (SELECT id FROM profiles WHERE user_id = '${esc(userId)}' AND company_id = ${companyId} LIMIT 1)`);
      }
      if (jobId)    w.push(`te.job_id = ${jobId}`);
      if (dateFrom) w.push(`te.entry_date >= '${esc(dateFrom)}'`);
      if (dateTo)   w.push(`te.entry_date <= '${esc(dateTo)}'`);

      const [rows] = await db.execute(sql.raw(`
        SELECT
          te.id,
          p.display_name        AS user_name,
          u.email               AS user_email,
          j.name                AS job_name,
          j.job_number,
          te.entry_date,
          te.clock_in,
          te.clock_out,
          te.break_minutes,
          te.total_minutes,
          te.hourly_rate,
          te.status,
          te.notes,
          ap.display_name       AS approved_by_name,
          te.approved_at
        FROM team_time_entries te
        JOIN profiles p          ON p.id = te.profile_id
        LEFT JOIN users u        ON u.id = p.user_id
        LEFT JOIN jobs j         ON j.id = te.job_id
        LEFT JOIN profiles ap    ON ap.id = te.approved_by
        WHERE ${w.join(' AND ')}
        ORDER BY te.entry_date DESC, te.clock_in DESC
        LIMIT 500
      `)) as unknown as [Array<Record<string, unknown>>, unknown];
      result.timeentries = rows ?? [];
    }

    // ── 4. Platform activity log (company-scoped) ─────────────────────────
    if (types.has('activity')) {
      const w: string[] = [`pal.company_id = ${companyId}`];
      if (userId)   w.push(`pal.user_id = '${esc(userId)}'`);
      if (dateFrom) w.push(`DATE(pal.created_at) >= '${esc(dateFrom)}'`);
      if (dateTo)   w.push(`DATE(pal.created_at) <= '${esc(dateTo)}'`);
      // activity log has no job_id column — skip jobId filter here

      const [rows] = await db.execute(sql.raw(`
        SELECT
          pal.id,
          pal.user_id,
          pal.email,
          pal.event_type,
          NULL AS entity_type,
          NULL AS entity_id,
          pal.reason AS description,
          pal.ip_address,
          pal.success,
          pal.created_at
        FROM platform_activity_log pal
        WHERE ${w.join(' AND ')}
        ORDER BY pal.created_at DESC
        LIMIT 500
      `)) as unknown as [Array<Record<string, unknown>>, unknown];
      result.activity = rows ?? [];
    }

    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error('GET /api/user-logs error:', err);
    return res.status(500).json({ error: 'Failed to fetch user logs' });
  }
}
