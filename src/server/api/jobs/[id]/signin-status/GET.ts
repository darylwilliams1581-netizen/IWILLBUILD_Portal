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

    // ── Current user status — find the latest open session ───────────────
    const [openRows] = await db.execute(
      sql`SELECT id, created_at
          FROM job_attendance
          WHERE job_id = ${jobId}
            AND user_id = ${userId}
            AND action = 'signin'
            AND id > COALESCE(
              (SELECT MAX(id) FROM job_attendance
               WHERE job_id = ${jobId} AND user_id = ${userId} AND action = 'signout'),
              0
            )
          ORDER BY created_at DESC
          LIMIT 1`
    ) as unknown as [Array<{ id: number; created_at: string }>, unknown];

    const openSession = openRows?.[0] ?? null;
    const signedIn    = !!openSession;

    // Last action for display
    const [lastRows] = await db.execute(
      sql`SELECT action, created_at
          FROM job_attendance
          WHERE job_id = ${jobId} AND user_id = ${userId}
          ORDER BY created_at DESC
          LIMIT 1`
    ) as unknown as [Array<{ action: string; created_at: string }>, unknown];

    const lastRow = lastRows?.[0] ?? null;

    // ── Recent log (all users, this job) — include signed_out_at ─────────
    const [logRows] = await db.execute(
      sql`SELECT
            ja.id, ja.action, ja.source, ja.actor_type, ja.notes, ja.created_at,
            u.name  AS user_name,
            u.email AS user_email,
            (SELECT MAX(ja2.created_at)
             FROM job_attendance ja2
             WHERE ja2.job_id = ja.job_id
               AND ja2.user_id = ja.user_id
               AND ja2.action = 'signout'
               AND ja2.id > ja.id
            ) AS signed_out_at
          FROM job_attendance ja
          LEFT JOIN users u ON u.id = ja.user_id
          WHERE ja.job_id = ${jobId} AND ja.company_id = ${companyId}
          ORDER BY ja.created_at DESC
          LIMIT 20`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    return res.json({
      ok: true,
      signedIn,
      openSessionId: openSession?.id ?? null,
      lastAction:   lastRow?.action   ?? null,
      lastActionAt: lastRow?.created_at ?? null,
      recentLog: logRows ?? [],
    });
  } catch (err) {
    console.error('GET /api/jobs/:id/signin-status error:', err);
    return res.status(500).json({ error: 'Failed to fetch sign-in status' });
  }
}
