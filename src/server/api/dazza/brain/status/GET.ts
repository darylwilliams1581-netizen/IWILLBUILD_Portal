/**
 * GET /api/dazza/brain/status
 * Returns brain stats + pending hive entries for the admin panel.
 * Admin/Owner only.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { derivePermissions, resolveEffectiveCompany } from '../../../../lib/dazza-context.js';
import { getBrainStatus } from '../../../../lib/annette-brain.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const permissions = derivePermissions(profile);
    if (!permissions.isAdmin) return res.status(403).json({ error: 'Admin access required' });
    if (!permissions.canDazzaAi) return res.status(403).json({ error: 'Dazza AI not enabled' });

    const { supportCompanyId: reqSupportId } = req.query as { supportCompanyId?: string };
    const { effectiveCompanyId } = await resolveEffectiveCompany(
      permissions.isOwner,
      profile.companyId,
      reqSupportId ? parseInt(reqSupportId) : null,
    );

    const status = await getBrainStatus(effectiveCompanyId);
    res.json(status);
  } catch (error) {
    console.error('GET /api/dazza/brain/status error:', error);
    res.status(500).json({ error: 'Failed to load brain status' });
  }
}
