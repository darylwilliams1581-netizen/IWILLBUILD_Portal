/**
 * GET /api/team/time-entries
 * Returns time entries for the company. Query: ?profileId=, ?month=YYYY-MM, ?status=pending|approved
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

    const { profileId, month, status } = req.query;

    const profileFilter = profileId
      ? sql`AND te.profile_id = ${parseInt(String(profileId), 10)}`
      : sql``;
    const monthFilter = month
      ? sql`AND DATE_FORMAT(te.entry_date, '%Y-%m') = ${String(month)}`
      : sql``;
    const statusFilter = status
      ? sql`AND te.status = ${String(status)}`
      : sql``;

    const [rows] = await db.execute(sql`
      SELECT
        te.id, te.profile_id, te.shift_id, te.job_id, te.entry_date,
        te.clock_in, te.clock_out, te.break_minutes, te.total_minutes,
        te.hourly_rate, te.notes, te.status, te.approved_at, te.created_at,
        p.display_name AS member_name, p.role AS member_role,
        j.name AS job_name, j.job_number,
        ap.display_name AS approved_by_name
      FROM team_time_entries te
      JOIN profiles p ON p.id = te.profile_id
      LEFT JOIN jobs j ON j.id = te.job_id
      LEFT JOIN profiles ap ON ap.id = te.approved_by
      WHERE te.company_id = ${profile.companyId}
        ${profileFilter}
        ${monthFilter}
        ${statusFilter}
      ORDER BY te.entry_date DESC, te.clock_in DESC
    `) as unknown as [Array<Record<string, unknown>>];

    res.json({ entries: rows ?? [] });
  } catch (err) {
    console.error('GET time-entries error:', err);
    res.status(500).json({ error: 'Failed to load time entries' });
  }
}
