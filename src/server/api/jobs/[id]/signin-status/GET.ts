/**
 * GET /api/jobs/:id/signin-status
 *
 * Returns:
 *   - signedIn          — whether the current user is currently signed in
 *   - lastAction / lastActionAt — for the status card
 *   - currentlyOnSite   — live roster: all users with net sign-ins > sign-outs
 *   - recentLog         — last 30 raw attendance entries (all users)
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../lib/auth-middleware.js';

// Normalise MySQL DATETIME (no Z) → UTC ISO string
function toUtcIso(val: unknown): string | null {
  if (!val) return null;
  const s = String(val);
  return s.endsWith('Z') || s.includes('+') ? s : s + 'Z';
}

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  const jobId = parseInt(req.params.id);
  if (!jobId) return res.status(400).json({ error: 'Invalid job id' });

  const userId    = auth.session.user.id;
  const companyId = auth.profile.companyId;
  const safeUserId = userId.replace(/'/g, '');

  try {
    // ── Verify job belongs to company ─────────────────────────────────────
    const jobResult = await db.execute(
      sql.raw(`SELECT id FROM jobs WHERE id = ${jobId} AND company_id = ${companyId} LIMIT 1`)
    ) as unknown as [Array<{ id: number }>, unknown];
    const jobRows = jobResult[0];
    if (!jobRows?.[0]) return res.status(404).json({ error: 'Job not found' });

    // ── 1. Current user status (net sign-in count) ────────────────────────
    const netResult = await db.execute(
      sql.raw(`
        SELECT
          SUM(CASE WHEN action = 'signin'  THEN 1 ELSE 0 END) AS ins,
          SUM(CASE WHEN action = 'signout' THEN 1 ELSE 0 END) AS outs
        FROM job_attendance
        WHERE job_id = ${jobId} AND user_id = '${safeUserId}'
      `)
    ) as unknown as [Array<{ ins: number; outs: number }>, unknown];
    const netRows = netResult[0];

    const netIns  = Number(netRows?.[0]?.ins  ?? 0);
    const netOuts = Number(netRows?.[0]?.outs ?? 0);
    const signedIn = netIns > netOuts;

    // ── 2. Last action for the status card ────────────────────────────────
    const lastResult = await db.execute(
      sql.raw(`
        SELECT action, created_at
        FROM job_attendance
        WHERE job_id = ${jobId} AND user_id = '${safeUserId}'
        ORDER BY created_at DESC
        LIMIT 1
      `)
    ) as unknown as [Array<{ action: string; created_at: string }>, unknown];
    const lastRows = lastResult[0];
    const lastRow = lastRows?.[0] ?? null;

    // ── 3. Currently on site — live roster ────────────────────────────────
    const onSiteResult = await db.execute(
      sql.raw(`
        SELECT
          ja.user_id,
          SUM(CASE WHEN ja.action = 'signin'  THEN 1 ELSE 0 END) AS ins,
          SUM(CASE WHEN ja.action = 'signout' THEN 1 ELSE 0 END) AS outs,
          MAX(CASE WHEN ja.action = 'signin' THEN ja.created_at END) AS signed_in_at,
          MAX(CASE WHEN ja.action = 'signin' THEN ja.actor_type END) AS actor_type,
          MAX(CASE WHEN ja.action = 'signin' THEN ja.source    END) AS source,
          u.name  AS user_name,
          u.email AS user_email
        FROM job_attendance ja
        LEFT JOIN user u ON u.id = ja.user_id
        WHERE ja.job_id = ${jobId} AND ja.company_id = ${companyId}
        GROUP BY ja.user_id, u.name, u.email
        HAVING SUM(CASE WHEN ja.action = 'signin'  THEN 1 ELSE 0 END)
             > SUM(CASE WHEN ja.action = 'signout' THEN 1 ELSE 0 END)
        ORDER BY signed_in_at DESC
      `)
    ) as unknown as [Array<{
      user_id: string;
      signed_in_at: string;
      actor_type: string;
      source: string;
      user_name: string | null;
      user_email: string | null;
    }>, unknown];
    const onSiteRows = onSiteResult[0] ?? [];

    // ── 4. Recent attendance log (raw, last 30 entries) ───────────────────
    const logResult = await db.execute(
      sql.raw(`
        SELECT
          ja.id, ja.action, ja.source, ja.actor_type, ja.notes,
          ja.created_at,
          u.name  AS user_name,
          u.email AS user_email
        FROM job_attendance ja
        LEFT JOIN user u ON u.id = ja.user_id
        WHERE ja.job_id = ${jobId} AND ja.company_id = ${companyId}
        ORDER BY ja.created_at DESC
        LIMIT 30
      `)
    ) as unknown as [Array<Record<string, unknown>>, unknown];
    const logRows = logResult[0] ?? [];

    return res.json({
      ok: true,
      signedIn,
      lastAction:   lastRow?.action              ?? null,
      lastActionAt: toUtcIso(lastRow?.created_at) ?? null,
      currentlyOnSite: onSiteRows.map((r) => ({
        ...r,
        signed_in_at: toUtcIso(r.signed_in_at),
      })),
      recentLog: logRows.map((r) => ({
        ...r,
        created_at: toUtcIso(r.created_at as string),
      })),
    });
  } catch (err) {
    console.error('GET /api/jobs/:id/signin-status error:', err);
    return res.status(500).json({ error: 'Failed to fetch sign-in status' });
  }
}
