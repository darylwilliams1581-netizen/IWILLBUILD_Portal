import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { estimates, profiles } from '../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { revokeSharesForSource } from '../../../lib/share-lifecycle.js';

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

    const existing = await db.query.estimates.findFirst({
      where: and(eq(estimates.id, estimateId), eq(estimates.companyId, profile.companyId)),
    });
    if (!existing) return res.status(404).json({ error: 'Estimate not found' });

    // Revoke all share links before deleting the source record
    await revokeSharesForSource({
      companyId: profile.companyId,
      targetType: 'estimate',
      targetId: String(estimateId),
      req,
    });

    await db.delete(estimates).where(eq(estimates.id, estimateId));

    res.json({ ok: true });
  } catch (error) {
    console.error('DELETE /api/estimates/:id error:', error);
    res.status(500).json({ error: 'Failed to delete estimate' });
  }
}
