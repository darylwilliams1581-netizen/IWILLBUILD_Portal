/**
 * POST /api/rl-register
 * Create a new benchmark (RL register) for a job.
 * Admin/owner only.
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { profiles } from '../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';

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

    const isAdmin = profile.role === 'owner' || profile.role === 'admin';
    if (!isAdmin) return res.status(403).json({ error: 'Admin access required' });

    const { jobId, name, rl, description, location, dateEstablished, enteredBy, notes } = req.body as Record<string, unknown>;

    if (!jobId || !name || rl === undefined || rl === null || rl === '') {
      return res.status(400).json({ error: 'jobId, name and rl are required' });
    }

    const rlNum = parseFloat(String(rl));
    if (isNaN(rlNum)) return res.status(400).json({ error: 'rl must be a valid number' });

    // Verify job belongs to company
    const [jobRows] = await db.execute(sql.raw(
      `SELECT id FROM jobs WHERE id = ${Number(jobId)} AND company_id = ${profile.companyId} LIMIT 1`
    )) as unknown as [Array<{ id: number }>];
    if (!jobRows?.length) return res.status(404).json({ error: 'Job not found' });

    const [result] = await db.execute(sql.raw(`
      INSERT INTO rl_benchmarks
        (company_id, job_id, name, rl, description, location, date_established, entered_by, notes, created_by_user_id)
      VALUES
        (${profile.companyId}, ${Number(jobId)}, ${JSON.stringify(String(name))},
         ${rlNum},
         ${description ? JSON.stringify(String(description)) : 'NULL'},
         ${location ? JSON.stringify(String(location)) : 'NULL'},
         ${dateEstablished ? JSON.stringify(String(dateEstablished)) : 'NULL'},
         ${enteredBy ? JSON.stringify(String(enteredBy)) : 'NULL'},
         ${notes ? JSON.stringify(String(notes)) : 'NULL'},
         ${JSON.stringify(session.user.id)})
    `)) as unknown as [{ insertId?: number }];

    const newId = (result as unknown as { insertId?: number })?.insertId;
    return res.status(201).json({ ok: true, id: newId });
  } catch (err) {
    console.error('POST /api/rl-register error:', err);
    return res.status(500).json({ error: 'Failed to create benchmark' });
  }
}
