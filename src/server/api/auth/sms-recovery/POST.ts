/**
 * POST /api/auth/sms-recovery
 * Body: { phone: string }
 *
 * Looks up a user by phone number and sends them a password reset link via SMS.
 * Always returns the same generic response to prevent phone number enumeration.
 * Rate-limited: 3 per IP per 15 minutes.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { user, passwordResetTokens } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { randomBytes, createHash } from 'node:crypto';
import { isSmsConfigured, sendSms } from '../../../lib/sms.js';
import { checkPasswordResetRate } from '../../../lib/signup-rate-limiter.js';
import { normalisePhone } from '../../../lib/normalise-phone.js';

const TOKEN_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

function generateToken(): string {
  return randomBytes(32).toString('hex');
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function randomId(): string {
  return randomBytes(18).toString('hex');
}

const GENERIC_OK = { ok: true, message: "If a verified account exists with that number, we've sent a reset link via SMS." };

export default async function handler(req: Request, res: Response) {
  try {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';

    if (!checkPasswordResetRate(ip)) {
      // Return generic OK — don't reveal rate limiting
      return res.json(GENERIC_OK);
    }

    if (!isSmsConfigured()) {
      return res.status(503).json({ error: 'SMS recovery is not configured on this portal.' });
    }

    const { phone } = req.body as { phone?: string };
    if (!phone?.trim()) {
      return res.status(400).json({ error: 'Phone number is required.' });
    }

    const normalised = phone.trim().replace(/\s+/g, '');
    // Normalise AU (04xx) and NZ (02x) local formats to E.164 for Twilio
    const e164 = normalisePhone(normalised);

    // Look up user by phone number — try both stored formats
    const [row] = await db
      .select({ id: user.id, name: user.name, email: user.email, verificationMethod: user.verificationMethod })
      .from(user)
      .where(eq(user.phoneNumber, e164))
      .limit(1);

    // Silently succeed if not found or not verified via SMS
    if (!row || row.verificationMethod !== 'sms') {
      return res.json(GENERIC_OK);
    }

    // Generate reset token
    const token = generateToken();
    const hashed = hashToken(token);
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MS);

    try {
      await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, row.id));
      await db.insert(passwordResetTokens).values({
        id: randomId(),
        userId: row.id,
        tokenHash: hashed,
        expiresAt,
      });
    } catch (err) {
      console.error('[sms-recovery] token insert failed:', err);
      return res.json(GENERIC_OK);
    }

    const baseUrl = process.env.BETTER_AUTH_URL || process.env.AIRO_PREVIEW_URL || 'https://iwillbuild.com';
    const resetUrl = `${baseUrl}/reset-password?token=${token}&uid=${row.id}`;
    const firstName = (row.name ?? 'there').split(' ')[0];

    const message = `Hi ${firstName}, reset your IWILLBUILD Portal password here: ${resetUrl} — expires in 30 mins. If you didn't request this, ignore this message.`;

    await sendSms(e164, message);

    return res.json(GENERIC_OK);
  } catch (err) {
    console.error('POST /api/auth/sms-recovery error:', err);
    // Always return generic OK — don't leak internal errors
    return res.json(GENERIC_OK);
  }
}
