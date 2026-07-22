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

    const prestartId = parseInt(req.params.prestartId, 10);

    const [rows] = await db.execute(sql`
      SELECT * FROM site_prestarts
      WHERE id = ${prestartId} AND company_id = ${profile.companyId}
    `) as unknown as [Array<Record<string, unknown>>, unknown];

    const prestart = (rows ?? [])[0];
    if (!prestart) return res.status(404).json({ error: 'Not found' });

    const [workers] = await db.execute(sql`
      SELECT * FROM site_prestart_workers WHERE site_prestart_id = ${prestartId}
      ORDER BY signed_at ASC
    `) as unknown as [Array<Record<string, unknown>>, unknown];

    res.json({ prestart, workers: workers ?? [] });
  } catch (err) {
    console.error('GET /api/jobs/:id/site-prestarts/:prestartId error:', err);
    res.status(500).json({ error: 'Failed to fetch site prestart' });
  }
}
