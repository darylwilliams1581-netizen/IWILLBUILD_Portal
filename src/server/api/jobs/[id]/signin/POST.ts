/**
 * POST /api/jobs/:id/signin
 *
 * Signs the current portal user into a job.
 * Prevents duplicate open sign-ins (same user, same job, no sign-out yet).
 *
 * Body: { actorType?: string; notes?: string }
 * Returns: { ok, action, attendanceId, alreadySignedIn }
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../lib/auth-middleware.js';
import type { ResultSetHeader } from 'mysql2';
import { toMySQLDatetime } from '../../../../lib/datetime.js';

const VALID_ACTOR_TYPES = new Set([
  'employee', 'contractor', 'consultant', 'delivery_driver', 'guest',
]);

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  const jobId = parseInt(req.params.id);
  if (!jobId) return res.status(400).json({ error: 'Invalid job id' });

  const { actorType = 'employee', notes, clientId: bodyClientId, occurredAt } = req.body as {
    actorType?: string;
    notes?: string;
    clientId?: string;
    occurredAt?: string;
  };

  const safeActorType = VALID_ACTOR_TYPES.has(actorType) ? actorType : 'employee';
  const userId    = auth.session.user.id;
  const companyId = auth.profile.companyId;
  const rawClientId = bodyClientId ?? req.get('X-Client-Id') ?? '';
  const clientId = /^[A-Za-z0-9-]{8,64}$/.test(rawClientId) ? rawClientId : null;
  const actionAt = toMySQLDatetime(occurredAt) ?? toMySQLDatetime(new Date())!;

  try {
    // ── Verify job belongs to company ─────────────────────────────────────
    const jobRows = (await db.execute(
      sql.raw(`SELECT id FROM jobs WHERE id = ${jobId} AND company_id = ${companyId} LIMIT 1`)
    ) as unknown as [Array<{ id: number }>, unknown])[0];
    if (!jobRows?.[0]) return res.status(404).json({ error: 'Job not found' });

    if (clientId) {
      const [existing] = await db.execute(sql`
        SELECT id FROM job_attendance
        WHERE company_id = ${companyId} AND user_id = ${userId} AND client_id = ${clientId}
        LIMIT 1
      `) as unknown as [Array<{ id: number }>, unknown];
      if (existing[0]) {
        return res.json({ ok: true, idempotent: true, action: 'signin', attendanceId: existing[0].id, message: 'Sign-in already synced.' });
      }
    }

    // ── Check for open sign-in (signed in, not yet signed out) ────────────
    // Strategy: count sign-ins minus sign-outs for this user+job.
    // If net > 0, they are already signed in.
    const countRows = (await db.execute(
      sql.raw(`
        SELECT
          SUM(CASE WHEN action = 'signin'  THEN 1 ELSE 0 END) AS ins,
          SUM(CASE WHEN action = 'signout' THEN 1 ELSE 0 END) AS outs
        FROM job_attendance
        WHERE job_id = ${jobId} AND user_id = '${userId.replace(/'/g, '')}'
      `)
    ) as unknown as [Array<{ ins: number; outs: number }>, unknown])[0];

    const ins  = Number(countRows?.[0]?.ins  ?? 0);
    const outs = Number(countRows?.[0]?.outs ?? 0);

    if (ins > outs) {
      return res.json({
        ok: true,
        alreadySignedIn: true,
        message: 'You are already signed in to this job.',
      });
    }

    // ── Record sign-in ────────────────────────────────────────────────────
    const safeNotes = notes ? String(notes).slice(0, 500) : null;
    const [result] = await db.execute(sql`
      INSERT INTO job_attendance
        (company_id, job_id, user_id, action, source, actor_type, notes, client_id, created_at)
      VALUES
        (${companyId}, ${jobId}, ${userId}, 'signin', 'portal', ${safeActorType}, ${safeNotes}, ${clientId}, ${actionAt})
    `) as unknown as [ResultSetHeader, unknown];

    return res.status(201).json({
      ok: true,
      alreadySignedIn: false,
      action: 'signin',
      attendanceId: result.insertId,
      message: 'Signed in successfully.',
    });
  } catch (err) {
    console.error('POST /api/jobs/:id/signin error:', err);
    return res.status(500).json({ error: 'Failed to sign in' });
  }
}
