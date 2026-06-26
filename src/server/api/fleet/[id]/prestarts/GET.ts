import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { fleetPrestarts, fleetAssets, profiles } from '../../../../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';

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

    const assetId = parseInt(String(req.params.id), 10);
    if (isNaN(assetId)) return res.status(400).json({ error: 'Invalid asset ID' });

    const asset = await db.query.fleetAssets.findFirst({
      where: and(eq(fleetAssets.id, assetId), eq(fleetAssets.companyId, profile.companyId)),
    });
    if (!asset) return res.status(404).json({ error: 'Asset not found' });

    const prestarts = await db
      .select()
      .from(fleetPrestarts)
      .where(and(eq(fleetPrestarts.assetId, assetId), eq(fleetPrestarts.companyId, profile.companyId)))
      .orderBy(desc(fleetPrestarts.createdAt))
      .limit(50);

    res.json({ prestarts });
  } catch (error) {
    console.error('GET /api/fleet/:id/prestarts error:', error);
    res.status(500).json({ error: 'Failed to fetch prestarts' });
  }
}
