/**
 * DELETE /api/rl-register/points/:id
 * Soft-archive an RL point. Admin/owner only.
 * Pass ?hard=1 to permanently delete (owner only).
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

    const isAdmin = profile.role === 'owner' || profile.role === 'admin';
    if (!isAdmin) return res.status(403).json({ error: 'Admin access required' });

    const pointId = parseInt(req.params['id'] as string, 10);
    if (isNaN(pointId)) return res.status(400).json({ error: 'Invalid point ID' });

    const [rows] = await db.execute(sql.raw(
      `SELECT id FROM rl_points WHERE id = ${pointId} AND company_id = ${profile.companyId} LIMIT 1`
    )) as unknown as [Array<{ id: number }>];
    if (!rows?.length) return res.status(404).json({ error: 'RL point not found' });

    const hardDelete = req.query['hard'] === '1' && profile.role === 'owner';

    if (hardDelete) {
      await db.execute(sql.raw(
        `DELETE FROM rl_point_history WHERE point_id = ${pointId}`
      ));
      await db.execute(sql.raw(
        `DELETE FROM rl_points WHERE id = ${pointId} AND company_id = ${profile.companyId}`
      ));
      return res.json({ ok: true, deleted: true });
    }

    // Soft archive
    await db.execute(sql.raw(
      `UPDATE rl_points SET archived_at = NOW() WHERE id = ${pointId} AND company_id = ${profile.companyId}`
    ));
    return res.json({ ok: true, archived: true });
  } catch (err) {
    console.error('DELETE /api/rl-register/points/:id error:', err);
    return res.status(500).json({ error: 'Failed to archive RL point' });
  }
}
