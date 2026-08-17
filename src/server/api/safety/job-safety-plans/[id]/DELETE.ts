/**
 * DELETE /api/safety/job-safety-plans/:id
 * Removes a job safety plan (not the master template).
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { profiles } from '../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { revokeSharesForSource } from '../../../../lib/share-lifecycle.js';

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

    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'Invalid ID' });

    // Verify ownership before revoking shares and deleting
    const [rows] = await db.execute(
      sql`SELECT id FROM safety_plans WHERE id = ${id} AND company_id = ${profile.companyId} AND job_id IS NOT NULL LIMIT 1`
    ) as unknown as [Array<{ id: number }>, unknown];
    if (!rows?.length) return res.status(404).json({ error: 'Plan not found' });

    // Revoke all share links before deleting the source record
    await revokeSharesForSource({
      companyId: profile.companyId,
      targetType: 'safety_plan',
      targetId: String(id),
      req,
    });

    // Only delete job-specific plans (job_id IS NOT NULL)
    await db.execute(sql`
      DELETE FROM safety_plans
      WHERE id = ${id} AND company_id = ${profile.companyId} AND job_id IS NOT NULL
    `);

    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/safety/job-safety-plans/:id error:', err);
    res.status(500).json({ error: 'Failed to delete safety plan' });
  }
}
