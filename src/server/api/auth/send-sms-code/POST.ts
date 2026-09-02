/**
 * POST /api/auth/send-sms-code
 * Body: { phone: string }
 *
 * Sends a 6-digit SMS verification code to the given phone number.
 * Only available when SMS is configured.
 * Rate-limited: 3 per IP per 10 minutes.
 * Code expires after 10 minutes. Max 5 attempts.
 */
import type { Request, Response } from 'express';
import { randomBytes, createHash } from 'node:crypto';
import { db } from '../../../db/client.js';
import { smsVerificationCodes } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { profiles } from '../../../db/schema.js';
import { isSmsConfigured, sendSms } from '../../../lib/sms.js';
import { checkSmsRate, clearSmsRate } from '../../../lib/signup-rate-limiter.js';
import { normalisePhone } from '../../../lib/normalise-phone.js';

const CODE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

function generateCode(): string {
  // 6-digit numeric code
  return String(Math.floor(100000 + Math.random() * 900000));
}

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

export default async function handler(req: Request, res: Response) {
  if (!isSmsConfigured()) {
    return res.status(503).json({ error: 'SMS verification is not configured.' });
  }

  try {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
    if (!checkSmsRate(ip)) {
      return res.status(429).json({ error: 'Too many requests. Please wait a few minutes before trying again.' });
    }

    // Must be authenticated
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const { phone } = req.body as { phone?: string };
    if (!phone?.trim()) return res.status(400).json({ error: 'Phone number is required.' });

    const normalised = phone.trim().replace(/\s+/g, '');

    // Normalise AU (04xx) and NZ (02x) local formats to E.164 for Twilio
    const e164 = normalisePhone(normalised);

    const code = generateCode();
    const hashed = hashCode(code);
    const expiresAt = new Date(Date.now() + CODE_EXPIRY_MS);
    const id = randomBytes(18).toString('hex');

    // Delete any existing codes for this user
    await db.delete(smsVerificationCodes).where(eq(smsVerificationCodes.userId, session.user.id));

    // Insert new code
    await db.insert(smsVerificationCodes).values({
      id,
      userId: session.user.id,
      codeHash: hashed,
      phone: e164,
      expiresAt,
    });

    // Send SMS
    const sent = await sendSms(e164, `Your IWIIlBUILD verification code is: ${code}. Expires in 10 minutes.`);
    if (!sent) {
      return res.status(500).json({ error: 'Failed to send SMS. Please try again or use a different verification method.' });
    }

    // Reset the rate-limit counter after a successful send so the user can
    // request a new code without hitting the limit on their next attempt.
    clearSmsRate(ip);

    return res.json({ ok: true, message: 'Verification code sent.' });
  } catch (err) {
    console.error('POST /api/auth/send-sms-code error:', err);
    return res.status(500).json({ error: 'Failed to send SMS code.' });
  }
}
