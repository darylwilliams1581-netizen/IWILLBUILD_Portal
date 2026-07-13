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
        SELECT id, title, client, address, status
        FROM jobs
        WHERE company_id = ${companyId}
        ORDER BY created_at DESC
        LIMIT 200
      `)
    ) as unknown as [Array<{ id: number; title: string; client: string | null; address: string | null; status: string }>, unknown];

    return res.json({ ok: true, jobs: rows ?? [] });
  } catch (err) {
    console.error('GET /api/forms/jobs-list error:', err);
    return res.status(500).json({ error: 'Failed to fetch jobs' });
  }
}
