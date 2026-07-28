/**
 * POST /api/team/shifts
 * Create a new shift for a team member.
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

    if (!['owner', 'admin', 'manager', 'supervisor'].includes(profile.role ?? '')) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { profileId, jobId, title, shiftDate, startTime, endTime, breakMinutes, notes } = req.body;
    if (!profileId || !shiftDate || !startTime || !endTime) {
      return res.status(400).json({ error: 'profileId, shiftDate, startTime, endTime required' });
    }

    const [result] = await db.execute(sql`
      INSERT INTO team_shifts (company_id, profile_id, job_id, title, shift_date, start_time, end_time, break_minutes, notes, created_by)
      VALUES (
        ${profile.companyId},
        ${parseInt(String(profileId), 10)},
        ${jobId ? parseInt(String(jobId), 10) : null},
        ${title ?? 'Shift'},
        ${shiftDate},
        ${startTime},
        ${endTime},
        ${breakMinutes ?? 0},
        ${notes ?? null},
        ${profile.id}
      )
    `) as unknown as [{ insertId: number }];

    res.status(201).json({ id: result.insertId, ok: true });
  } catch (err) {
    console.error('POST shift error:', err);
    res.status(500).json({ error: 'Failed to create shift' });
  }
}
