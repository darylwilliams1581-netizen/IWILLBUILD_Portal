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

    const incidentId = parseInt(req.params.incidentId, 10);
    const thirdPartyId = parseInt(req.params.thirdPartyId, 10);

    await db.execute(sql`
      DELETE tp FROM incident_third_parties tp
      INNER JOIN incidents i ON i.id = tp.incident_id AND i.company_id = ${profile.companyId}
      WHERE tp.id = ${thirdPartyId} AND tp.incident_id = ${incidentId}
    `);

    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE third party error:', err);
    res.status(500).json({ error: 'Failed to delete third party' });
  }
}
