/**
 * POST /api/plan-manager/drawings/:id/restore
 * Restore an archived drawing back to active.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { profiles } from '../../../../../db/schema.js';
import { eq } from 'drizzle-orm';

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

    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    const [rows] = await db.execute(sql`
      SELECT id FROM project_drawings WHERE id = ${id} AND company_id = ${profile.companyId} AND status = 'archived' LIMIT 1
    `) as unknown as [Array<{ id: number }>];
    if (!rows?.length) return res.status(404).json({ error: 'Drawing not found or not archived' });

    await db.execute(sql`UPDATE project_drawings SET status = 'active', updated_at = NOW() WHERE id = ${id}`);
    await db.execute(sql`
      INSERT INTO drawing_audit_log (drawing_id, actor_id, action, details_json)
      VALUES (${id}, ${session.user.id}, 'restored', '{}')
    `);

    res.json({ ok: true });
  } catch (err) {
    console.error('POST restore error:', err);
    res.status(500).json({ error: 'Failed to restore drawing' });
  }
}
