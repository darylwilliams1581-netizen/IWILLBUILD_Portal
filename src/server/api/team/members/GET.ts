/**
 * GET /api/team/members
 * Lightweight endpoint — returns id, userId, name for all active members of the
 * caller's company. Available to any authenticated user (not admin-only) so the
 * supervisor dropdown works for all job editors.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles, user } from '../../../db/schema.js';
import { eq, and, ne } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const callerProfile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, session.user.id),
    });
    if (!callerProfile?.companyId) {
      return res.status(403).json({ error: 'No company' });
    }

    const rows = await db
      .select({
        userId: profiles.userId,
        name: user.name,
        role: profiles.role,
      })
      .from(profiles)
      .innerJoin(user, eq(profiles.userId, user.id))
      .where(
        and(
          eq(profiles.companyId, callerProfile.companyId),
          ne(profiles.status, 'inactive'),
        )
      );

    const members = rows
      .map((r) => ({ userId: r.userId, name: r.name ?? 'Unknown', role: r.role }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return res.json({ members });
  } catch (e) {
    console.error('GET /api/team/members error:', e);
    return res.status(500).json({ error: 'Failed to load members' });
  }
}
