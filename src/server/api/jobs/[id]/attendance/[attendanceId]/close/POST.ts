/**
 * POST /api/jobs/:id/attendance/:attendanceId/close
 *
 * Supervisor force-close of an open attendance session.
 * Requires role = owner or admin.
 *
 * Body: { notes?: string }
 * Returns: { ok, message }
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../../../lib/auth-middleware.js';

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  const { role } = auth.profile as { role?: string };
  if (role !== 'owner' && role !== 'admin') {
    return res.status(403).json({ error: 'Supervisor access required' });
  }

  const jobId        = parseInt(req.params.id);
  const attendanceId = parseInt(req.params.attendanceId);
  const companyId    = auth.profile.companyId;
  const closedBy     = auth.session.user.id;

  if (!jobId || !attendanceId) {
    return res.status(400).json({ error: 'Invalid job or attendance id' });
  }

  const notes = typeof req.body?.notes === 'string'
    ? req.body.notes.trim().slice(0, 500)
    : 'Supervisor force-close';

  try {
    // Verify the attendance row belongs to this company + job and is a signin
    const [rows] = await db.execute(
      sql`SELECT id, action, user_id FROM job_attendance
          WHERE id = ${attendanceId}
            AND job_id = ${jobId}
            AND company_id = ${companyId}
            AND action = 'signin'
          LIMIT 1`
    ) as unknown as [Array<{ id: number; action: string; user_id: string }>, unknown];

    if (!rows.length) {
      return res.status(404).json({ error: 'Open attendance record not found' });
    }

    // Insert a matching signout row attributed to the supervisor
    await db.execute(
      sql`INSERT INTO job_attendance
            (company_id, job_id, user_id, action, source, actor_type, notes)
          SELECT
            company_id, job_id, user_id,
            'signout',
            'supervisor_override',
            actor_type,
            ${notes}
          FROM job_attendance
          WHERE id = ${attendanceId}`
    );

    return res.json({
      ok: true,
      message: `Session closed by supervisor (${closedBy}).`,
    });
  } catch (err) {
    console.error('POST /api/jobs/:id/attendance/:attendanceId/close error:', err);
    return res.status(500).json({ error: 'Failed to close attendance session' });
  }
}
