import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { costGuideItems, profiles } from '../../../db/schema.js';
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

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const itemId = parseInt(req.params.id, 10);
    const existing = await db.query.costGuideItems.findFirst({ where: eq(costGuideItems.id, itemId) });
    if (!existing || existing.companyId !== profile.companyId) return res.status(404).json({ error: 'Not found' });

    const { description, unit, rate } = req.body as { description?: string; unit?: string; rate?: string };
    if (!description?.trim()) return res.status(400).json({ error: 'Description is required' });

    await db.update(costGuideItems).set({
      description: description.trim(),
      unit: unit?.trim() || null,
      rate: rate?.trim() || '0',
    }).where(eq(costGuideItems.id, itemId));

    const updated = await db.query.costGuideItems.findFirst({ where: eq(costGuideItems.id, itemId) });
    res.json({ item: updated });
  } catch (err) {
    console.error('PUT /api/cost-guide/:id error:', err);
    res.status(500).json({ error: 'Failed to update cost guide item' });
  }
}
