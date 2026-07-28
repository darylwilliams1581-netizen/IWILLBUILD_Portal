import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { jobTodos, profiles } from '../../../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';

const VALID_STATUSES = new Set(['Open', 'In Progress', 'Completed', 'Cancelled']);

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

    const {
      title,
      description,
      dueDate,
      startDate,
      status,
      notes,
      assignedUserId,
      assignedName,
    } = req.body as {
      title?: string;
      description?: string;
      dueDate?: string | null;
      startDate?: string | null;
      status?: string;
      notes?: string | null;
      assignedUserId?: string | null;
      assignedName?: string | null;
    };

    if (status !== undefined && !VALID_STATUSES.has(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${[...VALID_STATUSES].join(', ')}` });
    }

    const update: Record<string, unknown> = {};
    if (title !== undefined) update.title = title.trim();
    if (description !== undefined) update.description = description?.trim() || null;
    if (dueDate !== undefined) update.dueDate = dueDate?.trim() || null;
    if (startDate !== undefined) update.startDate = startDate?.trim() || null;
    if (status !== undefined) update.status = status;
    if (notes !== undefined) update.notes = notes?.trim() || null;
    if (assignedUserId !== undefined) update.assignedUserId = assignedUserId?.trim() || null;
    if (assignedName !== undefined) update.assignedName = assignedName?.trim() || null;

    if (Object.keys(update).length > 0) {
      await db.update(jobTodos).set(update).where(eq(jobTodos.id, todoId));
    }

    const updated = await db.query.jobTodos.findFirst({ where: eq(jobTodos.id, todoId) });
    res.json({ todo: updated });
  } catch (err) {
    console.error('PUT /api/jobs/:id/todos/:todoId error:', err);
    res.status(500).json({ error: 'Failed to update todo' });
  }
}
