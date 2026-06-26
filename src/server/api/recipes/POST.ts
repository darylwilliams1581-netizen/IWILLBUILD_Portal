import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { recipes, recipeLines, profiles } from '../../db/schema.js';
import { eq, count } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';
import type { ResultSetHeader } from 'mysql2';

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

    const { title, notes, lines } = req.body as { title?: string; notes?: string; lines?: RecipeLineInput[] };
    if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });

    const [countRow] = await db.select({ c: count() }).from(recipes).where(eq(recipes.companyId, profile.companyId));
    const sortOrder = (countRow?.c ?? 0);

    const result = await db.insert(recipes).values({
      companyId: profile.companyId,
      title: title.trim(),
      notes: notes?.trim() || null,
      sortOrder,
    });
    const header = result[0] as unknown as ResultSetHeader;
    const recipeId = header.insertId;

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

    const recipe = await db.query.recipes.findFirst({ where: eq(recipes.id, recipeId) });
    const savedLines = await db.query.recipeLines.findMany({ where: eq(recipeLines.recipeId, recipeId) });

    res.status(201).json({ recipe: { ...recipe, lines: savedLines } });
  } catch (err) {
    console.error('POST /api/recipes error:', err);
    res.status(500).json({ error: 'Failed to create recipe' });
  }
}
