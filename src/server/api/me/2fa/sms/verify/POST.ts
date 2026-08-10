/**
 * POST /api/me/2fa/sms/verify
 * Body: { code: string }
 *
 * Verifies the SMS OTP sent by /api/me/2fa/sms/send.
 * Returns { ok: true } on success — the login page then navigates to /home.
 * Max 5 attempts before the code is invalidated.
 */
import type { Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';

const MAX_ATTEMPTS = 5;

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const userId = session.user.id;
    const { code } = req.body as { code?: string };
    if (!code?.trim() || !/^\d{6}$/.test(code.trim())) {
      return res.status(400).json({ error: 'A 6-digit code is required.' });
    }

    const now = new Date();
    const nowStr = now.toISOString().slice(0, 19).replace('T', ' ');

    // Find active 2FA code for this user
    const rows = await db.execute(sql.raw(
      `SELECT id, code_hash, attempts, verified_at
       FROM sms_verification_codes
       WHERE user_id = '${userId}'
         AND phone LIKE '2fa:%'
         AND expires_at > '${nowStr}'
       LIMIT 1`
    )) as unknown as Array<{
      id: string;
      code_hash: string;
      attempts: number;
      verified_at: string | null;
    }>;

    const row = rows[0];
    if (!row) {
      return res.status(400).json({ error: 'No active code found. Please request a new one.' });
    }

    if (row.verified_at) {
      return res.status(400).json({ error: 'This code has already been used.' });
    }

    if (row.attempts >= MAX_ATTEMPTS) {
      await db.execute(sql.raw(
        `DELETE FROM sms_verification_codes WHERE id = '${row.id}'`
      ));
      return res.status(400).json({ error: 'Too many failed attempts. Please request a new code.' });
    }

    const hashed = hashCode(code.trim());

    if (hashed !== row.code_hash) {
      await db.execute(sql.raw(
        `UPDATE sms_verification_codes SET attempts = ${row.attempts + 1} WHERE id = '${row.id}'`
      ));
      const remaining = MAX_ATTEMPTS - row.attempts - 1;
      return res.status(400).json({
        error: remaining > 0
          ? `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
          : 'Too many failed attempts. Please request a new code.',
      });
    }

    // Mark code as used
    await db.execute(sql.raw(
      `UPDATE sms_verification_codes SET verified_at = '${nowStr}' WHERE id = '${row.id}'`
    ));

    return res.json({ ok: true });
  } catch (err) {
    console.error('[2fa/sms/verify]', err);
    return res.status(500).json({ error: 'Verification failed.' });
  }
}
