/**
 * BetterAuth Express Middleware
 *
 * Single catch-all handler for ALL /api/auth/* requests.
 * BetterAuth routes internally (CSRF, sessions, sign-in, sign-up,
 * OAuth callbacks, token refresh, etc.)
 *
 * Called by the dynamic route files under src/server/api/auth/[action]/.
 */
import type { Request, Response } from 'express';
import { getAuth } from '@/lib/auth/auth';
import { toWebRequest, sendWebResponse } from '@/lib/auth/express-adapter';
import { tryClearStaleSession } from '@/lib/auth/session-cookies';
import { recordLoginEvent } from '@/server/activity-tracker';
import { logActivity, getIp, getUserAgent } from '@/server/lib/activity-log';
import { checkLoginRate } from '@/server/lib/signup-rate-limiter';
import {
  createChallenge,
  setChallengeCookie,
} from '@/server/lib/pending-2fa';
import { db } from '@/server/db/client';
import { sql } from 'drizzle-orm';

export async function authHandler(req: Request, res: Response) {
  // Stale-session recovery escape hatch (`?clearCookies=1`). A stale
  // `better-auth.session_token` makes `useSession()` resolve to an error/pending
  // state with no thrown error to surface, leaving the app blank; the cookie is
  // HttpOnly so only the server can expire it. Handled before getAuth() so it
  // still works when auth/db is itself unavailable.
  if (tryClearStaleSession(req, res, { preview: process.env.AIRO_PREVIEW === 'true' })) {
    return;
  }

  // Detect sign-in so we can record a login event after success
  const isSignIn =
    req.method === 'POST' &&
    (req.path.includes('sign-in') || req.path.includes('signin'));

  const isSignOut =
    req.method === 'POST' &&
    (req.path.includes('sign-out') || req.path.includes('signout'));

  const ip = getIp(req as unknown as { headers: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string } });
  const ua = getUserAgent(req as unknown as { headers: Record<string, string | string[] | undefined> });

  // Rate-limit login attempts before hitting BetterAuth
  if (isSignIn) {
    const emailAttempted = (req.body as Record<string, unknown>)?.email as string | undefined;
    if (!checkLoginRate(ip, emailAttempted)) {
      void logActivity({
        eventType: 'rate_limited_login',
        success: false,
        email: emailAttempted ?? null,
        ipAddress: ip,
        userAgent: ua,
        reason: 'Too many login attempts from this IP',
      });
      res.status(429).json({ error: 'Too many login attempts. Please wait a few minutes before trying again.' });
      return;
    }
  }

  // Log the auth action (safe — no passwords or tokens)
  console.info(JSON.stringify({
    event: 'server.auth.request',
    method: req.method,
    path: req.path,
    isSignIn,
    isSignOut,
    ts: Date.now(),
  }));

  // Helper: run the BetterAuth handler with one automatic retry on MySQL
  // idle-connection errors (ER_CLIENT_INTERACTION_TIMEOUT / ER_QUERY_INTERRUPTED).
  //
  // Two failure modes:
  //   1. BetterAuth throws  — caught in the catch block below.
  //   2. BetterAuth catches the DB error internally and returns a 500 web
  //      response — we detect that by inspecting the response status and body.
  //
  // Both are retried once. The retry is safe: get-session is read-only, and
  // sign-in is idempotent from the client's POV.
  const DB_ERROR_STRINGS = [
    'ER_CLIENT_INTERACTION_TIMEOUT',
    'ER_QUERY_INTERRUPTED',
    'packets out of order',
    'inactivity',
    'ECONNRESET',
    'PROTOCOL_CONNECTION_LOST',
  ];

  function isDbConnectionMsg(msg: string): boolean {
    return DB_ERROR_STRINGS.some((s) => msg.includes(s));
  }

  async function runAuthHandler(retries = 1): Promise<Response> {
    try {
      const auth = getAuth();
      const webResponse = await auth.handler(toWebRequest(req));

      // BetterAuth sometimes swallows the MySQL error and returns a 500.
      // Detect that by peeking at the response body on 500s for get-session.
      if (webResponse.status === 500 && retries > 0) {
        try {
          const clone = webResponse.clone();
          const text = await clone.text().catch(() => '');
          if (isDbConnectionMsg(text) || text === '' || text === 'null') {
            console.warn('[auth-middleware] BetterAuth returned 500 (likely DB connection), retrying once…');
            await new Promise<void>((r) => setTimeout(r, 250));
            return runAuthHandler(retries - 1);
          }
        } catch {
          // Can't read body — fall through and return the 500 as-is
        }
      }

      return webResponse;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (isDbConnectionMsg(msg) && retries > 0) {
        console.warn('[auth-middleware] DB connection error on auth handler, retrying once…');
        await new Promise<void>((r) => setTimeout(r, 250));
        return runAuthHandler(retries - 1);
      }
      throw err;
    }
  }

  try {
    const webResponse = await runAuthHandler();

    // Log the response status for sign-in and sign-out
    if (isSignIn || isSignOut) {
      console.info(JSON.stringify({
        event: isSignIn ? 'server.auth.signin.response' : 'server.auth.signout.response',
        status: webResponse.status,
        ts: Date.now(),
      }));
    }

    // If sign-in succeeded (2xx), record the login event
    if (isSignIn && webResponse.status >= 200 && webResponse.status < 300) {
      try {
        // Clone to read body without consuming the original
        const clone = webResponse.clone();
        const body = await clone.json().catch(() => null);
        const userId: string | undefined = body?.user?.id;
        const email: string | undefined = body?.user?.email;
        if (userId) {
          void recordLoginEvent(userId);
          void logActivity({
            eventType: 'login_success',
            success: true,
            userId,
            email: email ?? null,
            ipAddress: ip,
            userAgent: ua,
          });

          // ── 2FA intercept ─────────────────────────────────────────────────
          // If the user has TOTP or SMS 2FA enabled, we must NOT complete the
          // sign-in. Instead: create a server-side pending challenge, set the
          // challenge cookie, and return 403 TWO_FACTOR_REQUIRED.
          // The client must then call /api/me/2fa/verify (TOTP) or
          // /api/me/2fa/sms/verify (SMS) to complete the login.
          try {
            const [twoFaRows] = await db.execute(
              sql`SELECT two_factor_enabled, sms_2fa_enabled
                  FROM \`user\` WHERE id = ${userId} LIMIT 1`
            ) as unknown as [Array<{ two_factor_enabled: number; sms_2fa_enabled: number }>, unknown];

            const twoFaRow = twoFaRows?.[0];
            const totpEnabled = !!twoFaRow?.two_factor_enabled;
            const smsEnabled  = !!twoFaRow?.sms_2fa_enabled;

            if (totpEnabled || smsEnabled) {
              const method = totpEnabled ? 'totp' : 'sms';

              // Create a server-side pending challenge (expires in 10 min)
              const { token } = await createChallenge(userId, method);

              // Revoke the BetterAuth session that was just created — we must
              // not let it persist until 2FA is complete.
              try {
                const sessionToken: string | undefined = body?.token as string | undefined;
                if (sessionToken) {
                  const auth = getAuth();
                  // revokeSession expects the raw session token
                  await auth.api.revokeSession({
                    body:    { token: sessionToken },
                    headers: new Headers(),
                  }).catch(() => null);
                }
              } catch { /* non-critical — challenge expiry is the safety net */ }

              // Set the challenge cookie and return TWO_FACTOR_REQUIRED
              setChallengeCookie(res, token);
              res.status(403).json({
                error:  'Two-factor authentication required.',
                code:   'TWO_FACTOR_REQUIRED',
                method,
              });
              return;
            }
          } catch (twoFaErr) {
            // 2FA check failed — log and fall through to complete login normally.
            // This is a fail-open decision: if we can't read the 2FA flag we
            // don't lock users out, but we do log it for investigation.
            console.error('[auth-middleware] 2FA intercept check failed:', twoFaErr instanceof Error ? twoFaErr.message : String(twoFaErr));
          }
          // ── end 2FA intercept ─────────────────────────────────────────────

          // Check must_change_password — if set, inject flag into response
          try {
            const [rows] = await db.execute(
              sql`SELECT must_change_password FROM profiles WHERE user_id = ${userId} LIMIT 1`
            ) as unknown as [Array<{ must_change_password: number | null }>, unknown];
            const mustChange = rows?.[0]?.must_change_password;
            if (mustChange) {
              // Intercept: return 200 with mustChangePassword flag so the client redirects
              const responseBody = await webResponse.clone().json().catch(() => ({}));
              res.status(200).json({ ...responseBody, mustChangePassword: true });
              return;
            }
          } catch { /* non-critical — don't block login */ }
        }
      } catch {
        // Non-critical — don't block the response
      }
    }

    // If sign-in failed (4xx), classify and log the failed attempt
    if (isSignIn && webResponse.status >= 400 && webResponse.status < 500) {
      try {
        const emailAttempted = (req.body as Record<string, unknown>)?.email as string | undefined;
        const clone = webResponse.clone();
        const body = await clone.json().catch(() => null) as Record<string, unknown> | null;
        const reason = ((body?.message as string) || (body?.error as string) || `HTTP ${webResponse.status}`).toLowerCase();

        // Classify the failure type based on BetterAuth error messages
        let eventType = 'login_failed';
        if (reason.includes('not verified') || reason.includes('email not verified') || reason.includes('verify your email')) {
          eventType = 'login_blocked_unverified';
        } else if (reason.includes('inactive') || reason.includes('deactivated') || reason.includes('disabled') || reason.includes('banned')) {
          eventType = 'login_blocked_inactive';
        }

        void logActivity({
          eventType,
          success: false,
          email: emailAttempted ?? null,
          ipAddress: ip,
          userAgent: ua,
          reason: reason.slice(0, 500),
        });
      } catch {
        // Non-critical
      }
    }

    // If sign-out succeeded, log it
    if (isSignOut && webResponse.status >= 200 && webResponse.status < 300) {
      try {
        const auth = getAuth();
        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers)) {
          if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
        }
        const session = await auth.api.getSession({ headers }).catch(() => null);
        void logActivity({
          eventType: 'logout',
          success: true,
          userId: session?.user?.id ?? null,
          email: session?.user?.email ?? null,
          ipAddress: ip,
          userAgent: ua,
        });
      } catch {
        // Non-critical
      }
    }

    await sendWebResponse(webResponse, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message.includes('BETTER_AUTH_SECRET')) {
      console.error(JSON.stringify({ event: 'auth.error', reason: 'missing_secret' }));
      res.status(503).json({
        error: 'Authentication not configured. Set BETTER_AUTH_SECRET via requestSecrets().',
      });
      return;
    }

    if (message.includes('Database not configured') || message.includes('SQLITE') || message.includes('ECONNREFUSED')) {
      console.error(JSON.stringify({ event: 'auth.error', reason: 'database_unavailable' }));
      res.status(503).json({
        error: 'Database not available. Ensure the database skill is installed and configured.',
      });
      return;
    }

    if (message.includes("doesn't exist") || message.includes('no such table') || message.includes('relation') || message.includes('ER_NO_SUCH_TABLE')) {
      console.error(JSON.stringify({ event: 'auth.error', reason: 'missing_tables', error: message }));
      res.status(503).json({
        error: 'Auth database tables not found. Run migrations: npm run db:generate && npm run db:migrate',
      });
      return;
    }

    console.error(JSON.stringify({ event: 'auth.middleware.error', path: req.path, error: message }));
    res.status(500).json({ error: 'Authentication request failed' });
  }
}
