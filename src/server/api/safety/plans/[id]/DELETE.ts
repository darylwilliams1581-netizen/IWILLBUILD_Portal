/**
 * DELETE /api/safety/plans/:id
 * Hard-deletes a safety plan (company-scoped).
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const planId = Number(req.params.id);
    if (!planId) return res.status(400).json({ error: 'Invalid plan ID' });

    // Verify ownership before deleting
    const [rows] = await db.execute(
      sql`SELECT id FROM safety_plans WHERE id = ${planId} AND company_id = ${profile.companyId} LIMIT 1`
    ) as unknown as [Array<{ id: number }>, unknown];

    if (!rows?.length) return res.status(404).json({ error: 'Plan not found' });

    await db.execute(sql`DELETE FROM safety_plans WHERE id = ${planId} AND company_id = ${profile.companyId}`);

    res.json({ ok: true });
  } catch (e) {
    console.error('[safety/plans/delete]', e);
    res.status(500).json({ error: String((e as Error)?.message ?? e) });
  }
}
