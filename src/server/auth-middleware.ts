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

  // Log the auth action (safe — no passwords or tokens)
  console.info(JSON.stringify({
    event: 'server.auth.request',
    method: req.method,
    path: req.path,
    isSignIn,
    isSignOut,
    ts: Date.now(),
  }));

  try {
    const auth = getAuth();
    const webResponse = await auth.handler(toWebRequest(req));

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
            ipAddress: getIp(req as unknown as { headers: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string } }),
            userAgent: getUserAgent(req as unknown as { headers: Record<string, string | string[] | undefined> }),
          });
        }
      } catch {
        // Non-critical — don't block the response
      }
    }

    // If sign-in failed (4xx), log the failed attempt
    if (isSignIn && webResponse.status >= 400 && webResponse.status < 500) {
      try {
        const emailAttempted = (req.body as Record<string, unknown>)?.email as string | undefined;
        const clone = webResponse.clone();
        const body = await clone.json().catch(() => null) as Record<string, unknown> | null;
        const reason = (body?.message as string) || (body?.error as string) || `HTTP ${webResponse.status}`;
        void logActivity({
          eventType: 'login_failed',
          success: false,
          email: emailAttempted ?? null,
          ipAddress: getIp(req as unknown as { headers: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string } }),
          userAgent: getUserAgent(req as unknown as { headers: Record<string, string | string[] | undefined> }),
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
          ipAddress: getIp(req as unknown as { headers: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string } }),
          userAgent: getUserAgent(req as unknown as { headers: Record<string, string | string[] | undefined> }),
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
