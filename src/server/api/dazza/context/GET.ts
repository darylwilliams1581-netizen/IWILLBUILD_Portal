/**
 * GET /api/dazza/context
 * ─────────────────────────────────────────────────────────────────────────────
 * Returns all Dazza context for the authenticated user.
 * Context is ALWAYS built server-side from the session — never from the client.
 *
 * Security:
 *  - permDazzaAi checked before any data is loaded
 *  - companyId comes from session profile only
 *  - Support Mode: owners may pass ?supportCompanyId=N; verified server-side
 *  - All module data is gated by individual permission flags
 *  - seeDollars enforced in buildDazzaContext()
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import {
  derivePermissions,
  buildDazzaContext,
  resolveEffectiveCompany,
} from '../../../lib/dazza-context.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, session.user.id),
    });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const permissions = derivePermissions(profile);

    // ── Dazza AI access gate ──────────────────────────────────────────────────
    if (!permissions.canDazzaAi) {
      return res.status(403).json({ error: 'Dazza AI access not permitted for your role.' });
    }

    // ── System AI is owner-only ───────────────────────────────────────────────
    if (!permissions.isOwner) {
      return res.status(403).json({ error: 'System AI is restricted to the platform owner.' });
    }

    // ── Support Mode resolution (owners only) ─────────────────────────────────
    const requestedSupportId = req.query.supportCompanyId
      ? parseInt(req.query.supportCompanyId as string, 10)
      : null;

    const { supportCompanyId } = await resolveEffectiveCompany(
      permissions.isOwner,
      profile.companyId,
      requestedSupportId,
    );

    // ── Build context server-side ─────────────────────────────────────────────
    const ctx = await buildDazzaContext(
      session.user.id,
      session.user.email,
      session.user.name,
      profile.role ?? 'worker',
      profile.companyId,
      permissions,
      supportCompanyId,
    );

    res.json(ctx);
  } catch (error) {
    console.error('GET /api/dazza/context error:', error);
    res.status(500).json({ error: 'Failed to load Dazza context' });
  }
}
