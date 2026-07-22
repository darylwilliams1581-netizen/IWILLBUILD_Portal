/**
 * GET /api/forms/jobs-list
 * Returns a lightweight list of jobs for the company — used by job_link field dropdowns.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../lib/auth-middleware.js';

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  const companyId = auth.profile.companyId;

  try {
    const [rows] = await db.execute(
      sql.raw(`
        SELECT id, job_number, name AS title, client, address, status
        FROM jobs
        WHERE company_id = ${companyId}
          AND status NOT IN ('completed', 'cancelled', 'archived')
        ORDER BY job_number ASC, created_at DESC
        LIMIT 300
      `)
    ) as unknown as [Array<{ id: number; job_number: string | null; title: string; client: string | null; address: string | null; status: string }>, unknown];

    return res.json({ ok: true, jobs: rows ?? [] });
  } catch (err) {
    console.error('GET /api/forms/jobs-list error:', err);
    return res.status(500).json({ error: 'Failed to fetch jobs' });
  }
}
