import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { fleetAssets, profiles } from '../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
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

    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, session.user.id),
    });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    const asset = await db.query.fleetAssets.findFirst({
      where: and(eq(fleetAssets.id, id), eq(fleetAssets.companyId, profile.companyId)),
    });
    if (!asset) return res.status(404).json({ error: 'Asset not found' });

    res.json({ asset });
  } catch (error) {
    console.error('GET /api/fleet/:id error:', error);
    res.status(500).json({ error: 'Failed to fetch asset' });
  }
}
