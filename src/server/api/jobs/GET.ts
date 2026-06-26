import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { jobs, profiles } from '../../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, session.user.id),
    });
    if (!profile?.companyId) return res.json({ jobs: [] });

    const result = await db
      .select()
      .from(jobs)
      .where(eq(jobs.companyId, profile.companyId))
      .orderBy(desc(jobs.createdAt));

    res.json({ jobs: result });
  } catch (error) {
    console.error('GET /api/jobs error:', error);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
}
