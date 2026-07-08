/**
 * POST /api/jobs/:id/signin-qr
 *
 * Handles QR-based sign-in for BOTH authenticated portal users and unauthenticated guests.
 *
 * Authenticated users: token validated, attendance recorded immediately.
 * Guests: token validated + guest form fields required, guest_checkins record created.
 *
 * Body (authenticated): { token: string; actorType?: string }
 * Body (guest): { token: string; actorType?: string; full_name; phone_number; email?;
 *                 white_card_number; white_card_expiry; contact_name; contact_phone; reason_for_visit }
 *
 * Returns: { ok, action, recordId, isGuest }
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { verifyQrToken } from '../../../../lib/qr-token.js';
import { randomBytes } from 'crypto';
import type { ResultSetHeader } from 'mysql2';

const VALID_ACTOR_TYPES = new Set([
  'employee', 'contractor', 'consultant', 'delivery_driver', 'guest',
]);

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
  if (payload.action !== 'signin') {
    return res.status(400).json({ error: 'Token is for signout, not signin' });
  }

  const actorType = VALID_ACTOR_TYPES.has(body.actorType ?? '') ? body.actorType : payload.actorType;

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

      // Check for duplicate open sign-in
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

      if (ins > outs) {
        return res.json({ ok: true, alreadySignedIn: true, isGuest: false, message: 'Already signed in.' });
      }

      const [result] = await db.execute(
        sql.raw(`
          INSERT INTO job_attendance (company_id, job_id, user_id, action, source, actor_type)
          VALUES (${companyId}, ${jobId}, '${userId.replace(/'/g, '')}', 'signin', 'qr', '${actorType}')
        `)
      ) as unknown as [ResultSetHeader, unknown];

      return res.status(201).json({
        ok: true, isGuest: false, action: 'signin', recordId: result.insertId,
        message: 'Signed in via QR.',
      });
    }
  } catch {
    // No session — fall through to guest flow
  }

  // ── Guest flow ────────────────────────────────────────────────────────────
  const {
    full_name, phone_number, email,
    white_card_number, white_card_expiry,
    contact_name, contact_phone, reason_for_visit,
  } = body;

  const missing: string[] = [];
  if (!full_name)          missing.push('full_name');
  if (!phone_number)       missing.push('phone_number');
  if (!white_card_number)  missing.push('white_card_number');
  if (!white_card_expiry)  missing.push('white_card_expiry');
  if (!contact_name)       missing.push('contact_name');
  if (!contact_phone)      missing.push('contact_phone');
  if (!reason_for_visit)   missing.push('reason_for_visit');

  if (missing.length > 0) {
    return res.status(400).json({
      error: 'Guest check-in requires additional fields',
      missing,
    });
  }

  function esc(v: string | undefined): string {
    return v ? `'${String(v).replace(/'/g, "''").slice(0, 500)}'` : 'NULL';
  }

  const sessionId = randomBytes(20).toString('hex');

  try {
    const [result] = await db.execute(
      sql.raw(`
        INSERT INTO guest_checkins
          (company_id, job_id, session_id, action, actor_type,
           full_name, phone_number, email,
           white_card_number, white_card_expiry,
           contact_name, contact_phone, reason_for_visit,
           qr_token_id, source)
        VALUES
          (${companyId}, ${jobId}, '${sessionId}', 'signin', '${actorType}',
           ${esc(full_name)}, ${esc(phone_number)}, ${esc(email)},
           ${esc(white_card_number)}, ${esc(white_card_expiry)},
           ${esc(contact_name)}, ${esc(contact_phone)}, ${esc(reason_for_visit)},
           '${payload.jti}', 'qr')
      `)
    ) as unknown as [ResultSetHeader, unknown];

    return res.status(201).json({
      ok: true,
      isGuest: true,
      action: 'signin',
      recordId: result.insertId,
      sessionId,
      message: 'Guest check-in recorded.',
    });
  } catch (err) {
    console.error('POST /api/jobs/:id/signin-qr guest error:', err);
    return res.status(500).json({ error: 'Failed to record guest check-in' });
  }
}
