/**
 * GET /api/jobs/:id/signin-status
 *
 * Returns current sign-in status for the authenticated user on this job,
 * plus a recent attendance log (last 20 entries for this job, all users).
 *
 * Returns: { ok, signedIn, lastAction, recentLog }
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../lib/auth-middleware.js';

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  const jobId = parseInt(req.params.id);
  if (!jobId) return res.status(400).json({ error: 'Invalid job id' });

  const userId    = auth.session.user.id;
  const companyId = auth.profile.companyId;

  try {
    // ── Verify job belongs to company ─────────────────────────────────────
    const [jobRows] = await db.execute(
      sql.raw(`SELECT id FROM jobs WHERE id = ${jobId} AND company_id = ${companyId} LIMIT 1`)
    ) as unknown as [Array<{ id: number }>, unknown];
    if (!jobRows?.[0]) return res.status(404).json({ error: 'Job not found' });

    // ── Current user status ───────────────────────────────────────────────
    const [countRows] = await db.execute(
      sql.raw(`
        SELECT
          SUM(CASE WHEN action = 'signin'  THEN 1 ELSE 0 END) AS ins,
          SUM(CASE WHEN action = 'signout' THEN 1 ELSE 0 END) AS outs,
          MAX(created_at) AS last_action_at,
          (SELECT action FROM job_attendance
           WHERE job_id = ${jobId} AND user_id = '${userId.replace(/'/g, '')}'
           ORDER BY created_at DESC LIMIT 1) AS last_action
        FROM job_attendance
        WHERE job_id = ${jobId} AND user_id = '${userId.replace(/'/g, '')}'
      `)
    ) as unknown as [Array<{
      ins: number; outs: number;
      last_action_at: string | null; last_action: string | null;
    }>, unknown];

    const row = countRows?.[0];
    const ins  = Number(row?.ins  ?? 0);
    const outs = Number(row?.outs ?? 0);
    const signedIn = ins > outs;

    // ── Recent log (all users, this job) ─────────────────────────────────
    const [logRows] = await db.execute(
      sql.raw(`
        SELECT
          ja.id, ja.action, ja.source, ja.actor_type, ja.notes, ja.created_at,
          u.name AS user_name, u.email AS user_email
        FROM job_attendance ja
        LEFT JOIN users u ON u.id = ja.user_id
        WHERE ja.job_id = ${jobId} AND ja.company_id = ${companyId}
        ORDER BY ja.created_at DESC
        LIMIT 20
      `)
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    return res.json({
      ok: true,
      signedIn,
      lastAction: row?.last_action ?? null,
      lastActionAt: row?.last_action_at ?? null,
      recentLog: logRows ?? [],
    });
  } catch (err) {
    console.error('GET /api/jobs/:id/signin-status error:', err);
    return res.status(500).json({ error: 'Failed to fetch sign-in status' });
  }
}
