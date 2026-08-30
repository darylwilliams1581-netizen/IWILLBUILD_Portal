/**
 * POST /api/me/2fa/sms/send
 *
 * Called after a successful password login when the user has SMS 2FA enabled.
 * Generates a 6-digit OTP, stores a hashed copy, and sends it via Twilio.
 *
 * Authentication: X-SMS-Challenge-Token header (short-lived token issued by
 * the sign-in intercept in auth-middleware.ts). Falls back to session auth
 * for the Settings page "resend" flow where the user is already logged in.
 *
 * Security:
 *   - Parameterised queries (no sql.raw interpolation)
 *   - Rate-limited: 3/IP/10min (checkSmsRate)
 *   - Never logs the OTP or phone number
 */
import type { Request, Response } from 'express';
import { randomBytes, createHash } from 'node:crypto';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { isSmsConfigured, sendSms } from '../../../../../lib/sms.js';
import { checkSmsRate } from '../../../../../lib/signup-rate-limiter.js';

const CODE_EXPIRY_MS = 10 * 60 * 1000;

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

export default async function handler(req: Request, res: Response) {
  if (!isSmsConfigured()) {
    return res.status(503).json({ error: 'SMS is not configured on this server.' });
  }

  try {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
               || req.socket.remoteAddress || 'unknown';

    if (!checkSmsRate(ip)) {
      return res.status(429).json({ error: 'Too many requests. Please wait a few minutes.' });
    }

    let userId: string | null = null;

    // ── Auth path 1: challenge token (login flow — no session yet) ──────────
    const challengeToken = req.headers['x-sms-challenge-token'] as string | undefined;
    if (challengeToken?.trim()) {
      const tokenHash = createHash('sha256').update(challengeToken.trim()).digest('hex');
      const [challengeRows] = await db.execute(
        sql`SELECT user_id FROM pending_2fa_challenges
            WHERE token_hash = ${tokenHash}
              AND method = 'sms'
              AND expires_at > NOW()
            LIMIT 1`
      ) as unknown as [Array<{ user_id: string }>, unknown];
      if (challengeRows?.[0]?.user_id) {
        userId = challengeRows[0].user_id;
      }
    }

    // ── Auth path 2: session (Settings page resend — user already logged in) ─
    if (!userId) {
      const auth = getAuth();
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
      }
      const session = await auth.api.getSession({ headers });
      if (session?.user?.id) {
        userId = session.user.id;
      }
    }

    if (!userId) return res.status(401).json({ error: 'Unauthorised' });

    const rows = (await db.execute(
      sql`SELECT sms_2fa_enabled, sms_2fa_phone FROM \`user\` WHERE id = ${userId} LIMIT 1`,
    )) as unknown as [Array<{ sms_2fa_enabled: number; sms_2fa_phone: string | null }>, unknown];

    const userRow = rows[0]?.[0];
    if (!userRow?.sms_2fa_enabled || !userRow.sms_2fa_phone) {
      return res.status(400).json({ error: 'SMS 2FA is not enabled for this account.' });
    }

    const phone     = userRow.sms_2fa_phone;
    const code      = generateCode();
    const hashed    = hashCode(code);
    const expiresAt = new Date(Date.now() + CODE_EXPIRY_MS);
    const id        = randomBytes(18).toString('hex');

    // Clear any existing 2FA OTP codes for this user
    await db.execute(
      sql`DELETE FROM sms_verification_codes WHERE user_id = ${userId} AND phone LIKE '2fa:%'`,
    );

    // Insert new code — prefix phone with '2fa:' to distinguish from account-recovery codes
    await db.execute(
      sql`INSERT INTO sms_verification_codes (id, user_id, code_hash, phone, expires_at, attempts)
          VALUES (${id}, ${userId}, ${hashed}, ${`2fa:${phone}`}, ${expiresAt}, 0)`,
    );

    // Mask phone for display — never log the real number
    const masked = phone.replace(/\d(?=\d{4})/g, '*');

    const sent = await sendSms(phone, `Your IWILLBUILD login code is: ${code}. Expires in 10 minutes. Do not share this code.`);
    if (!sent) {
      return res.status(500).json({ error: 'Failed to send SMS. Please try again.' });
    }

    return res.json({ ok: true, maskedPhone: masked });
  } catch (err) {
    console.error('[2fa/sms/send] error (details redacted)');
    return res.status(500).json({ error: 'Failed to send SMS code.' });
  }
}
