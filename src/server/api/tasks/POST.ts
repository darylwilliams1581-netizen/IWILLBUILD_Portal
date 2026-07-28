/**
 * POST /api/tasks
 *
 * Create a general task — job linkage is optional.
 * If jobId is provided it must belong to the caller's company.
 *
 * Body: { title, description?, startDate?, dueDate?, status?, notes?,
 *          assignedUserId?, assignedName?, jobId? }
 *
 * Response: { task }
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { jobTodos, jobs, profiles } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';

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

    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, session.user.id),
    });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const {
      title,
      description,
      startDate,
      dueDate,
      status,
      notes,
      assignedUserId,
      assignedName,
      jobId: rawJobId,
    } = req.body as {
      title?: string;
      description?: string;
      startDate?: string;
      dueDate?: string;
      status?: string;
      notes?: string;
      assignedUserId?: string;
      assignedName?: string;
      jobId?: number | string | null;
    };

    if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });

    const resolvedStatus = status && VALID_STATUSES.has(status) ? status : 'Open';

    // Validate job linkage if provided
    let resolvedJobId: number | null = null;
    if (rawJobId != null && rawJobId !== '' && rawJobId !== 0) {
      const jid = parseInt(String(rawJobId), 10);
      if (isNaN(jid)) return res.status(400).json({ error: 'Invalid jobId' });
      const job = await db.query.jobs.findFirst({
        where: and(eq(jobs.id, jid), eq(jobs.companyId, profile.companyId)),
      });
      if (!job) return res.status(404).json({ error: 'Job not found' });
      resolvedJobId = jid;
    }

    const [result] = await db.insert(jobTodos).values({
      jobId:          resolvedJobId as unknown as number, // schema type is int but DB now allows NULL
      companyId:      profile.companyId,
      title:          title.trim(),
      description:    description?.trim() || null,
      startDate:      startDate?.trim() || null,
      dueDate:        dueDate?.trim() || null,
      status:         resolvedStatus,
      notes:          notes?.trim() || null,
      assignedUserId: assignedUserId?.trim() || null,
      assignedName:   assignedName?.trim() || null,
    });

    const task = await db.query.jobTodos.findFirst({
      where: eq(jobTodos.id, result.insertId),
    });

    return res.status(201).json({ task });
  } catch (err) {
    console.error('POST /api/tasks error:', err);
    return res.status(500).json({ error: 'Failed to create task' });
  }
}
