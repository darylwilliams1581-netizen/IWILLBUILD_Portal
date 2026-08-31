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
 *   2. OR their email matches PLATFORM_OWNER_EMAIL secret (configured fallback)
 *
 * Company role ('owner' | 'admin' | 'member') is completely separate and
 * must NOT grant Owner Console access.
 *
 * ── Emergency fallback ───────────────────────────────────────────────────────
 * The PLATFORM_OWNER_EMAIL secret provides a single configured fallback email
 * for emergency access when the DB flag cannot be read.  If the secret is not
 * set the fallback is disabled and access is DB-only.  The application will
 * log a startup warning so the operator knows the fallback is inactive.
 *
 * No email address is hardcoded in this file.
 */

import type { Request, Response, NextFunction } from 'express';
import { db } from '../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../lib/auth/auth.js';
import { getSecret } from '#airo/secrets';

// ── Configured fallback email ─────────────────────────────────────────────────
// Resolved once at module load so the secret is read from the platform config
// rather than being hardcoded.  Returns an empty set when the secret is absent.
function buildOwnerEmailSet(): ReadonlySet<string> {
  const raw = getSecret('PLATFORM_OWNER_EMAIL');
  if (!raw || raw.trim() === '') {
    // Warn at startup so the operator knows the fallback is inactive.
    console.warn(
      '[platform-owner-guard] PLATFORM_OWNER_EMAIL secret is not set. ' +
        'Emergency email fallback is DISABLED — access is DB-only.',
    );
    return new Set<string>();
  }
  // Support a comma-separated list for multi-owner setups.
  const emails = raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return new Set(emails);
}

export const PLATFORM_OWNER_EMAILS: ReadonlySet<string> = buildOwnerEmailSet();

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

    // Configured email fallback — only active when PLATFORM_OWNER_EMAIL is set.
    if (PLATFORM_OWNER_EMAILS.size > 0 && PLATFORM_OWNER_EMAILS.has(email.toLowerCase())) {
      return { isPlatformOwner: true, platformRole: 'developer', userId, email };
    }

    // Read platform_role via raw SQL — column may not exist yet on fresh DBs
    try {
      const [rows] = await db.execute(
        sql`SELECT platform_role FROM profiles WHERE user_id = ${userId} LIMIT 1`,
      ) as unknown as [Array<{ platform_role: string | null }>, unknown];
      const platformRole = rows?.[0]?.platform_role ?? null;
      const isPlatformOwner = platformRole === 'developer';
      return { isPlatformOwner, platformRole, userId, email };
    } catch {
      // Column doesn't exist yet — not a platform developer
      return { isPlatformOwner: false, platformRole: null, userId, email };
    }
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
