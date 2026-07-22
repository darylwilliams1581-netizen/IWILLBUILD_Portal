/**
 * PUT /api/team/time-entries/:id
 * Update a time entry (edit times, approve, reject).
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

    const entryId = parseInt(String(req.params.id), 10);
    if (isNaN(entryId)) return res.status(400).json({ error: 'Invalid id' });

    const { clockIn, clockOut, breakMinutes, hourlyRate, notes, status } = req.body;

    // If approving/rejecting, record approver
    const approvedBy = ['approved', 'rejected'].includes(status ?? '') ? profile.id : null;
    const approvedAt = ['approved', 'rejected'].includes(status ?? '') ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null;

    await db.execute(sql`
      UPDATE team_time_entries SET
        clock_in      = COALESCE(${clockIn ?? null}, clock_in),
        clock_out     = COALESCE(${clockOut ?? null}, clock_out),
        break_minutes = COALESCE(${breakMinutes != null ? breakMinutes : null}, break_minutes),
        hourly_rate   = COALESCE(${hourlyRate != null ? parseFloat(String(hourlyRate)) : null}, hourly_rate),
        notes         = COALESCE(${notes ?? null}, notes),
        status        = COALESCE(${status ?? null}, status),
        approved_by   = COALESCE(${approvedBy}, approved_by),
        approved_at   = COALESCE(${approvedAt}, approved_at)
      WHERE id = ${entryId} AND company_id = ${profile.companyId}
    `);

    res.json({ ok: true });
  } catch (err) {
    console.error('PUT time-entry error:', err);
    res.status(500).json({ error: 'Failed to update time entry' });
  }
}
