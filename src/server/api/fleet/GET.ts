import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { fleetAssets, profiles } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';

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

    const showArchived = req.query.archived === 'true';

    const assets = await db
      .select()
      .from(fleetAssets)
      .where(
        showArchived
          ? eq(fleetAssets.companyId, profile.companyId)
          : and(eq(fleetAssets.companyId, profile.companyId), eq(fleetAssets.archived, false)),
      )
      .orderBy(fleetAssets.name);

    res.json({ assets });
  } catch (error) {
    console.error('GET /api/fleet error:', error);
    res.status(500).json({ error: 'Failed to fetch fleet' });
  }
}
