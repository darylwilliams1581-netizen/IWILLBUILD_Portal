import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { jobTodos, profiles } from '../../../../db/schema.js';
import { eq, and, asc } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';

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

    const jobId = parseInt(String(req.params.id), 10);
    if (isNaN(jobId)) return res.status(400).json({ error: 'Invalid job ID' });

    const todos = await db
      .select()
      .from(jobTodos)
      .where(and(eq(jobTodos.jobId, jobId), eq(jobTodos.companyId, profile.companyId)))
      .orderBy(asc(jobTodos.dueDate), asc(jobTodos.id));

    res.json({ todos });
  } catch (err) {
    console.error('GET /api/jobs/:id/todos error:', err);
    res.status(500).json({ error: 'Failed to fetch todos' });
  }
}
