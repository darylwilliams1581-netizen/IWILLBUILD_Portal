/**
 * PATCH /api/scheduler/jobs/:id/reschedule
 * Updates scheduled_start_date and expected_completion_date for a job.
 * Used by the drag-drop scheduler to move/resize job bars.
 *
 * Body: { scheduledStartDate: "YYYY-MM-DD", expectedCompletionDate: "YYYY-MM-DD" }
 */
import type { Request, Response } from 'express';
import { getAuth } from '@/lib/auth/auth';
import { db } from '@/server/db/client';
import { sql } from 'drizzle-orm';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const [profileRows] = await db.execute(
      sql`SELECT company_id FROM profiles WHERE user_id = ${session.user.id} LIMIT 1`
    ) as unknown as [Array<{ company_id: number }>];
    const companyId = profileRows?.[0]?.company_id;
    if (!companyId) return res.status(400).json({ error: 'No company' });

    const jobId = parseInt(String(req.params.id), 10);
    if (isNaN(jobId)) return res.status(400).json({ error: 'Invalid job ID' });

    const { scheduledStartDate, expectedCompletionDate } = req.body as {
      scheduledStartDate?: string;
      expectedCompletionDate?: string;
    };

    // Validate dates
    if (scheduledStartDate && !DATE_RE.test(scheduledStartDate)) {
      return res.status(400).json({ error: 'Invalid scheduledStartDate format (YYYY-MM-DD)' });
    }
    if (expectedCompletionDate && !DATE_RE.test(expectedCompletionDate)) {
      return res.status(400).json({ error: 'Invalid expectedCompletionDate format (YYYY-MM-DD)' });
    }

    // Verify job belongs to company
    const [check] = await db.execute(
      sql`SELECT id FROM jobs WHERE id = ${jobId} AND company_id = ${companyId} LIMIT 1`
    ) as unknown as [Array<{ id: number }>];
    if (!check?.length) return res.status(404).json({ error: 'Job not found' });

    // Build update
    const updates: string[] = [];
    if (scheduledStartDate !== undefined) {
      updates.push(`scheduled_start_date = ${scheduledStartDate ? `'${scheduledStartDate}'` : 'NULL'}`);
    }
    if (expectedCompletionDate !== undefined) {
      updates.push(`expected_completion_date = ${expectedCompletionDate ? `'${expectedCompletionDate}'` : 'NULL'}`);
    }

    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

    await db.execute(
      sql.raw(`UPDATE jobs SET ${updates.join(', ')}, updated_at = NOW() WHERE id = ${jobId} AND company_id = ${companyId}`)
    );

    res.json({ ok: true, jobId, scheduledStartDate, expectedCompletionDate });
  } catch (err) {
    console.error('PATCH /api/scheduler/jobs/:id/reschedule error:', err);
    res.status(500).json({ error: 'Failed to reschedule job' });
  }
}
