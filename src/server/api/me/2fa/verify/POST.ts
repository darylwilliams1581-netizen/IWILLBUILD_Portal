/**
 * POST /api/me/2fa/verify
 * Body: { token: string, challengeToken?: string }
 *
 * Verifies a TOTP code during login (pending-2FA challenge flow).
 *
 * Two modes:
 *   1. Challenge mode (preferred): challengeToken cookie present → validates
 *      the pending challenge, deletes it on success, returns { ok: true }.
 *      The client then completes the BetterAuth sign-in.
 *   2. Legacy in-session mode: no challenge cookie → validates against the
 *      current session (for in-app 2FA re-confirmation flows).
 *
 * Security fixes:
 *   - Parameterised queries
 *   - TOTP secret decrypted from encrypted storage
 *   - ±1 time-window tolerance
 *   - Rate-limited: 10/IP/15min + 5/account/15min
 *   - Attempt counter on user row (totp_attempts / totp_locked_until)
 *   - Never logs secret or token
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { decryptTotpSecret } from '../../../../lib/totp-crypto.js';
import { check2faRate } from '../../../../lib/signup-rate-limiter.js';
import {
  getChallengeTokenFromRequest,
  getChallenge,
  incrementChallengeAttempts,
  deleteChallenge,
  clearChallengeCookie,
} from '../../../../lib/pending-2fa.js';

const MAX_TOTP_ATTEMPTS = 5;
const LOCKOUT_MS        = 15 * 60 * 1000; // 15 minutes

export default async function handler(req: Request, res: Response) {
  try {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
               || req.socket.remoteAddress || 'unknown';

    const { token } = req.body as { token?: string };
    if (!token || !/^\d{6}$/.test(token)) {
      return res.status(400).json({ error: 'A 6-digit code is required.' });
    }

    // ── Challenge mode ─────────────────────────────────────────────────────────
    const challengeToken = getChallengeTokenFromRequest(req);
    if (challengeToken) {
      const challenge = await getChallenge(challengeToken);
      if (!challenge) {
        clearChallengeCookie(res);
        return res.status(401).json({
          error: 'Challenge expired or invalid. Please sign in again.',
          code:  'CHALLENGE_EXPIRED',
        });
      }

      if (challenge.method !== 'totp') {
        return res.status(400).json({ error: 'This challenge requires SMS verification.' });
      }

      if (!check2faRate(ip, challenge.userId)) {
        return res.status(429).json({ error: 'Too many attempts. Please wait before trying again.' });
      }

      const userId = challenge.userId;

      // Fetch user's TOTP secret and lockout state
      const rows = (await db.execute(
        sql`SELECT totp_secret, two_factor_enabled, totp_attempts, totp_locked_until
            FROM \`user\` WHERE id = ${userId} LIMIT 1`,
      )) as unknown as [Array<{
        totp_secret: string | null;
        two_factor_enabled: number;
        totp_attempts: number;
        totp_locked_until: Date | string | null;
      }>, unknown];

      const userRow = rows[0]?.[0];
      if (!userRow?.two_factor_enabled || !userRow.totp_secret) {
        await deleteChallenge(challenge.id);
        clearChallengeCookie(res);
        return res.status(400).json({ error: '2FA is not enabled for this account.' });
      }

      // Check account-level lockout
      if (userRow.totp_locked_until) {
        const lockedUntil = new Date(userRow.totp_locked_until);
        if (lockedUntil > new Date()) {
          return res.status(429).json({
            error: 'Account temporarily locked due to too many failed attempts. Please try again later.',
          });
        }
      }

      let plaintextSecret: string;
      try {
        plaintextSecret = decryptTotpSecret(userRow.totp_secret);
      } catch {
        return res.status(500).json({ error: 'Authentication configuration error.' });
      }

      const { verify } = await import('otplib');
      const result = await verify({ token, secret: plaintextSecret, strategy: 'totp', epochTolerance: 1 });

      if (!result?.valid) {
        // Increment challenge attempts
        const lockedOut = await incrementChallengeAttempts(challenge.id, challenge.attempts);

        // Increment user-level attempt counter
        const newAttempts = (userRow.totp_attempts ?? 0) + 1;
        if (newAttempts >= MAX_TOTP_ATTEMPTS) {
          const lockedUntil = new Date(Date.now() + LOCKOUT_MS);
          await db.execute(
            sql`UPDATE \`user\` SET totp_attempts = ${newAttempts}, totp_locked_until = ${lockedUntil} WHERE id = ${userId}`,
          );
        } else {
          await db.execute(
            sql`UPDATE \`user\` SET totp_attempts = ${newAttempts} WHERE id = ${userId}`,
          );
        }

        if (lockedOut) {
          clearChallengeCookie(res);
          return res.status(429).json({ error: 'Too many failed attempts. Please sign in again.' });
        }

        const remaining = MAX_TOTP_ATTEMPTS - challenge.attempts - 1;
        return res.status(400).json({
          error: remaining > 0
            ? `Invalid code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
            : 'Too many failed attempts. Please sign in again.',
        });
      }

      // Success — delete challenge, clear cookie, reset attempt counters
      await deleteChallenge(challenge.id);
      clearChallengeCookie(res);
      await db.execute(
        sql`UPDATE \`user\` SET totp_attempts = 0, totp_locked_until = NULL WHERE id = ${userId}`,
      );

      // Issue a fresh BetterAuth session now that 2FA is complete.
      // The original session was revoked during the 2FA intercept, so we must
      // create a new one. We replicate BetterAuth's session cookie format:
      //   cookie value = "${token}.${base64(HMAC-SHA256(token, secret))}"
      // This matches BetterAuth's makeSignature() in dist/crypto/index.mjs.
      try {
        const { randomBytes } = await import('node:crypto');
        const { subtle }      = await import('node:crypto');
        const { getSecret }   = await import('#airo/secrets');
        const authSecret = getSecret('BETTER_AUTH_SECRET');
        if (authSecret) {
          const sessionId    = randomBytes(18).toString('hex');
          const sessionToken = randomBytes(32).toString('hex');
          const expiresAt    = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

          // Insert the session row
          await db.execute(
            sql`INSERT INTO session (id, token, user_id, expires_at, ip_address, user_agent)
                VALUES (${sessionId}, ${sessionToken}, ${userId}, ${expiresAt},
                        ${req.ip ?? null}, ${(req.headers['user-agent'] ?? '').slice(0, 500)})`,
          );

          // Sign the token using BetterAuth's format: token.base64(HMAC-SHA256(token, secret))
          const keyMaterial = new TextEncoder().encode(authSecret);
          const cryptoKey   = await subtle.importKey('raw', keyMaterial, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
          const sigBuf      = await subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(sessionToken));
          const signature   = Buffer.from(sigBuf).toString('base64');
          const signedToken = `${sessionToken}.${signature}`;

          const isProd = process.env.NODE_ENV === 'production';
          res.cookie('better-auth.session_token', signedToken, {
            httpOnly: true,
            sameSite: 'lax',
            secure:   isProd,
            expires:  expiresAt,
            path:     '/',
          });
        }
      } catch (sessionErr) {
        // Non-critical — the challenge is cleared; the client can re-authenticate
        console.error('[2fa/verify] session re-issue failed (non-critical):', sessionErr instanceof Error ? sessionErr.message : String(sessionErr));
      }

      return res.json({ ok: true });
    }

    // ── Legacy in-session mode (re-confirmation, not login) ────────────────────
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const userId = session.user.id;

    if (!check2faRate(ip, userId)) {
      return res.status(429).json({ error: 'Too many attempts. Please wait before trying again.' });
    }

    const rows = (await db.execute(
      sql`SELECT totp_secret, two_factor_enabled FROM \`user\` WHERE id = ${userId} LIMIT 1`,
    )) as unknown as [Array<{ totp_secret: string | null; two_factor_enabled: number }>, unknown];

    const userRow = rows[0]?.[0];
    if (!userRow?.two_factor_enabled || !userRow.totp_secret) {
      return res.json({ ok: true }); // 2FA not set up — let through
    }

    let plaintextSecret: string;
    try {
      plaintextSecret = decryptTotpSecret(userRow.totp_secret);
    } catch {
      return res.status(500).json({ error: 'Authentication configuration error.' });
    }

    const { verify } = await import('otplib');
    const result = await verify({ token, secret: plaintextSecret, strategy: 'totp', epochTolerance: 1 });
    if (!result?.valid) {
      return res.status(400).json({ error: 'Invalid code. Please try again.' });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('[2fa/verify] error (details redacted)');
    return res.status(500).json({ error: 'Verification failed' });
  }
}
