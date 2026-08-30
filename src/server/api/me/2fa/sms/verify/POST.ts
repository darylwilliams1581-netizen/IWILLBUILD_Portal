/**
 * POST /api/me/2fa/sms/verify
 * Body: { code: string }
 *
 * Verifies the SMS OTP sent by /api/me/2fa/sms/send.
 *
 * Security fixes:
 *   - Parameterised queries
 *   - Rate-limited: 10/IP/15min + 5/account/15min
 *   - Never logs the code or phone number
 */
import type { Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { check2faRate } from '../../../../../lib/signup-rate-limiter.js';

const MAX_ATTEMPTS = 5;

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

export default async function handler(req: Request, res: Response) {
  try {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
               || req.socket.remoteAddress || 'unknown';

    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const userId = session.user.id;

    if (!check2faRate(ip, userId)) {
      return res.status(429).json({ error: 'Too many attempts. Please wait before trying again.' });
    }

    const { code } = req.body as { code?: string };
    if (!code?.trim() || !/^\d{6}$/.test(code.trim())) {
      return res.status(400).json({ error: 'A 6-digit code is required.' });
    }

    const now    = new Date();

    const rows = (await db.execute(
      sql`SELECT id, code_hash, attempts, verified_at
          FROM sms_verification_codes
          WHERE user_id = ${userId}
            AND phone LIKE '2fa:%'
            AND expires_at > ${now}
          LIMIT 1`,
    )) as unknown as [Array<{
      id: string;
      code_hash: string;
      attempts: number;
      verified_at: string | null;
    }>, unknown];

    const row = rows[0]?.[0];
    if (!row) {
      return res.status(400).json({ error: 'No active code found. Please request a new one.' });
    }

    if (row.verified_at) {
      return res.status(400).json({ error: 'This code has already been used.' });
    }

    if (row.attempts >= MAX_ATTEMPTS) {
      await db.execute(
        sql`DELETE FROM sms_verification_codes WHERE id = ${row.id}`,
      );
      return res.status(400).json({ error: 'Too many failed attempts. Please request a new code.' });
    }

    const hashed = hashCode(code.trim());

    if (hashed !== row.code_hash) {
      await db.execute(
        sql`UPDATE sms_verification_codes SET attempts = ${row.attempts + 1} WHERE id = ${row.id}`,
      );
      const remaining = MAX_ATTEMPTS - row.attempts - 1;
      return res.status(400).json({
        error: remaining > 0
          ? `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
          : 'Too many failed attempts. Please request a new code.',
      });
    }

    // Mark code as used
    await db.execute(
      sql`UPDATE sms_verification_codes SET verified_at = ${now} WHERE id = ${row.id}`,
    );

    // Clear the pending SMS 2FA challenge so the auth guard unblocks this session
    await db.execute(
      sql`DELETE FROM pending_2fa_challenges WHERE user_id = ${userId} AND method = 'sms'`
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error('[2fa/sms/verify] error (details redacted)');
    return res.status(500).json({ error: 'Verification failed.' });
  }
}
