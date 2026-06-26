import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { recipes, recipeLines, profiles } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';

interface RecipeLineInput {
  description: string;
  quantity?: string;
  unit?: string;
  rate?: string;
  lineOrder?: number;
}

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

    const { title, notes, lines } = req.body as { title?: string; notes?: string; lines?: RecipeLineInput[] };
    if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });

    await db.update(recipes).set({
      title: title.trim(),
      notes: notes?.trim() || null,
    }).where(eq(recipes.id, recipeId));

    // Replace all lines
    await db.delete(recipeLines).where(eq(recipeLines.recipeId, recipeId));
    if (lines && lines.length > 0) {
      await db.insert(recipeLines).values(
        lines.map((l, i) => ({
          recipeId,
          description: l.description || '',
          quantity: l.quantity || '1',
          unit: l.unit || null,
          rate: l.rate || '0',
          lineOrder: l.lineOrder ?? i,
        }))
      );
    }

    const updated = await db.query.recipes.findFirst({ where: eq(recipes.id, recipeId) });
    const savedLines = await db.query.recipeLines.findMany({ where: eq(recipeLines.recipeId, recipeId) });

    res.json({ recipe: { ...updated, lines: savedLines } });
  } catch (err) {
    console.error('PUT /api/recipes/:id error:', err);
    res.status(500).json({ error: 'Failed to update recipe' });
  }
}
