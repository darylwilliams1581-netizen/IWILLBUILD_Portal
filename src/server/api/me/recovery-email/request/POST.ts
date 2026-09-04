/**
 * POST /api/me/recovery-email/request
 *
 * Initiates a recovery-email change.
 *
 * Body: { newEmail: string; password: string; totpCode?: string }
 *
 * Security gates (all enforced server-side):
 *   1. Valid session
 *   2. Password re-verification via BetterAuth
 *   3. TOTP re-verification when twoFactorEnabled (via official plugin)
 *   4. Active change-block check (72 h after high-risk events)
 *   5. Account not frozen
 */
import type { Request, Response } from 'express';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { getIp, getUserAgent } from '../../../../lib/activity-log.js';
import {
  requestRecoveryEmailChange,
  HOLD_DAYS,
} from '../../../../lib/recovery-email-service.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }

    // ── 1. Session check ──────────────────────────────────────────────────────
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const { newEmail, password, totpCode } = req.body as {
      newEmail?:  string;
      password?:  string;
      totpCode?:  string;
    };

    if (!newEmail?.trim() || !EMAIL_RE.test(newEmail.trim())) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }
    if (!password?.trim()) {
      return res.status(400).json({ error: 'Current password is required.' });
    }

    // ── 2. Password re-verification ───────────────────────────────────────────
    // Use BetterAuth's changePassword with the same current password to verify.
    // We pass a no-op new password equal to current — if it fails, password is wrong.
    // Better: use signIn.email to verify credentials without creating a new session.
    const verifyResult = await auth.api.signInEmail({
      body: { email: session.user.email, password },
      // We don't want a new session — just credential verification
      headers,
    }).catch(() => null);

    if (!verifyResult) {
      return res.status(403).json({ error: 'Incorrect password.' });
    }

    // ── 3. 2FA re-verification (when enrolled) ────────────────────────────────
    const user = session.user as { twoFactorEnabled?: boolean };
    if (user.twoFactorEnabled) {
      if (!totpCode?.trim()) {
        return res.status(403).json({ error: 'Two-factor code required.', requiresTwoFactor: true });
      }
      // Verify TOTP via official plugin endpoint
      const tfaResult = await auth.api.verifyTOTP({
        body: { code: totpCode },
        headers,
      }).catch(() => null);

      if (!tfaResult) {
        return res.status(403).json({ error: 'Invalid two-factor code.' });
      }
    }

    // ── 4 & 5. Domain logic (block + frozen checks inside service) ────────────
    const result = await requestRecoveryEmailChange({
      userId:     session.user.id,
      newEmail:   newEmail.trim(),
      ipAddress:  getIp(req),
      userAgent:  getUserAgent(req) ?? undefined,
    });

    if (!result.ok) {
      switch (result.code) {
        case 'BLOCKED':
          return res.status(403).json({
            error:        `Recovery email changes are temporarily blocked for security reasons. Try again after ${result.blockedUntil.toISOString()}.`,
            blockedUntil: result.blockedUntil,
          });
        case 'FROZEN':
          return res.status(403).json({ error: 'This account is frozen. Contact support.' });
        case 'SAME_AS_ACTIVE':
          return res.status(400).json({ error: 'That address is already your active recovery email.' });
        case 'SAME_AS_PROPOSED':
          return res.status(400).json({ error: 'A change to that address is already pending.' });
      }
    }

    return res.json({
      ok:          true,
      holdDays:    HOLD_DAYS,
      message:     `A verification email has been sent to the new address. Your current recovery email remains active for ${HOLD_DAYS} days.`,
    });
  } catch (err) {
    console.error('[recovery-email/request]', err instanceof Error ? err.message : String(err));
    return res.status(500).json({ error: 'Failed to initiate recovery email change.' });
  }
}
