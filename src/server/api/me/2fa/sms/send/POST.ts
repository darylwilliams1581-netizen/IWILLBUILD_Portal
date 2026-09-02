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

/** Sanitised diagnostic logger — never logs OTP, token, hash, full phone or credentials. */
function diagLog(reqId: string, step: string, fields: Record<string, unknown> = {}) {
  console.info(JSON.stringify({ event: 'sms.send.diag', reqId, step, ...fields, ts: Date.now() }));
}

const CODE_EXPIRY_MS = 10 * 60 * 1000;

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

export default async function handler(req: Request, res: Response) {
  const reqId = randomBytes(6).toString('hex');

  if (!isSmsConfigured()) {
    diagLog(reqId, 'sms_not_configured');
    return res.status(503).json({ error: 'SMS is not configured on this server.' });
  }

  try {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
               || req.socket.remoteAddress || 'unknown';

    const ratePassed = checkSmsRate(ip);
    diagLog(reqId, 'rate_check', { ratePassed });
    if (!ratePassed) {
      return res.status(429).json({ error: 'Too many requests. Please wait a few minutes.' });
    }

    let userId: string | null = null;

    // ── Auth path 1: challenge token (login flow — no session yet) ──────────
    const challengeToken = req.headers['x-sms-challenge-token'] as string | undefined;
    const tokenPresent = !!(challengeToken?.trim());
    diagLog(reqId, 'token_check', { tokenPresent });

    if (tokenPresent) {
      const tokenHash = createHash('sha256').update(challengeToken!.trim()).digest('hex');
      const [challengeRows] = await db.execute(
        sql`SELECT user_id FROM pending_2fa_challenges
            WHERE token_hash = ${tokenHash}
              AND method = 'sms'
              AND expires_at > NOW()
            LIMIT 1`
      ) as unknown as [Array<{ user_id: string }>, unknown];
      const challengeFound = !!(challengeRows?.[0]?.user_id);
      diagLog(reqId, 'challenge_lookup', { challengeFound });
      if (challengeFound) {
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
      const sessionFound = !!(session?.user?.id);
      diagLog(reqId, 'session_fallback', { sessionFound });
      if (session?.user?.id) {
        userId = session.user.id;
      }
    }

    if (!userId) {
      diagLog(reqId, 'auth_failed');
      return res.status(401).json({ error: 'Unauthorised' });
    }

    const rows = (await db.execute(
      sql`SELECT sms_2fa_enabled, sms_2fa_phone FROM \`user\` WHERE id = ${userId} LIMIT 1`,
    )) as unknown as [Array<{ sms_2fa_enabled: number; sms_2fa_phone: string | null }>, unknown];

    const userRow = rows[0]?.[0];
    const phonePresent = !!(userRow?.sms_2fa_enabled && userRow?.sms_2fa_phone);
    const phoneE164Valid = phonePresent && /^\+\d{7,15}$/.test(userRow!.sms_2fa_phone!);
    diagLog(reqId, 'user_check', { smsEnabled: !!userRow?.sms_2fa_enabled, phonePresent, phoneE164Valid });

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
    diagLog(reqId, 'db_record_created', { recordId: id });

    const masked = phone.replace(/\d(?=\d{4})/g, '*');

    diagLog(reqId, 'provider_call_start');
    const result = await sendSms(phone, `Your IWIllBUIlD login code is: ${code}. Expires in 10 minutes. Do not share this code.`);
    diagLog(reqId, 'provider_call_end', { ok: result.ok, twilioCode: result.twilioCode });

    if (!result.ok) {
      // 21608 — Twilio trial/compliance restriction: account needs an approved
      // Primary Customer Profile before it can send to unverified numbers.
      if (result.twilioCode === 21608) {
        return res.status(503).json({
          error: 'SMS delivery is not yet enabled for this number. Please use an approved test number or contact the administrator.',
          errorCode: 'SMS_COMPLIANCE_REQUIRED',
        });
      }
      return res.status(500).json({ error: 'Failed to send SMS. Please try again.' });
    }

    diagLog(reqId, 'success', { maskedPhone: masked });
    return res.json({ ok: true, maskedPhone: masked });
  } catch (err) {
    console.error('[2fa/sms/send] error (details redacted)');
    return res.status(500).json({ error: 'Failed to send SMS code.' });
  }
}
