/**
 * GET /api/jobs/:id/field-docs
 * Returns all job_swms records for a specific job, with signoff counts.
 * Also returns all signoffs across the job for the Sign-ons tab.
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
    if (!profile?.companyId) return res.json({ docs: [], signons: [] });

    const jobId = Number(req.params.id);
    if (!jobId) return res.status(400).json({ error: 'Invalid job id' });

    // Docs: job_swms for this job with signoff count
    const [docRows] = await db.execute(sql`
      SELECT js.*,
             j.name  AS job_name,
             j.job_number,
             j.client AS client_name,
             j.address AS job_site_address,
             COALESCE(sc.cnt, 0) AS signoff_count
      FROM job_swms js
      LEFT JOIN jobs j ON j.id = js.job_id AND j.company_id = js.company_id
      LEFT JOIN (
        SELECT job_swms_id, COUNT(*) AS cnt
        FROM swms_signoffs
        GROUP BY job_swms_id
      ) sc ON sc.job_swms_id = js.id
      WHERE js.company_id = ${profile.companyId}
        AND js.job_id = ${jobId}
      ORDER BY js.created_at DESC
    `) as unknown as [Array<Record<string, unknown>>, unknown];

    // Sign-ons: all signoffs for all SWMS on this job
    const [signonRows] = await db.execute(sql`
      SELECT ss.*,
             js.title AS doc_title
      FROM swms_signoffs ss
      JOIN job_swms js ON js.id = ss.job_swms_id
      WHERE js.company_id = ${profile.companyId}
        AND js.job_id = ${jobId}
      ORDER BY ss.signed_at DESC
    `) as unknown as [Array<Record<string, unknown>>, unknown];

    return res.json({ docs: docRows ?? [], signons: signonRows ?? [] });
  } catch (err) {
    console.error('[field-docs GET]', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
