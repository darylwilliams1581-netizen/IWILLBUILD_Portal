import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { recipes, profiles } from '../../../db/schema.js';
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

    const recipeId = parseInt(req.params.id, 10);
    const existing = await db.query.recipes.findFirst({ where: eq(recipes.id, recipeId) });
    if (!existing || existing.companyId !== profile.companyId) return res.status(404).json({ error: 'Not found' });

    await db.delete(recipes).where(eq(recipes.id, recipeId));
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/recipes/:id error:', err);
    res.status(500).json({ error: 'Failed to delete recipe' });
  }
}
