/**
 * DELETE /api/fleet/:id
 * Permanently deletes a fleet asset. Admin/owner only.
 * Cascades to prestarts and driver sessions via FK ON DELETE CASCADE.
 */
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

    // Only admin or owner can delete assets
    if (profile.role !== 'admin' && profile.role !== 'owner') {
      return res.status(403).json({ error: 'Only admins and owners can delete fleet assets' });
    }

    const assetId = parseInt(req.params.id, 10);
    if (isNaN(assetId)) return res.status(400).json({ error: 'Invalid asset id' });

    // Verify asset belongs to this company
    const existing = await db.query.fleetAssets.findFirst({
      where: and(eq(fleetAssets.id, assetId), eq(fleetAssets.companyId, profile.companyId)),
    });
    if (!existing) return res.status(404).json({ error: 'Asset not found' });

    await db.delete(fleetAssets).where(
      and(eq(fleetAssets.id, assetId), eq(fleetAssets.companyId, profile.companyId))
    );

    res.json({ ok: true });
  } catch (error) {
    console.error('DELETE /api/fleet/:id error:', error);
    res.status(500).json({ error: 'Failed to delete asset' });
  }
}
