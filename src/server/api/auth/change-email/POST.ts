/**
 * POST /api/auth/change-email
 * Body: { newEmail: string; password: string }
 *
 * Allows an unverified user to change their email address and receive
 * a fresh verification email. Requires password confirmation.
 * Rate-limited: 3 per IP per 15 minutes.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { user, account } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { sendVerificationEmail } from '../../../lib/email-verification.js';
import { checkChangeEmailRate } from '../../../lib/signup-rate-limiter.js';

export default async function handler(req: Request, res: Response) {
  try {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';

    if (!checkChangeEmailRate(ip)) {
      return res.status(429).json({ error: 'Too many requests. Please wait a few minutes before trying again.' });
    }

    // Must be authenticated (unverified users still have a session)
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) {
      return res.status(401).json({ error: 'Unauthorised' });
    }

    const { newEmail, password } = req.body as { newEmail?: string; password?: string };

    if (!newEmail?.trim()) return res.status(400).json({ error: 'New email is required.' });
    if (!password) return res.status(400).json({ error: 'Password confirmation is required.' });

    const normalised = newEmail.trim().toLowerCase();

    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalised)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    // Check new email isn't already taken
    const [existing] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, normalised))
      .limit(1);

    if (existing && existing.id !== session.user.id) {
      return res.status(409).json({ error: 'That email address is already in use.' });
    }

    // Verify password using bcryptjs
    const [acct] = await db
      .select({ password: account.password })
      .from(account)
      .where(eq(account.userId, session.user.id))
      .limit(1);

    if (!acct?.password) {
      return res.status(400).json({ error: 'Cannot verify password for this account.' });
    }

    const { compare } = await import('bcryptjs');
    const passwordOk = await compare(password, acct.password);
    if (!passwordOk) {
      return res.status(400).json({ error: 'Incorrect password.' });
    }

    // Update email and mark as unverified
    await db
      .update(user)
      .set({ email: normalised, emailVerified: false, updatedAt: new Date() })
      .where(eq(user.id, session.user.id));

    // Send new verification email
    try {
      await sendVerificationEmail(session.user.id, normalised, session.user.name ?? 'there');
    } catch (e) {
      console.error('[change-email] verification email failed:', e);
    }

    return res.json({ ok: true, message: 'Email updated. A new verification link has been sent to your new address.' });
  } catch (err) {
    console.error('POST /api/auth/change-email error:', err);
    return res.status(500).json({ error: 'Failed to update email. Please try again.' });
  }
}
