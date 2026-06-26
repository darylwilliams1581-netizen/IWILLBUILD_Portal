import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { estimates, profiles } from '../../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
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
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const jobId = req.query.jobId ? parseInt(String(req.query.jobId), 10) : null;
    if (!jobId || isNaN(jobId)) return res.status(400).json({ error: 'jobId required' });

    const rows = await db
      .select()
      .from(estimates)
      .where(and(eq(estimates.jobId, jobId), eq(estimates.companyId, profile.companyId)))
      .orderBy(desc(estimates.createdAt));

    res.json({ estimates: rows });
  } catch (error) {
    console.error('GET /api/estimates error:', error);
    res.status(500).json({ error: 'Failed to fetch estimates' });
  }
}
