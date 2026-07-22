/**
 * POST /api/jobs/:id/signout-qr
 *
 * Handles QR-based sign-out.
 *
 * Authenticated users: records sign-out in job_attendance.
 * Guests: records sign-out in guest_checkins using sessionId from prior sign-in.
 *
 * Body (authenticated): { token: string }
 * Body (guest): { token: string; sessionId: string; full_name: string; phone_number: string }
 *
 * Returns: { ok, action, recordId, isGuest }
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { verifyQrToken } from '../../../../lib/qr-token.js';
import type { ResultSetHeader } from 'mysql2';

export default async function handler(req: Request, res: Response) {
  const jobId = parseInt(req.params.id);
  if (!jobId) return res.status(400).json({ error: 'Invalid job id' });

  const body = req.body as Record<string, string>;
  const { token } = body;
  if (!token) return res.status(400).json({ error: 'token is required' });

  // ── Verify QR token ───────────────────────────────────────────────────────
  let payload;
  try {
    payload = verifyQrToken(token);
  } catch (err) {
    return res.status(400).json({ error: String(err) });
  }

  if (payload.jobId !== jobId) {
    return res.status(400).json({ error: 'Token job mismatch' });
  }
  if (payload.action !== 'signout') {
    return res.status(400).json({ error: 'Token is for signin, not signout' });
  }

  // ── Resolve company from job ──────────────────────────────────────────────
  const [jobRows] = await db.execute(
    sql.raw(`SELECT id, company_id FROM jobs WHERE id = ${jobId} LIMIT 1`)
  ) as unknown as [Array<{ id: number; company_id: number }>, unknown];
  const job = jobRows?.[0];
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const companyId = job.company_id;

  // ── Try authenticated session ─────────────────────────────────────────────
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: req.headers as unknown as Headers });
    if (session?.user) {
      const userId = session.user.id;

      const [countRows] = await db.execute(
        sql.raw(`
          SELECT
            SUM(CASE WHEN action = 'signin'  THEN 1 ELSE 0 END) AS ins,
            SUM(CASE WHEN action = 'signout' THEN 1 ELSE 0 END) AS outs
          FROM job_attendance
          WHERE job_id = ${jobId} AND user_id = '${userId.replace(/'/g, '')}'
        `)
      ) as unknown as [Array<{ ins: number; outs: number }>, unknown];

      const ins  = Number(countRows?.[0]?.ins  ?? 0);
      const outs = Number(countRows?.[0]?.outs ?? 0);

      if (ins <= outs) {
        return res.json({ ok: true, notSignedIn: true, isGuest: false, message: 'Not currently signed in.' });
      }

      const [result] = await db.execute(
        sql.raw(`
          INSERT INTO job_attendance (company_id, job_id, user_id, action, source, actor_type)
          VALUES (${companyId}, ${jobId}, '${userId.replace(/'/g, '')}', 'signout', 'qr', 'employee')
        `)
      ) as unknown as [ResultSetHeader, unknown];

      return res.status(201).json({
        ok: true, isGuest: false, action: 'signout', recordId: result.insertId,
        message: 'Signed out via QR.',
      });
    }
  } catch {
    // No session — fall through to guest flow
  }

  // ── Guest sign-out ────────────────────────────────────────────────────────
  const { sessionId, full_name, phone_number } = body;

  if (!sessionId && !full_name) {
    return res.status(400).json({
      error: 'Guest sign-out requires sessionId or full_name + phone_number',
    });
  }

  function esc(v: string | undefined): string {
    return v ? `'${String(v).replace(/'/g, "''").slice(0, 500)}'` : 'NULL';
  }

  try {
    const [result] = await db.execute(
      sql.raw(`
        INSERT INTO guest_checkins
          (company_id, job_id, session_id, action, actor_type,
           full_name, phone_number, qr_token_id, source)
        VALUES
          (${companyId}, ${jobId}, ${esc(sessionId ?? '')}, 'signout', '${payload.actorType}',
           ${esc(full_name)}, ${esc(phone_number)},
           '${payload.jti}', 'qr')
      `)
    ) as unknown as [ResultSetHeader, unknown];

    return res.status(201).json({
      ok: true,
      isGuest: true,
      action: 'signout',
      recordId: result.insertId,
      message: 'Guest sign-out recorded.',
    });
  } catch (err) {
    console.error('POST /api/jobs/:id/signout-qr guest error:', err);
    return res.status(500).json({ error: 'Failed to record guest sign-out' });
  }
}
