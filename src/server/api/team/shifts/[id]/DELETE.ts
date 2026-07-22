/**
 * DELETE /api/team/shifts/:id
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { profiles } from '../../../../db/schema.js';
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

    if (!['owner', 'admin', 'manager'].includes(profile.role ?? '')) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const shiftId = parseInt(String(req.params.id), 10);
    if (isNaN(shiftId)) return res.status(400).json({ error: 'Invalid id' });

    await db.execute(sql`
      DELETE FROM team_shifts WHERE id = ${shiftId} AND company_id = ${profile.companyId}
    `);

    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE shift error:', err);
    res.status(500).json({ error: 'Failed to delete shift' });
  }
}
