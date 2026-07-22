import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { profiles } from '../../../db/schema.js';
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
    if (!profile?.companyId) return res.json({ plans: [] });

    const [rows] = await db.execute(
      sql`SELECT sp.*, j.name as job_name, j.job_number FROM safety_plans sp
          LEFT JOIN jobs j ON j.id = sp.job_id
          WHERE sp.company_id = ${profile.companyId}
          ORDER BY sp.created_at DESC`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    res.json({ plans: rows ?? [] });
  } catch (err) {
    console.error('GET /api/safety/plans error:', err);
    res.status(500).json({ error: 'Failed to fetch safety plans' });
  }
}
