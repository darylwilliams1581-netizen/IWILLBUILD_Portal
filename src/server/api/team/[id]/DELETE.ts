import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, (Array.isArray(v) ? v[0] : v) as string);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const callerProfile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, session.user.id),
    });
    if (!callerProfile?.companyId) return res.status(403).json({ error: 'No company' });
    if (callerProfile.role !== 'admin' && callerProfile.role !== 'owner') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const targetId = parseInt(req.params.id as string, 10);
    if (isNaN(targetId)) return res.status(400).json({ error: 'Invalid ID' });

    const target = await db.query.profiles.findFirst({
      where: eq(profiles.id, targetId),
    });
    if (!target || target.companyId !== callerProfile.companyId) {
      return res.status(404).json({ error: 'Member not found' });
    }

    // Prevent self-deletion
    if (target.userId === session.user.id) {
      return res.status(400).json({ error: 'You cannot remove yourself' });
    }

    // Set status to inactive rather than hard delete (preserves audit trail)
    await db.update(profiles).set({ status: 'inactive' }).where(eq(profiles.id, targetId));

    res.json({ ok: true });
  } catch (error) {
    console.error('DELETE /api/team/:id error:', error);
    res.status(500).json({ error: 'Failed to remove member' });
  }
}
