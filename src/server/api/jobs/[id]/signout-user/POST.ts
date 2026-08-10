/**
 * POST /api/jobs/:id/signout-user
 *
 * Supervisor force-sign-out a specific user from a job.
 * Requires role = owner | admin | supervisor.
 *
 * Body: { userId: string; notes?: string }
 * Returns: { ok, message }
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../lib/auth-middleware.js';

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  const { role } = auth.profile as { role?: string };
  const allowedRoles = new Set(['owner', 'admin', 'supervisor']);
  if (!allowedRoles.has(role ?? '')) {
    return res.status(403).json({ error: 'Supervisor access required' });
  }

  const jobId     = parseInt(req.params.id);
  const companyId = auth.profile.companyId;
  const { userId, notes } = req.body as { userId?: string; notes?: string };

  if (!jobId || !userId) {
    return res.status(400).json({ error: 'Invalid job id or userId' });
  }

  const safeUserId = String(userId).replace(/'/g, '').slice(0, 36);
  const safeNotes  = notes
    ? `'${String(notes).replace(/'/g, "''").slice(0, 500)}'`
    : "'Supervisor sign-out'";

  try {
    // Verify job belongs to company
    const jobRows = (await db.execute(
      sql.raw(`SELECT id FROM jobs WHERE id = ${jobId} AND company_id = ${companyId} LIMIT 1`)
    ) as unknown as [Array<{ id: number }>, unknown])[0];
    if (!jobRows?.[0]) return res.status(404).json({ error: 'Job not found' });

    // Check user is actually signed in (net ins > outs)
    const netRows = (await db.execute(
      sql.raw(`
        SELECT
          SUM(CASE WHEN action = 'signin'  THEN 1 ELSE 0 END) AS ins,
          SUM(CASE WHEN action = 'signout' THEN 1 ELSE 0 END) AS outs
        FROM job_attendance
        WHERE job_id = ${jobId} AND company_id = ${companyId} AND user_id = '${safeUserId}'
      `)
    ) as unknown as [Array<{ ins: number; outs: number }>, unknown])[0];

    const ins  = Number(netRows?.[0]?.ins  ?? 0);
    const outs = Number(netRows?.[0]?.outs ?? 0);

    if (ins <= outs) {
      return res.json({ ok: true, alreadyOut: true, message: 'User is not currently signed in.' });
    }

    // Insert signout row for the target user, attributed to supervisor
    await db.execute(
      sql.raw(`
        INSERT INTO job_attendance (company_id, job_id, user_id, action, source, actor_type, notes)
        SELECT company_id, job_id, user_id,
               'signout', 'supervisor_override', actor_type, ${safeNotes}
        FROM job_attendance
        WHERE job_id = ${jobId} AND company_id = ${companyId} AND user_id = '${safeUserId}'
          AND action = 'signin'
        ORDER BY created_at DESC
        LIMIT 1
      `)
    );

    return res.json({ ok: true, message: 'User signed out by supervisor.' });
  } catch (err) {
    console.error('POST /api/jobs/:id/signout-user error:', err);
    return res.status(500).json({ error: 'Failed to sign out user' });
  }
}
