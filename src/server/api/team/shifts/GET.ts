/**
 * GET /api/team/shifts
 * Returns shifts for the company, optionally filtered by week (weekOf=YYYY-MM-DD) or profileId.
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

    const { weekOf, profileId, month } = req.query;

    let dateFilter = sql`1=1`;
    if (weekOf) {
      const start = new Date(String(weekOf));
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      const s = start.toISOString().slice(0, 10);
      const e = end.toISOString().slice(0, 10);
      dateFilter = sql`s.shift_date BETWEEN ${s} AND ${e}`;
    } else if (month) {
      // month = YYYY-MM
      dateFilter = sql`DATE_FORMAT(s.shift_date, '%Y-%m') = ${String(month)}`;
    }

    const profileFilter = profileId
      ? sql`AND s.profile_id = ${parseInt(String(profileId), 10)}`
      : sql``;

    const [rows] = await db.execute(sql`
      SELECT
        s.id, s.profile_id, s.job_id, s.title, s.shift_date, s.start_time, s.end_time,
        s.break_minutes, s.status, s.notes, s.created_at,
        p.display_name AS member_name, p.role AS member_role,
        j.name AS job_name, j.job_number
      FROM team_shifts s
      JOIN profiles p ON p.id = s.profile_id
      LEFT JOIN jobs j ON j.id = s.job_id
      WHERE s.company_id = ${profile.companyId}
        AND ${dateFilter}
        ${profileFilter}
      ORDER BY s.shift_date ASC, s.start_time ASC
    `) as unknown as [Array<Record<string, unknown>>];

    res.json({ shifts: rows ?? [] });
  } catch (err) {
    console.error('GET shifts error:', err);
    res.status(500).json({ error: 'Failed to load shifts' });
  }
}
