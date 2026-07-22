/**
 * PUT /api/team/shifts/:id
 * Update a shift (title, date, times, status, notes).
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { profiles } from '../../../../db/schema.js';
import { eq } from 'drizzle-orm';

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

    const shiftId = parseInt(String(req.params.id), 10);
    if (isNaN(shiftId)) return res.status(400).json({ error: 'Invalid id' });

    const { title, shiftDate, startTime, endTime, breakMinutes, status, notes, jobId } = req.body;

    await db.execute(sql`
      UPDATE team_shifts SET
        title         = COALESCE(${title ?? null}, title),
        shift_date    = COALESCE(${shiftDate ?? null}, shift_date),
        start_time    = COALESCE(${startTime ?? null}, start_time),
        end_time      = COALESCE(${endTime ?? null}, end_time),
        break_minutes = COALESCE(${breakMinutes != null ? breakMinutes : null}, break_minutes),
        status        = COALESCE(${status ?? null}, status),
        notes         = COALESCE(${notes ?? null}, notes),
        job_id        = COALESCE(${jobId != null ? parseInt(String(jobId), 10) : null}, job_id)
      WHERE id = ${shiftId} AND company_id = ${profile.companyId}
    `);

    res.json({ ok: true });
  } catch (err) {
    console.error('PUT shift error:', err);
    res.status(500).json({ error: 'Failed to update shift' });
  }
}
