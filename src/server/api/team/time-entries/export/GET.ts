/**
 * GET /api/team/time-entries/export
 * Export approved time entries as CSV for payroll.
 * Query: ?month=YYYY-MM&profileId= (optional)
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { profiles } from '../../../../db/schema.js';
import { eq } from 'drizzle-orm';

function pad(n: number) { return String(n).padStart(2, '0'); }

function minutesToHours(mins: number | null) {
  if (mins == null) return '';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}:${pad(m)}`;
}

function csvEscape(val: unknown) {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

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

    if (!['owner', 'admin', 'manager'].includes(profile.role ?? '')) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { month, profileId } = req.query;
    if (!month) return res.status(400).json({ error: 'month (YYYY-MM) required' });

    const profileFilter = profileId
      ? sql`AND te.profile_id = ${parseInt(String(profileId), 10)}`
      : sql``;

    const [rows] = await db.execute(sql`
      SELECT
        p.display_name AS member_name,
        p.email,
        te.entry_date,
        te.clock_in, te.clock_out,
        te.break_minutes,
        te.total_minutes,
        te.hourly_rate,
        CASE WHEN te.hourly_rate IS NOT NULL AND te.total_minutes IS NOT NULL
          THEN ROUND((te.total_minutes / 60.0) * te.hourly_rate, 2)
          ELSE NULL
        END AS gross_pay,
        j.name AS job_name, j.job_number,
        te.notes, te.status
      FROM team_time_entries te
      JOIN profiles p ON p.id = te.profile_id
      LEFT JOIN jobs j ON j.id = te.job_id
      WHERE te.company_id = ${profile.companyId}
        AND DATE_FORMAT(te.entry_date, '%Y-%m') = ${String(month)}
        AND te.status = 'approved'
        ${profileFilter}
      ORDER BY p.display_name ASC, te.entry_date ASC
    `) as unknown as [Array<Record<string, unknown>>];

    const csvHeaders = [
      'Member', 'Email', 'Date', 'Clock In', 'Clock Out',
      'Break (min)', 'Total Hours', 'Hourly Rate', 'Gross Pay',
      'Job', 'Job Number', 'Notes', 'Status',
    ];

    const csvRows = (rows ?? []).map(r => [
      r.member_name, r.email, r.entry_date,
      r.clock_in, r.clock_out,
      r.break_minutes,
      minutesToHours(r.total_minutes as number | null),
      r.hourly_rate ?? '',
      r.gross_pay ?? '',
      r.job_name ?? '', r.job_number ?? '',
      r.notes ?? '', r.status,
    ].map(csvEscape).join(','));

    const csv = [csvHeaders.join(','), ...csvRows].join('\n');
    const filename = `payroll-${month}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    console.error('Payroll export error:', err);
    res.status(500).json({ error: 'Export failed' });
  }
}
