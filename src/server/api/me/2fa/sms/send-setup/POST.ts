/**
 * POST /api/me/2fa/sms/send-setup
 * Body: { phone: string }
 *
 * Sends a verification OTP to a phone number during SMS 2FA setup.
 *
 * Security fix: parameterised queries (no sql.raw interpolation).
 */
import type { Request, Response } from 'express';
import { randomBytes, createHash } from 'node:crypto';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { isSmsConfigured, sendSms } from '../../../../../lib/sms.js';
import { checkSmsRate } from '../../../../../lib/signup-rate-limiter.js';
import { normalisePhone } from '../../../../../lib/normalise-phone.js';

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

    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const { phone } = req.body as { phone?: string };
    if (!phone?.trim()) return res.status(400).json({ error: 'Phone number is required.' });

    const e164      = normalisePhone(phone.trim().replace(/\s+/g, ''));
    const code      = generateCode();
    const hashed    = hashCode(code);
    const expiresAt = new Date(Date.now() + CODE_EXPIRY_MS);
    const id        = randomBytes(18).toString('hex');

    // Clear any existing setup codes for this user
    await db.execute(
      sql`DELETE FROM sms_verification_codes WHERE user_id = ${session.user.id} AND phone LIKE 'setup:%'`,
    );

    await db.execute(
      sql`INSERT INTO sms_verification_codes (id, user_id, code_hash, phone, expires_at, attempts)
          VALUES (${id}, ${session.user.id}, ${hashed}, ${`setup:${e164}`}, ${expiresAt}, 0)`,
    );

    const result = await sendSms(e164, `Your IWILLBUILD 2FA setup code is: ${code}. Expires in 10 minutes.`);
    if (!result.ok) {
      if (result.twilioCode === 21608) {
        return res.status(503).json({
          error: 'SMS delivery is not yet enabled for this number. Please use an approved test number or contact the administrator.',
          errorCode: 'SMS_COMPLIANCE_REQUIRED',
        });
      }
      return res.status(500).json({ error: 'Failed to send SMS. Please try again.' });
    }

    // Never log the real phone number
    const masked = e164.replace(/\d(?=\d{4})/g, '*');
    return res.json({ ok: true, maskedPhone: masked });
  } catch (err) {
    console.error('[2fa/sms/send-setup] error:', err instanceof Error ? err.message : String(err));
    return res.status(500).json({ error: 'Failed to send setup code.' });
  }
}
