/**
 * Express middleware: require that the authenticated user's email is verified.
 *
 * Usage:
 *   import { requireVerified } from '@/server/lib/require-verified';
 *   app.get('/api/protected', requireAuth, requireVerified, handler);
 *
 * Returns 403 with code "email_not_verified" if the user is authenticated
 * but has not yet verified their email.
 *
 * NOTE: This is intentionally a soft gate — it only blocks API calls.
 * The frontend ProtectedRoute handles the UI redirect to /verify-required.
 */

import type { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { user } from '../db/schema.js';
import { getAuth } from '../../lib/auth/auth.js';

export async function requireVerified(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, (Array.isArray(v) ? v[0] : v) as string);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user?.id) {
      // Not authenticated — let the normal auth middleware handle it
      return next();
    }

    const [row] = await db
      .select({ emailVerified: user.emailVerified })
      .from(user)
      .where(eq(user.id, session.user.id))
      .limit(1);

    if (!row?.emailVerified) {
      return res.status(403).json({
        code: 'email_not_verified',
        error: 'Please verify your email address before accessing this feature.',
      });
    }

    return next();
  } catch (err) {
    console.error('require-verified.error', err);
    return next(); // fail open — don't block on middleware error
  }
}
