/**
 * GET /api/team/members/:id/icon-permissions
 * Returns the home_icon_permissions array for a team member.
 * Caller must be owner or admin of the same company.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { profiles } from '../../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';

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
    if (!callerProfile?.companyId) return res.status(403).json({ error: 'No company' });
    if (!['owner', 'admin', 'platform_owner'].includes(callerProfile.role ?? '')) {
      return res.status(403).json({ error: 'Owner or admin access required' });
    }

    const targetUserId = req.params.id;
    const targetProfile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, targetUserId),
    });
    if (!targetProfile || targetProfile.companyId !== callerProfile.companyId) {
      return res.status(404).json({ error: 'Member not found' });
    }

    let allowedKeys: string[] | null = null;
    if (targetProfile.homeIconPermissions) {
      try {
        allowedKeys = JSON.parse(targetProfile.homeIconPermissions) as string[];
      } catch { allowedKeys = null; }
    }

    return res.json({ allowedKeys });
  } catch (e) {
    console.error('GET /api/team/members/:id/icon-permissions error:', e);
    return res.status(500).json({ error: 'Failed to load icon permissions' });
  }
}
