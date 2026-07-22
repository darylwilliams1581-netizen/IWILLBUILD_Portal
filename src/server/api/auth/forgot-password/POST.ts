/**
 * POST /api/auth/forgot-password
 * Body: { email: string }
 *
 * Sends a password reset email. Always returns the same generic message
 * regardless of whether the email exists (prevents user enumeration).
 * Rate-limited: 5 per IP per 15 minutes.
 */
import type { Request, Response } from 'express';
import { sendPasswordResetEmail } from '../../../lib/password-reset.js';
import { checkPasswordResetRate } from '../../../lib/signup-rate-limiter.js';
import { logActivity, getIp, getUserAgent } from '../../../lib/activity-log.js';

export default async function handler(req: Request, res: Response) {
  try {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';

    if (!checkPasswordResetRate(ip)) {
      // Still return 200 — don't reveal rate limiting to potential attackers
      return res.json({ ok: true, message: "If an account exists with that email, we'll send reset instructions." });
    }

    const { email } = req.body as { email?: string };
    if (!email?.trim()) {
      return res.status(400).json({ error: 'Email is required.' });
    }

    // Fire and forget — never reveals whether email exists
    await sendPasswordResetEmail(email.trim());

    void logActivity({
      eventType: 'password_reset_requested',
      success: true,
      email: email.trim(),
      ipAddress: getIp(req as unknown as { headers: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string } }),
      userAgent: getUserAgent(req as unknown as { headers: Record<string, string | string[] | undefined> }),
    });

    return res.json({ ok: true, message: "If an account exists with that email, we'll send reset instructions." });
  } catch (err) {
    console.error('POST /api/auth/forgot-password error:', err);
    // Still return success — don't leak internal errors
    return res.json({ ok: true, message: "If an account exists with that email, we'll send reset instructions." });
  }
}
