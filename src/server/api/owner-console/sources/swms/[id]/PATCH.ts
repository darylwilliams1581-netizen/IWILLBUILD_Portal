/**
 * PATCH /api/owner-console/sources/swms/:id
 * ─────────────────────────────────────────────────────────────────────────────
 * Archive or restore a swms_template source record.
 * Body: { status: 'active' | 'archived' }
 *
 * Does NOT delete the template. Does NOT affect installed company copies.
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
    if (profile.platformRole !== 'owner') return res.status(403).json({ error: 'Platform owner access required' });

    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'Invalid ID' });

    const { status } = req.body as { status?: string };
    if (!status || !['active', 'archived'].includes(status)) {
      return res.status(400).json({ error: 'status must be active or archived' });
    }

    await db.execute(sql`
      UPDATE swms_templates
      SET status = ${status}, updated_at = NOW()
      WHERE id = ${id} AND company_id = ${profile.companyId}
    `);

    return res.json({ ok: true, status });
  } catch (err) {
    console.error('PATCH /api/owner-console/sources/swms/:id error:', err);
    return res.status(500).json({ error: 'Failed to update SWMS template' });
  }
}
