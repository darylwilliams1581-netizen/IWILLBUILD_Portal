import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { profiles, companies } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';
import { PLATFORM_OWNER_EMAILS } from '../../lib/platform-owner-guard.js';

/** Safe server-side auth log — never logs passwords or tokens */
function authLog(event: string, data?: Record<string, unknown>) {
  try {
    console.info(JSON.stringify({ event: `server.auth.${event}`, ...data, ts: Date.now() }));
  } catch { /* best-effort */ }
}

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) {
      authLog('me.unauthenticated', { ip: req.ip });
      return res.status(401).json({ error: 'Unauthorised' });
    }

    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, session.user.id),
    });

    let company = null;
    if (profile?.companyId) {
      company = await db.query.companies.findFirst({
        where: eq(companies.id, profile.companyId),
      });
    }

    // Resolve platform owner status:
    // 1. DB flag (platform_role = 'owner')
    // 2. Emergency email fallback
    const email = session.user.email ?? '';
    const dbPlatformRole = (profile as unknown as { platformRole?: string | null })?.platformRole ?? null;
    const isPlatformOwner =
      dbPlatformRole === 'owner' ||
      PLATFORM_OWNER_EMAILS.has(email.toLowerCase());
    const platformRole = isPlatformOwner ? 'owner' : (dbPlatformRole ?? null);

    authLog('me.ok', {
      userId: session.user.id,
      role: profile?.role ?? 'none',
      companyId: profile?.companyId ?? null,
      status: profile?.status ?? 'none',
      isPlatformOwner,
    });

    res.json({
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
      },
      profile: profile ?? null,
      company: company ?? null,
      // Platform owner fields — separate from company role
      isPlatformOwner,
      platformRole,
    });
  } catch (error) {
    authLog('me.error', { errorMsg: String((error as Error)?.message ?? error).slice(0, 120) });
    console.error('GET /api/me error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
}

