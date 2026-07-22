/**
 * POST /api/auth/resend-verification
 * Body: { email: string }
 *
 * Resends the verification email. Does NOT reveal whether the email exists.
 * Rate-limited by IP: 3 attempts per 10 minutes.
 */
import type { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../../db/client.js';
import { user } from '../../../db/schema.js';
import { sendVerificationEmail } from '../../../lib/email-verification.js';
import { checkResendRate } from '../../../lib/signup-rate-limiter.js';

export default async function handler(req: Request, res: Response) {
  try {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';

    if (!checkResendRate(ip)) {
      return res.status(429).json({ error: 'Too many requests. Please wait a few minutes before trying again.' });
    }

    const { email } = req.body as { email?: string };
    if (!email?.trim()) {
      return res.status(400).json({ error: 'Email is required.' });
    }

    // Always return success — don't reveal whether the email exists
    const [existing] = await db
      .select({ id: user.id, name: user.name, emailVerified: user.emailVerified })
      .from(user)
      .where(eq(user.email, email.trim().toLowerCase()))
      .limit(1);

    if (existing && !existing.emailVerified) {
      // Await so we can log any send failure — still return success to caller
      try {
        const result = await sendVerificationEmail(existing.id, email.trim().toLowerCase(), existing.name ?? 'there');
        console.log(`[resend-verification] sent to ${email} messageId=${result?.messageId ?? 'unknown'}`);
      } catch (e) {
        console.error('[resend-verification] EMAIL SEND FAILED:', e);
        // Still return 200 — don't reveal existence, but the error is now visible in logs
      }
    } else if (!existing) {
      console.log(`[resend-verification] no user found for ${email}`);
    } else {
      console.log(`[resend-verification] user ${email} is already verified`);
    }

    // Always return the same response
    return res.json({ ok: true, message: 'If that email is registered and unverified, a new link has been sent.' });
  } catch (err) {
    console.error('resend-verification.error', err);
    return res.status(500).json({ error: 'Failed to resend verification email. Please try again.' });
  }
}
