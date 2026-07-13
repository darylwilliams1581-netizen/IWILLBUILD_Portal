/**
 * PATCH /api/scheduler/jobs/:id/reschedule
 * Updates scheduled_start_date, expected_completion_date, and optional times.
 * Body: { scheduledStartDate, expectedCompletionDate, scheduledStartTime, scheduledEndTime }
 */
import type { Request, Response } from 'express';
import { getAuth } from '@/lib/auth/auth';
import { db } from '@/server/db/client';
import { sql } from 'drizzle-orm';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;

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

    const { scheduledStartDate, expectedCompletionDate, scheduledStartTime, scheduledEndTime } = req.body as {
      scheduledStartDate?: string;
      expectedCompletionDate?: string;
      scheduledStartTime?: string | null;
      scheduledEndTime?: string | null;
    };

    if (scheduledStartDate && !DATE_RE.test(scheduledStartDate)) {
      return res.status(400).json({ error: 'Invalid scheduledStartDate format (YYYY-MM-DD)' });
    }
    if (expectedCompletionDate && !DATE_RE.test(expectedCompletionDate)) {
      return res.status(400).json({ error: 'Invalid expectedCompletionDate format (YYYY-MM-DD)' });
    }
    if (scheduledStartTime && !TIME_RE.test(scheduledStartTime)) {
      return res.status(400).json({ error: 'Invalid scheduledStartTime format (HH:MM)' });
    }
    if (scheduledEndTime && !TIME_RE.test(scheduledEndTime)) {
      return res.status(400).json({ error: 'Invalid scheduledEndTime format (HH:MM)' });
    }

    // Verify job belongs to company
    const [check] = await db.execute(
      sql`SELECT id FROM jobs WHERE id = ${jobId} AND company_id = ${companyId} LIMIT 1`
    ) as unknown as [Array<{ id: number }>];
    if (!check?.length) return res.status(404).json({ error: 'Job not found' });

    const updates: string[] = [];
    if (scheduledStartDate !== undefined) {
      updates.push(`scheduled_start_date = ${scheduledStartDate ? `'${scheduledStartDate}'` : 'NULL'}`);
    }
    if (expectedCompletionDate !== undefined) {
      updates.push(`expected_completion_date = ${expectedCompletionDate ? `'${expectedCompletionDate}'` : 'NULL'}`);
    }
    if (scheduledStartTime !== undefined) {
      updates.push(`scheduled_start_time = ${scheduledStartTime ? `'${scheduledStartTime}'` : 'NULL'}`);
    }
    if (scheduledEndTime !== undefined) {
      updates.push(`scheduled_end_time = ${scheduledEndTime ? `'${scheduledEndTime}'` : 'NULL'}`);
    }

    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

    await db.execute(
      sql.raw(`UPDATE jobs SET ${updates.join(', ')}, updated_at = NOW() WHERE id = ${jobId} AND company_id = ${companyId}`)
    );

    res.json({ ok: true, jobId, scheduledStartDate, expectedCompletionDate, scheduledStartTime, scheduledEndTime });
  } catch (err) {
    console.error('PATCH /api/scheduler/jobs/:id/reschedule error:', err);
    res.status(500).json({ error: 'Failed to reschedule job' });
  }
}
