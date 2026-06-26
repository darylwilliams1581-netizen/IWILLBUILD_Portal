/**
 * POST /api/auth/verify-email
 * Body: { token: string, uid: string }
 *
 * Verifies the email token and activates the account.
 */
import type { Request, Response } from 'express';
import { verifyEmailToken } from '../../../lib/email-verification.js';

export default async function handler(req: Request, res: Response) {
  try {
    const { token, uid } = req.body as { token?: string; uid?: string };

    if (!token || !uid) {
      return res.status(400).json({ error: 'Invalid verification link.' });
    }

    const ok = await verifyEmailToken(token, uid);

    if (!ok) {
      return res.status(400).json({
        code: 'invalid_or_expired',
        error: 'This verification link is invalid or has expired. Please request a new one.',
      });
    }

    return res.json({ ok: true, message: 'Email verified successfully.' });
  } catch (err) {
    console.error('verify-email.error', err);
    return res.status(500).json({ error: 'Verification failed. Please try again.' });
  }
}
