/**
 * GET /api/safety/job-swms/:id/signoffs
 * Returns all sign-ons for a specific job SWMS record.
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
    if (!profile?.companyId) return res.json({ signoffs: [] });

    const id = parseInt(req.params.id, 10);

    const [rows] = await db.execute(sql`
      SELECT s.* FROM swms_signoffs s
      JOIN job_swms js ON js.id = s.job_swms_id
      WHERE s.job_swms_id = ${id} AND js.company_id = ${profile.companyId}
      ORDER BY s.signed_at DESC
    `) as unknown as [Array<Record<string, unknown>>, unknown];

    res.json({ signoffs: rows ?? [] });
  } catch (err) {
    console.error('GET /api/safety/job-swms/:id/signoffs error:', err);
    res.status(500).json({ error: 'Failed to fetch signoffs' });
  }
}
