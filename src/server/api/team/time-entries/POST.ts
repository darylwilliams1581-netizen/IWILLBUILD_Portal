/**
 * POST /api/team/time-entries
 * Create a time entry (manual or clock-in).
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { profiles } from '../../../db/schema.js';
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

    const { profileId, shiftId, jobId, entryDate, clockIn, clockOut, breakMinutes, hourlyRate, notes } = req.body;
    if (!profileId || !entryDate || !clockIn) {
      return res.status(400).json({ error: 'profileId, entryDate, clockIn required' });
    }

    const [result] = await db.execute(sql`
      INSERT INTO team_time_entries
        (company_id, profile_id, shift_id, job_id, entry_date, clock_in, clock_out, break_minutes, hourly_rate, notes)
      VALUES (
        ${profile.companyId},
        ${parseInt(String(profileId), 10)},
        ${shiftId ? parseInt(String(shiftId), 10) : null},
        ${jobId ? parseInt(String(jobId), 10) : null},
        ${entryDate},
        ${clockIn},
        ${clockOut ?? null},
        ${breakMinutes ?? 0},
        ${hourlyRate ? parseFloat(String(hourlyRate)) : null},
        ${notes ?? null}
      )
    `) as unknown as [{ insertId: number }];

    res.status(201).json({ id: result.insertId, ok: true });
  } catch (err) {
    console.error('POST time-entry error:', err);
    res.status(500).json({ error: 'Failed to create time entry' });
  }
}
