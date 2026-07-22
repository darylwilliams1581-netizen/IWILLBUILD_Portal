/**
 * GET /api/me/active-status
 *
 * Returns the current user's live activity across:
 *   - job_attendance  → currently signed in to a job
 *   - fleet_driver_sessions → currently driving a vehicle
 *
 * Used by the home screen sub-header to show active status pills.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../lib/auth-middleware.js';

function toUtcIso(val: unknown): string | null {
  if (!val) return null;
  const s = String(val);
  return s.endsWith('Z') || s.includes('+') ? s : s.replace(' ', 'T') + 'Z';
}

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  const userId    = auth.session.user.id;
  const companyId = auth.profile.companyId;
  const safeUserId = userId.replace(/'/g, '');

  try {
    // ── 1. Active job sign-in (net ins > outs, most recent job) ──────────────
    const [jobRows] = await db.execute(sql.raw(`
      SELECT
        ja.job_id,
        j.name AS job_name,
        j.job_number,
        MAX(CASE WHEN ja.action = 'signin' THEN ja.created_at END) AS signed_in_at,
        SUM(CASE WHEN ja.action = 'signin'  THEN 1 ELSE 0 END) AS ins,
        SUM(CASE WHEN ja.action = 'signout' THEN 1 ELSE 0 END) AS outs
      FROM job_attendance ja
      LEFT JOIN jobs j ON j.id = ja.job_id
      WHERE ja.company_id = ${companyId}
        AND ja.user_id = '${safeUserId}'
      GROUP BY ja.job_id, j.name, j.job_number
      HAVING SUM(CASE WHEN ja.action = 'signin' THEN 1 ELSE 0 END)
           > SUM(CASE WHEN ja.action = 'signout' THEN 1 ELSE 0 END)
      ORDER BY signed_in_at DESC
      LIMIT 1
    `)) as unknown as [Array<{
      job_id: number;
      job_name: string | null;
      job_number: string | null;
      signed_in_at: string | null;
    }>, unknown];

    const jobRow = jobRows?.[0] ?? null;

    // ── 2. Active drive session ───────────────────────────────────────────────
    // Auto-close stale sessions (>12h) first
    await db.execute(sql.raw(`
      UPDATE fleet_driver_sessions
      SET status = 'auto_closed', end_at = NOW()
      WHERE company_id = ${companyId}
        AND user_id = '${safeUserId}'
        AND status = 'active'
        AND start_at < DATE_SUB(NOW(), INTERVAL 12 HOUR)
    `));

    const [driveRows] = await db.execute(sql.raw(`
      SELECT fds.id, fds.fleet_asset_id, fds.start_at,
             fa.name AS asset_name, fa.type AS asset_type, fa.rego
      FROM fleet_driver_sessions fds
      JOIN fleet_assets fa ON fa.id = fds.fleet_asset_id
      WHERE fds.company_id = ${companyId}
        AND fds.user_id = '${safeUserId}'
        AND fds.status = 'active'
      ORDER BY fds.start_at DESC
    `)) as unknown as [Array<{
      id: number;
      fleet_asset_id: number;
      start_at: string | null;
      asset_name: string | null;
      asset_type: string | null;
      rego: string | null;
    }>, unknown];

    const drivingSessions = (driveRows ?? []).map(r => ({
      sessionId: r.id,
      assetId:   r.fleet_asset_id,
      assetName: r.asset_name,
      assetType: r.asset_type,
      rego:      r.rego,
      startAt:   toUtcIso(r.start_at),
    }));

    return res.json({
      ok: true,
      jobSignIn: jobRow
        ? {
            jobId:      jobRow.job_id,
            jobName:    jobRow.job_name,
            jobNumber:  jobRow.job_number,
            signedInAt: toUtcIso(jobRow.signed_in_at),
          }
        : null,
      driving:         drivingSessions[0] ?? null,   // legacy compat
      drivingSessions,                                // full array
    });
  } catch (err) {
    console.error('GET /api/me/active-status error:', err);
    return res.status(500).json({ error: 'Failed to fetch active status' });
  }
}
