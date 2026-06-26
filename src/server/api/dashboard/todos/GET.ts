import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { jobTodos, jobs, profiles } from '../../../db/schema.js';
import { eq, and, ne } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';

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

    // Fetch all open todos with job info
    const todos = await db
      .select({
        id: jobTodos.id,
        jobId: jobTodos.jobId,
        title: jobTodos.title,
        dueDate: jobTodos.dueDate,
        status: jobTodos.status,
        notes: jobTodos.notes,
        jobName: jobs.name,
        jobNumber: jobs.jobNumber,
      })
      .from(jobTodos)
      .innerJoin(jobs, eq(jobTodos.jobId, jobs.id))
      .where(and(
        eq(jobTodos.companyId, profile.companyId),
        ne(jobTodos.status, 'Completed'),
      ));

    const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    const dueToday = todos.filter((t) => t.dueDate === todayStr);
    const overdue = todos.filter((t) => t.dueDate && t.dueDate < todayStr);

    res.json({ dueToday, overdue, total: todos.length });
  } catch (err) {
    console.error('GET /api/dashboard/todos error:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard todos' });
  }
}
