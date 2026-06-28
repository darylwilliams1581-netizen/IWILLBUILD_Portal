/**
 * POST /api/auth/reset-password
 * Body: { token: string; userId: string; newPassword: string }
 *
 * Validates the reset token and sets the new password.
 * Invalidates all other sessions after successful reset.
 */
import type { Request, Response } from 'express';
import { validateResetToken, consumeResetToken } from '../../../lib/password-reset.js';
import { db } from '../../../db/client.js';
import { user, account } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';

const PASSWORD_RULES = /^(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]).{8,}$/;

export default async function handler(req: Request, res: Response) {
  try {
    const { token, userId, newPassword } = req.body as {
      token?: string;
      userId?: string;
      newPassword?: string;
    };

    if (!token || !userId || !newPassword) {
      return res.status(400).json({ error: 'Token, userId, and newPassword are required.' });
    }

    // Validate password strength
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }
    if (!/\d/.test(newPassword)) {
      return res.status(400).json({ error: 'Password must include at least one number.' });
    }
    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(newPassword)) {
      return res.status(400).json({ error: 'Password must include at least one symbol.' });
    }

    // Validate token
    const valid = await validateResetToken(token, userId);
    if (!valid) {
      return res.status(400).json({ error: 'This reset link is invalid or has expired. Please request a new one.' });
    }

    // Use BetterAuth to set the new password (handles hashing)
    const auth = getAuth();

    // BetterAuth doesn't have a direct "admin set password" API, so we use
    // the account table to update the password hash directly via bcryptjs
    const { hash } = await import('bcryptjs');
    const hashed = await hash(newPassword, 12);

    // Update the credential account for this user
    await db
      .update(account)
      .set({ password: hashed, updatedAt: new Date() })
      .where(eq(account.userId, userId));

    // Consume the token
    await consumeResetToken(token, userId);

    // Invalidate all sessions for this user (security: force re-login)
    const { sql } = await import('drizzle-orm');
    await db.execute(sql`DELETE FROM session WHERE user_id = ${userId}`);

    return res.json({ ok: true, message: 'Password reset successfully. Please sign in with your new password.' });
  } catch (err) {
    console.error('POST /api/auth/reset-password error:', err);
    return res.status(500).json({ error: 'Failed to reset password. Please try again.' });
  }
}
