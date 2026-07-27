import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { jobTodos, jobs, profiles } from '../../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
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

    const job = await db.query.jobs.findFirst({ where: and(eq(jobs.id, jobId), eq(jobs.companyId, profile.companyId)) });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const {
      title,
      description,
      dueDate,
      startDate,
      notes,
      assignedUserId,
      assignedName,
    } = req.body as {
      title?: string;
      description?: string;
      dueDate?: string;
      startDate?: string;
      notes?: string;
      assignedUserId?: string;
      assignedName?: string;
    };

    if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });

    const [result] = await db.insert(jobTodos).values({
      jobId,
      companyId: profile.companyId,
      title: title.trim(),
      description: description?.trim() || null,
      dueDate: dueDate?.trim() || null,
      startDate: startDate?.trim() || null,
      status: 'Open',
      notes: notes?.trim() || null,
      assignedUserId: assignedUserId?.trim() || null,
      assignedName: assignedName?.trim() || null,
    });

    const todo = await db.query.jobTodos.findFirst({ where: eq(jobTodos.id, result.insertId) });
    res.status(201).json({ todo });
  } catch (err) {
    console.error('POST /api/jobs/:id/todos error:', err);
    res.status(500).json({ error: 'Failed to create todo' });
  }
}
