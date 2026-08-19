/**
 * GET /api/safety/swms-submissions
 *
 * Returns all SWMS sign-off records for the authenticated user's company.
 * One row per worker acknowledgement — two workers signing the same SWMS
 * produce two rows.
 *
 * Company isolation: the JOIN through job_swms.company_id ensures only
 * records belonging to the caller's company are returned.
 *
 * Response shape:
 *   { submissions: SwmsSubmission[] }
 *
 * SwmsSubmission fields:
 *   id              — signoff row id
 *   worker_name
 *   company_name    — worker's company (nullable)
 *   role            — worker's role (nullable)
 *   white_card_number (nullable)
 *   signed_at       — ISO datetime
 *   job_swms_id     — the job SWMS record id
 *   swms_title      — immutable job SWMS title (falls back to template title)
 *   job_id
 *   job_name        — job name (nullable)
 *   job_number      — job number (nullable)
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

    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, session.user.id),
    });
    if (!profile?.companyId) return res.json({ submissions: [] });

    const [rows] = await db.execute(sql`
      SELECT
        s.id,
        s.worker_name,
        s.company_name,
        s.role,
        s.white_card_number,
        s.signed_at,
        js.id          AS job_swms_id,
        COALESCE(NULLIF(js.title, ''), st.title) AS swms_title,
        js.job_id,
        j.name         AS job_name,
        j.job_number
      FROM swms_signoffs s
      JOIN job_swms js
        ON js.id = s.job_swms_id
       AND js.company_id = ${profile.companyId}
      LEFT JOIN jobs j
        ON j.id = js.job_id
       AND j.company_id = ${profile.companyId}
      LEFT JOIN swms_templates st
        ON st.id = js.template_id
      ORDER BY s.signed_at DESC
    `) as unknown as [Array<Record<string, unknown>>, unknown];

    res.json({ submissions: rows ?? [] });
  } catch (err) {
    console.error('GET /api/safety/swms-submissions error:', err);
    res.status(500).json({ error: 'Failed to fetch SWMS submissions' });
  }
}
