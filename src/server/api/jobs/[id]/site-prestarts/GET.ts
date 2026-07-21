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
    if (!profile?.companyId) return res.json({ prestarts: [] });

    const jobId = parseInt(req.params.id, 10);

    const [rows] = await db.execute(sql`
      SELECT sp.*,
        (SELECT COUNT(*) FROM site_prestart_workers spw WHERE spw.site_prestart_id = sp.id) as worker_count
      FROM site_prestarts sp
      WHERE sp.job_id = ${jobId} AND sp.company_id = ${profile.companyId}
      ORDER BY sp.created_at DESC
    `) as unknown as [Array<Record<string, unknown>>, unknown];

    res.json({ prestarts: rows ?? [] });
  } catch (err) {
    console.error('GET /api/jobs/:id/site-prestarts error:', err);
    res.status(500).json({ error: 'Failed to fetch site prestarts' });
  }
}
