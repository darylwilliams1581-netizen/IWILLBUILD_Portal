import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { costGuideItems, profiles } from '../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';
import { getPlanLimits, getCompanyPlan, checkLimit } from '../../lib/plan-limits.js';
import type { ResultSetHeader } from 'mysql2';

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

    const { description, unit, rate } = req.body as { description?: string; unit?: string; rate?: string };
    if (!description?.trim()) return res.status(400).json({ error: 'Description is required' });

    // ── Plan limit check ──────────────────────────────────────────────────────
    const plan = await getCompanyPlan(profile.companyId);
    const limits = await getPlanLimits(profile.companyId, plan);

    const [countRow] = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM cost_guide_items WHERE company_id = ${profile.companyId}`
    ) as unknown as [Array<{ cnt: number }>, unknown];
    const currentCount = Number(countRow?.[0]?.cnt ?? 0);

    const limitCheck = checkLimit(currentCount, limits.costGuideItems, 'Cost Guide Items');
    if (!limitCheck.allowed) {
      return res.status(403).json({ code: limitCheck.code, error: limitCheck.message });
    }

    const sortOrder = currentCount;

    const result = await db.insert(costGuideItems).values({
      companyId: profile.companyId,
      description: description.trim(),
      unit: unit?.trim() || null,
      rate: rate?.trim() || '0',
      sortOrder,
    });
    const header = result[0] as unknown as ResultSetHeader;

    const item = await db.query.costGuideItems.findFirst({ where: eq(costGuideItems.id, header.insertId) });
    res.status(201).json({ item });
  } catch (err) {
    console.error('POST /api/cost-guide error:', err);
    res.status(500).json({ error: 'Failed to create cost guide item' });
  }
}
