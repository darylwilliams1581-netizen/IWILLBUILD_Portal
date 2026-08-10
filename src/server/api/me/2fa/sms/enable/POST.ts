/**
 * POST /api/me/2fa/sms/enable
 * Body: { phone: string, code: string }
 *
 * Enables SMS 2FA for the authenticated user.
 * Requires a verified OTP (sent via /api/me/2fa/sms/send-setup) to confirm
 * the phone number is reachable before enabling.
 *
 * Flow:
 *   1. Client calls POST /api/me/2fa/sms/send-setup { phone } → sends OTP
 *   2. User enters OTP
 *   3. Client calls this endpoint { phone, code } → verifies + enables
 */
import type { Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { normalisePhone } from '../../../../../lib/normalise-phone.js';

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
    const { phone, code } = req.body as { phone?: string; code?: string };

    if (!phone?.trim()) return res.status(400).json({ error: 'Phone number is required.' });
    if (!code?.trim() || !/^\d{6}$/.test(code.trim())) {
      return res.status(400).json({ error: 'A 6-digit verification code is required.' });
    }

    const e164 = normalisePhone(phone.trim().replace(/\s+/g, ''));
    const now = new Date();
    const nowStr = now.toISOString().slice(0, 19).replace('T', ' ');

    // Verify the setup OTP (stored with prefix 'setup:')
    const rows = await db.execute(sql.raw(
      `SELECT id, code_hash, attempts, verified_at
       FROM sms_verification_codes
       WHERE user_id = '${userId}'
         AND phone = 'setup:${e164}'
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
      return res.status(400).json({ error: 'No active verification code. Please request a new one.' });
    }
    if (row.verified_at) {
      return res.status(400).json({ error: 'This code has already been used.' });
    }
    if (row.attempts >= 5) {
      await db.execute(sql.raw(`DELETE FROM sms_verification_codes WHERE id = '${row.id}'`));
      return res.status(400).json({ error: 'Too many failed attempts. Please request a new code.' });
    }

    const hashed = hashCode(code.trim());
    if (hashed !== row.code_hash) {
      await db.execute(sql.raw(
        `UPDATE sms_verification_codes SET attempts = ${row.attempts + 1} WHERE id = '${row.id}'`
      ));
      const remaining = 5 - row.attempts - 1;
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

    // Enable SMS 2FA — also disable TOTP if it was active (one method at a time)
    const safePhone = e164.replace(/'/g, '');
    await db.execute(sql.raw(
      `UPDATE \`user\`
       SET sms_2fa_enabled = 1,
           sms_2fa_phone = '${safePhone}',
           two_factor_enabled = 0,
           totp_secret = NULL
       WHERE id = '${userId}'`
    ));

    return res.json({ ok: true });
  } catch (err) {
    console.error('[2fa/sms/enable]', err);
    return res.status(500).json({ error: 'Failed to enable SMS 2FA.' });
  }
}
