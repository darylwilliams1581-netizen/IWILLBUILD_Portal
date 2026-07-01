/**
 * platform-owner-guard.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Middleware and helper for IWILLBUILD platform-developer access.
 *
 * Platform developers are distinct from company owners/admins.
 * They have access to the Owner Console (all companies, all users, system AI,
 * starter packs, storage, subscriptions, support tools).
 *
 * A user is a platform developer if:
 *   1. profiles.platform_role = 'developer'   (preferred — DB flag)
 *   2. OR their email is in PLATFORM_OWNER_EMAILS (emergency fallback)
 *
 * Company role ('owner' | 'admin' | 'member') is completely separate and
 * must NOT grant Owner Console access.
 */

import type { Request, Response, NextFunction } from 'express';
import { db } from '../db/client.js';
import { profiles } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../lib/auth/auth.js';

// ── Emergency fallback emails ─────────────────────────────────────────────────
// These always have platform developer access regardless of DB flag.
export const PLATFORM_OWNER_EMAILS: ReadonlySet<string> = new Set([
  'daryl.williams@energyq.com.au',
  'daryl.williams1581@gmail.com',
]);

// ── Core check ────────────────────────────────────────────────────────────────

export interface PlatformOwnerInfo {
  isPlatformOwner: boolean;
  platformRole: string | null;
  userId: string;
  email: string;
}

/**
 * Resolve whether the authenticated user is a platform developer.
 * Returns null if the request is unauthenticated.
 */
export async function getPlatformOwnerInfo(req: Request): Promise<PlatformOwnerInfo | null> {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return null;

    const email = session.user.email ?? '';
    const userId = session.user.id;

    // Emergency email fallback
    if (PLATFORM_OWNER_EMAILS.has(email.toLowerCase())) {
      return { isPlatformOwner: true, platformRole: 'developer', userId, email };
    }

    // DB flag check
    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, userId),
    });

    const platformRole = (profile as unknown as { platformRole?: string | null })?.platformRole ?? null;
    const isPlatformOwner = platformRole === 'developer';

    return { isPlatformOwner, platformRole, userId, email };
  } catch {
    return null;
  }
}

// ── Express middleware ────────────────────────────────────────────────────────

/**
 * requirePlatformOwner
 * Blocks requests from non-platform-developers with HTTP 403.
 * Apply to ALL owner-console API routes.
 */
export async function requirePlatformOwner(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const info = await getPlatformOwnerInfo(req);

  if (!info) {
    res.status(401).json({ error: 'Unauthorised' });
    return;
  }

  if (!info.isPlatformOwner) {
    res.status(403).json({
      error: 'forbidden',
      message: 'Owner Console access is restricted to IWILLBUILD platform developers.',
    });
    return;
  }

  next();
}
