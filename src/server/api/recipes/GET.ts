import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { recipes, recipeLines, profiles } from '../../db/schema.js';
import { eq, asc, inArray } from 'drizzle-orm';
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

    const recipeRows = await db
      .select()
      .from(recipes)
      .where(eq(recipes.companyId, profile.companyId))
      .orderBy(asc(recipes.sortOrder), asc(recipes.id));

    let lineRows: (typeof recipeLines.$inferSelect)[] = [];
    if (recipeRows.length > 0) {
      const ids = recipeRows.map((r) => r.id);
      lineRows = await db
        .select()
        .from(recipeLines)
        .where(inArray(recipeLines.recipeId, ids))
        .orderBy(asc(recipeLines.lineOrder));
    }

    // Group lines by recipeId
    const linesByRecipe = new Map<number, typeof lineRows>();
    for (const line of lineRows) {
      if (!linesByRecipe.has(line.recipeId)) linesByRecipe.set(line.recipeId, []);
      linesByRecipe.get(line.recipeId)!.push(line);
    }

    const result = recipeRows.map((r) => ({
      ...r,
      lines: linesByRecipe.get(r.id) ?? [],
    }));

    res.json({ recipes: result });
  } catch (err) {
    console.error('GET /api/recipes error:', err);
    res.status(500).json({ error: 'Failed to fetch recipes' });
  }
}
