import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { estimatingTakeoffPads, profiles } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, (Array.isArray(v) ? v[0] : v) as string);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const { title = '', notes = '' } = req.body as { title?: string; notes?: string };

    const existing = await db.query.estimatingTakeoffPads.findFirst({
      where: and(
        eq(estimatingTakeoffPads.companyId, profile.companyId),
        eq(estimatingTakeoffPads.userId, session.user.id)
      ),
    });

    if (existing) {
      await db
        .update(estimatingTakeoffPads)
        .set({ title, notes, updatedAt: new Date() })
        .where(eq(estimatingTakeoffPads.id, existing.id));
      res.json({ ok: true, updatedAt: new Date().toISOString() });
    } else {
      await db.insert(estimatingTakeoffPads).values({
        companyId: profile.companyId,
        userId: session.user.id,
        title,
        notes,
      });
      res.json({ ok: true, updatedAt: new Date().toISOString() });
    }
  } catch (err) {
    console.error('PUT /api/takeoff-pad error:', err);
    res.status(500).json({ error: 'Failed to save take-off pad' });
  }
}
