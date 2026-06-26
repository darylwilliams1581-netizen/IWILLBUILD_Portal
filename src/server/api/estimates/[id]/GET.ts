import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { estimates, estimateLines, profiles } from '../../../db/schema.js';
import { eq, and, asc } from 'drizzle-orm';
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

    const estimateId = parseInt(String(req.params.id), 10);
    if (isNaN(estimateId)) return res.status(400).json({ error: 'Invalid estimate ID' });

    const estimate = await db.query.estimates.findFirst({
      where: and(eq(estimates.id, estimateId), eq(estimates.companyId, profile.companyId)),
    });
    if (!estimate) return res.status(404).json({ error: 'Estimate not found' });

    const lines = await db
      .select()
      .from(estimateLines)
      .where(eq(estimateLines.estimateId, estimateId))
      .orderBy(asc(estimateLines.lineOrder), asc(estimateLines.id));

    res.json({ estimate, lines });
  } catch (error) {
    console.error('GET /api/estimates/:id error:', error);
    res.status(500).json({ error: 'Failed to fetch estimate' });
  }
}
