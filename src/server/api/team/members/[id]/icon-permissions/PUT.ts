/**
 * PUT /api/team/members/:id/icon-permissions
 * Body: { allowedKeys: string[] }
 * Saves the home_icon_permissions for a team member.
 * Caller must be owner or admin of the same company.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { profiles } from '../../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { ALL_HOME_ICON_KEYS } from '../../../../../lib/homeIconKeys.js';

const VALID_KEYS = new Set(ALL_HOME_ICON_KEYS);

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

    // Owners/admins always have full access — don't restrict them
    if (['owner', 'admin', 'platform_owner'].includes(targetProfile.role ?? '')) {
      return res.status(400).json({ error: 'Cannot restrict icon access for owners or admins' });
    }

    const { allowedKeys } = req.body as { allowedKeys?: unknown };
    if (!Array.isArray(allowedKeys)) {
      return res.status(400).json({ error: 'allowedKeys must be an array' });
    }

    // Sanitise — only accept known, non-comingSoon keys
    const sanitised = (allowedKeys as unknown[])
      .filter((k): k is string => typeof k === 'string' && VALID_KEYS.has(k));

    await db
      .update(profiles)
      .set({ homeIconPermissions: JSON.stringify(sanitised) })
      .where(eq(profiles.userId, targetUserId));

    return res.json({ ok: true, allowedKeys: sanitised });
  } catch (e) {
    console.error('PUT /api/team/members/:id/icon-permissions error:', e);
    return res.status(500).json({ error: 'Failed to save icon permissions' });
  }
}
