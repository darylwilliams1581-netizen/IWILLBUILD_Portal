/**
 * Shared authentication & authorisation middleware for Express API routes.
 *
 * Usage:
 *   import { requireAuth, requireOwner, requireAdmin } from '../lib/auth-middleware.js';
 *
 *   // In entry.ts — apply to a single route:
 *   app.get('/api/foo', requireAuth, fooHandler);
 *
 *   // Or use the helpers inside a handler:
 *   const { session, profile } = await getSessionAndProfile(req, res);
 *   if (!session) return; // response already sent
 */

import type { Request, Response, NextFunction } from 'express';
import { db } from '../db/client.js';
import { profiles } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../lib/auth/auth.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuthedRequest extends Request {
  _authSession?: { user: { id: string; email: string; name: string } };
  _authProfile?: { id: number; userId: string; companyId: number; role: string; status: string };
}

// ── Core helper ───────────────────────────────────────────────────────────────

/**
 * Resolve session + profile from a request.
 * Returns null and sends the appropriate error response if auth fails.
 * Returns the session + profile on success.
 */
export async function getSessionAndProfile(
  req: Request,
  res: Response,
): Promise<{ session: { user: { id: string; email: string; name: string } }; profile: { id: number; userId: string; companyId: number; role: string; status: string } } | null> {
  const auth = getAuth();
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
  }

  const session = await auth.api.getSession({ headers });
  if (!session?.user) {
    res.status(401).json({ error: 'Unauthorised' });
    return null;
  }

  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.userId, session.user.id),
  });

  if (!profile?.companyId) {
    res.status(403).json({ error: 'No company associated with this account' });
    return null;
  }

  return {
    session: session as { user: { id: string; email: string; name: string } },
    profile: profile as { id: number; userId: string; companyId: number; role: string; status: string },
  };
}

// ── Express middleware ─────────────────────────────────────────────────────────

/**
 * requireAuth — any authenticated user with a company.
 * Attaches session + profile to req._authSession / req._authProfile.
 */
export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const result = await getSessionAndProfile(req, res);
    if (!result) return; // response already sent
    req._authSession = result.session;
    req._authProfile = result.profile;
    next();
  } catch (err) {
    console.error('requireAuth error:', err);
    res.status(500).json({ error: 'Authentication check failed' });
  }
}

/**
 * requireAdmin — user must be admin or owner.
 */
export async function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const result = await getSessionAndProfile(req, res);
    if (!result) return;
    const { role } = result.profile;
    if (role !== 'admin' && role !== 'owner') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    req._authSession = result.session;
    req._authProfile = result.profile;
    next();
  } catch (err) {
    console.error('requireAdmin error:', err);
    res.status(500).json({ error: 'Authentication check failed' });
  }
}

/**
 * requireOwner — user must be platform owner (role === 'owner').
 * Used for Owner Console and migrate endpoints.
 */
export async function requireOwner(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const result = await getSessionAndProfile(req, res);
    if (!result) return;
    if (result.profile.role !== 'owner') {
      return res.status(403).json({ error: 'Owner access required' });
    }
    req._authSession = result.session;
    req._authProfile = result.profile;
    next();
  } catch (err) {
    console.error('requireOwner error:', err);
    res.status(500).json({ error: 'Authentication check failed' });
  }
}

// ── Public route whitelist ─────────────────────────────────────────────────────

/**
 * Routes that are explicitly public — no auth required.
 * Used by the catch-all API guard in entry.ts.
 */
export const PUBLIC_API_ROUTES: Array<{ method: string; pattern: RegExp }> = [
  // Health check
  { method: 'GET',  pattern: /^\/api\/health$/ },
  // BetterAuth internal routes
  { method: 'GET',  pattern: /^\/api\/auth\// },
  { method: 'POST', pattern: /^\/api\/auth\// },
  // Signup
  { method: 'POST', pattern: /^\/api\/signup$/ },
  // Stripe webhook (verified by Stripe signature, not session)
  { method: 'POST', pattern: /^\/api\/subscription\/webhook$/ },
  // Email verification (token-based, no session)
  { method: 'POST', pattern: /^\/api\/auth\/verify-email$/ },
  { method: 'POST', pattern: /^\/api\/auth\/resend-verification$/ },
  // Password reset (token-based, no session)
  { method: 'POST', pattern: /^\/api\/auth\/forgot-password$/ },
  { method: 'POST', pattern: /^\/api\/auth\/reset-password$/ },
  { method: 'GET',  pattern: /^\/api\/auth\/validate-reset-token$/ },
  // PIN login (no session — this IS the login)
  { method: 'POST', pattern: /^\/api\/auth\/pin-login$/ },
  // OneDrive OAuth callback — Microsoft redirects here before session is re-established
  { method: 'GET',  pattern: /^\/api\/integrations\/onedrive\/callback$/ },
  // Public contact form — no auth required, spam-protected by honeypot + timing
  { method: 'POST', pattern: /^\/api\/contact$/ },
  // Legacy share link viewer — token-validated, no session required
  { method: 'GET',  pattern: /^\/api\/share\/[^/]+$/ },
  // Legacy external form completion — token-validated, no session required
  { method: 'GET',  pattern: /^\/api\/external\/form\/[^/]+$/ },
  { method: 'POST', pattern: /^\/api\/external\/form\/[^/]+$/ },
  // Document Engine share — public, token-validated
  { method: 'GET',  pattern: /^\/api\/documents\/share\/[^/]+$/ },
  { method: 'POST', pattern: /^\/api\/documents\/share\/[^/]+$/ },
  // Secure Share Links — public token resolution (no auth required)
  { method: 'GET',  pattern: /^\/api\/secure-share\/[^/]+$/ },
  { method: 'POST', pattern: /^\/api\/secure-share\/[^/]+$/ },
  // Public SWMS sign-off — token-validated, no session required
  { method: 'GET',  pattern: /^\/api\/public\/swms\/[^/]+$/ },
  { method: 'POST', pattern: /^\/api\/public\/swms\/[^/]+\/signoff$/ },
  // Public form fill — token-validated, no session required
  { method: 'GET',  pattern: /^\/api\/public\/form\/[^/]+$/ },
  { method: 'POST', pattern: /^\/api\/public\/form\/[^/]+\/submit$/ },
  // Plan Manager share validation — public, token-validated, read-only
  { method: 'GET',  pattern: /^\/api\/plan-manager\/share\/validate$/ },
  // Customer portal — token-validated, no staff session required
  { method: 'POST', pattern: /^\/api\/portal\// },
  { method: 'GET',  pattern: /^\/api\/portal\// },
  // Push notifications — VAPID public key is not sensitive
  { method: 'GET',  pattern: /^\/api\/push\/vapid-key$/ },
  // Asset Manager — public share report (token-validated)
  { method: 'GET',  pattern: /^\/api\/asset-manager\/reports\/[^/]+$/ },
];

/**
 * isPublicRoute — returns true if the request matches a public route.
 */
export function isPublicRoute(method: string, path: string): boolean {
  return PUBLIC_API_ROUTES.some(
    (r) => r.method === method.toUpperCase() && r.pattern.test(path),
  );
}
