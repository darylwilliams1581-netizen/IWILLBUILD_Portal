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

    const incidentId = parseInt(req.params.incidentId, 10);

    const [check] = await db.execute(sql`
      SELECT id, status FROM incidents WHERE id = ${incidentId} AND company_id = ${profile.companyId}
    `) as unknown as [Array<{ id: number; status: string }>, unknown];
    const record = (check ?? [])[0];
    if (!record) return res.status(404).json({ error: 'Not found' });
    if (record.status === 'closed') return res.status(400).json({ error: 'Already closed' });

    const { closedBy, managerSignOff } = req.body as { closedBy?: string; managerSignOff?: string };

    await db.execute(sql`
      UPDATE incidents SET
        status          = 'closed',
        closed_at       = NOW(),
        closed_by       = ${closedBy ?? session.user.name ?? null},
        manager_sign_off = ${managerSignOff ?? null},
        updated_at      = NOW()
      WHERE id = ${incidentId} AND company_id = ${profile.companyId}
    `);

    res.json({ ok: true });
  } catch (err) {
    console.error('POST close incident error:', err);
    res.status(500).json({ error: 'Failed to close incident' });
  }
}
