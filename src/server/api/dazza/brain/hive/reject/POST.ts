/**
 * POST /api/dazza/brain/hive/reject
 * Reject a pending hive entry — marks it as rejected, never auto-deletes.
 * Admin/Owner only.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { profiles } from '../../../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { derivePermissions } from '../../../../../lib/dazza-context.js';

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

    const permissions = derivePermissions(profile);
    if (!permissions.isAdmin) return res.status(403).json({ error: 'Admin access required' });

    const { id } = req.body as { id: number };
    if (!id) return res.status(400).json({ error: 'id required' });

    const [pendingRows] = await db.execute(
      sql`SELECT id FROM dazza_hive_pending WHERE id = ${id} AND company_id = ${profile.companyId} AND status = 'pending' LIMIT 1`
    ) as unknown as [Array<{ id: number }>, unknown];

    if (!pendingRows?.[0]) return res.status(404).json({ error: 'Pending entry not found' });

    await db.execute(
      sql`UPDATE dazza_hive_pending
          SET status = 'rejected', reviewed_by_user_id = ${session.user.id}, reviewed_at = NOW()
          WHERE id = ${id}`
    );

    res.json({ ok: true, message: 'Entry rejected' });
  } catch (error) {
    console.error('POST /api/dazza/brain/hive/reject error:', error);
    res.status(500).json({ error: 'Failed to reject entry' });
  }
}
