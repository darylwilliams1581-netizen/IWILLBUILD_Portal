import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { jobTodos, profiles } from '../../../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';

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

    const todoId = parseInt(String(req.params.todoId), 10);
    if (isNaN(todoId)) return res.status(400).json({ error: 'Invalid todo ID' });

    const existing = await db.query.jobTodos.findFirst({
      where: and(eq(jobTodos.id, todoId), eq(jobTodos.companyId, profile.companyId)),
    });
    if (!existing) return res.status(404).json({ error: 'Todo not found' });

    await db.delete(jobTodos).where(eq(jobTodos.id, todoId));
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/jobs/:id/todos/:todoId error:', err);
    res.status(500).json({ error: 'Failed to delete todo' });
  }
}
