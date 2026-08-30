/**
 * POST /api/me/2fa/sms/verify
 * Body: { code: string }
 *
 * Verifies the SMS OTP sent by /api/me/2fa/sms/send.
 *
 * Authentication: X-SMS-Challenge-Token header (login flow — no session yet).
 * Falls back to session auth for the Settings page flow.
 *
 * On success (login flow): verifies the code, deletes the pending challenge,
 * then calls auth.handler with a crafted internal request so BetterAuth
 * creates the session and sets the signed cookie itself.
 *
 * Security:
 *   - Parameterised queries
 *   - Rate-limited: 10/IP/15min + 5/account/15min
 *   - Never logs the code or phone number
 */
import type { Request, Response } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { check2faRate } from '../../../../../lib/signup-rate-limiter.js';

const MAX_ATTEMPTS = 5;

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

/** Safe diagnostic logger — never logs code, token, hash, or phone. */
function diagLog(reqId: string, step: string, fields: Record<string, unknown> = {}) {
  console.info(JSON.stringify({ event: 'sms.verify.diag', reqId, step, ...fields, ts: Date.now() }));
}

export default async function handler(req: Request, res: Response) {
  const reqId = randomBytes(6).toString('hex');
  try {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
               || req.socket.remoteAddress || 'unknown';

    diagLog(reqId, 'received', { ip: ip.slice(0, 8) + '…', hasBody: !!req.body });

    let userId: string | null = null;
    let isLoginFlow = false;

    // ── Auth path 1: challenge token (login flow — no session yet) ──────────
    const challengeToken = req.headers['x-sms-challenge-token'] as string | undefined;
    const tokenPresent = !!(challengeToken?.trim());
    diagLog(reqId, 'token_check', { tokenPresent });
    if (challengeToken?.trim()) {
      const tokenHash = createHash('sha256').update(challengeToken.trim()).digest('hex');
      const [challengeRows] = await db.execute(
        sql`SELECT user_id FROM pending_2fa_challenges
            WHERE token_hash = ${tokenHash}
              AND method = 'sms'
              AND expires_at > NOW()
            LIMIT 1`
      ) as unknown as [Array<{ user_id: string }>, unknown];
      if (challengeRows?.[0]?.user_id) {
        userId = challengeRows[0].user_id;
        isLoginFlow = true;
        diagLog(reqId, 'challenge_found', { isLoginFlow });
      } else {
        diagLog(reqId, 'challenge_not_found');
      }
    }

    // ── Auth path 2: session (Settings page — user already logged in) ────────
    if (!userId) {
      const auth = getAuth();
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
      }
      const session = await auth.api.getSession({ headers });
      if (session?.user?.id) {
        userId = session.user.id;
      }
    }

    if (!userId) {
      diagLog(reqId, 'auth_failed');
      return res.status(401).json({ error: 'Unauthorised' });
    }

    if (!check2faRate(ip, userId)) {
      diagLog(reqId, 'rate_limited');
      return res.status(429).json({ error: 'Too many attempts. Please wait before trying again.' });
    }

    const { code } = req.body as { code?: string };
    if (!code?.trim() || !/^\d{6}$/.test(code.trim())) {
      return res.status(400).json({ error: 'A 6-digit code is required.' });
    }

    const now = new Date();

    const rows = (await db.execute(
      sql`SELECT id, code_hash, attempts, verified_at
          FROM sms_verification_codes
          WHERE user_id = ${userId}
            AND phone LIKE '2fa:%'
            AND expires_at > ${now}
          LIMIT 1`,
    )) as unknown as [Array<{
      id: string;
      code_hash: string;
      attempts: number;
      verified_at: string | null;
    }>, unknown];

    const row = rows[0]?.[0];
    if (!row) {
      return res.status(400).json({ error: 'No active code found. Please request a new one.' });
    }

    if (row.verified_at) {
      return res.status(400).json({ error: 'This code has already been used.' });
    }

    if (row.attempts >= MAX_ATTEMPTS) {
      await db.execute(
        sql`DELETE FROM sms_verification_codes WHERE id = ${row.id}`,
      );
      return res.status(400).json({ error: 'Too many failed attempts. Please request a new code.' });
    }

    const hashed = hashCode(code.trim());

    if (hashed !== row.code_hash) {
      await db.execute(
        sql`UPDATE sms_verification_codes SET attempts = ${row.attempts + 1} WHERE id = ${row.id}`,
      );
      const remaining = MAX_ATTEMPTS - row.attempts - 1;
      return res.status(400).json({
        error: remaining > 0
          ? `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
          : 'Too many failed attempts. Please request a new code.',
      });
    }

    // ── Code is correct ──────────────────────────────────────────────────────

    // Mark code as used
    await db.execute(
      sql`UPDATE sms_verification_codes SET verified_at = ${now} WHERE id = ${row.id}`,
    );

    // Clear the pending challenge row
    await db.execute(
      sql`DELETE FROM pending_2fa_challenges WHERE user_id = ${userId} AND method = 'sms'`
    );

    // Login flow: use BetterAuth's own internal adapter to create the session
    // and setSessionCookie so the cookie is signed exactly as BetterAuth expects.
    if (isLoginFlow) {
      try {
        const auth = getAuth();
        // $context is a Promise<AuthContext> — await it to get the internal adapter.
        // createSession returns the session row directly: { id, token, userId, expiresAt, ... }
        const ctx = await (auth as unknown as { $context: Promise<{
          internalAdapter: {
            createSession: (userId: string, dontRememberMe?: boolean) => Promise<
              Record<string, unknown>
            >;
          };
          authCookies: {
            sessionToken: { name: string; attributes: Record<string, unknown> };
          };
          secret: string;
        }>}).$context;

        const sessionRow = await ctx.internalAdapter.createSession(userId, false);
        if (!sessionRow?.token) {
          throw new Error(`createSession returned no token (keys: ${Object.keys(sessionRow ?? {}).join(',')})`);
        }
        diagLog(reqId, 'session_created', { isLoginFlow: true, sessionId: String(sessionRow.id).slice(0, 8) + '…' });

        // Sign the cookie value exactly as BetterAuth's better-call does:
        //   encodeURIComponent(`${token}.${base64(HMAC-SHA256(token, secret))}`)
        const token = sessionRow.token as string;
        const secret = ctx.secret;
        const keyMaterial = new TextEncoder().encode(secret);
        const key = await crypto.subtle.importKey(
          'raw', keyMaterial,
          { name: 'HMAC', hash: 'SHA-256' },
          false, ['sign']
        );
        const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(token));
        const sig = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));
        const signedValue = encodeURIComponent(`${token}.${sig}`);

        // Cookie name: BetterAuth uses __Secure- prefix on HTTPS (both preview and production)
        const cookieName = ctx.authCookies.sessionToken.name;
        const maxAge = 7 * 24 * 60 * 60; // 7-day cookie (matches BetterAuth default)
        const isPreview = process.env.AIRO_PREVIEW === 'true';

        const cookieParts = [
          `${cookieName}=${signedValue}`,
          'Path=/',
          'HttpOnly',
          'SameSite=None',
          'Secure',
          `Max-Age=${maxAge}`,
          ...(isPreview ? ['Partitioned'] : []),
        ];
        res.setHeader('Set-Cookie', cookieParts.join('; '));
        diagLog(reqId, 'cookie_set', { cookieName, isPreview });
      } catch (sessionErr) {
        console.error('[2fa/sms/verify] session creation failed:', String((sessionErr as Error)?.message ?? sessionErr).slice(0, 120));
        diagLog(reqId, 'session_creation_failed');
        // Code is marked used — client must re-login. Return 500 so client stays on challenge screen.
        return res.status(500).json({ error: 'Session creation failed. Please try again.' });
      }
    }

    diagLog(reqId, 'success', { isLoginFlow });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[2fa/sms/verify] error (details redacted)');
    return res.status(500).json({ error: 'Verification failed.' });
  }
}
