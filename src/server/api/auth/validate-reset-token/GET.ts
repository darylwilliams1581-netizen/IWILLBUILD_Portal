/**
 * GET /api/auth/validate-reset-token?token=...&uid=...
 * Returns { valid: boolean } — used by the reset-password page to check
 * whether the token is still valid before showing the form.
 */
import type { Request, Response } from 'express';
import { validateResetToken } from '../../../lib/password-reset.js';

export default async function handler(req: Request, res: Response) {
  try {
    const { token, uid } = req.query as { token?: string; uid?: string };
    if (!token || !uid) {
      return res.json({ valid: false });
    }
    const valid = await validateResetToken(token, uid);
    return res.json({ valid });
  } catch (err) {
    // Table may not exist yet — treat as invalid token
    const msg = String(err);
    if (msg.includes('ER_NO_SUCH_TABLE') || msg.includes("doesn't exist")) {
      return res.json({ valid: false });
    }
    console.error('GET /api/auth/validate-reset-token error:', err);
    return res.json({ valid: false });
  }
}
