/**
 * GET /api/forms/submissions
 * Returns all public form submissions for the company, with template + job info.
 * Auth required.
 * Query: ?templateId=&jobId=&status=&limit=&offset=
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

    const { templateId, jobId, status, limit = '50', offset = '0' } = req.query as Record<string, string>;

    const conditions: string[] = [`fps.company_id = ${profile.companyId}`];
    if (templateId) conditions.push(`fps.template_id = ${parseInt(templateId, 10)}`);
    if (jobId)      conditions.push(`fps.job_id = ${parseInt(jobId, 10)}`);
    if (status)     conditions.push(`fps.status = '${status.replace(/'/g, "''")}'`);

    const where = conditions.join(' AND ');
    const lim   = Math.min(parseInt(limit, 10) || 50, 200);
    const off   = parseInt(offset, 10) || 0;

    const [rows] = await db.execute(sql.raw(`
      SELECT
        fps.id,
        fps.template_id,
        fps.submitter_name,
        fps.submitter_email,
        fps.job_id,
        fps.status,
        fps.submitted_at,
        fps.answers_json,
        ft.name AS template_name,
        ft.form_type,
        j.name AS job_name,
        j.job_number
      FROM form_public_submissions fps
      JOIN form_templates ft ON ft.id = fps.template_id
      LEFT JOIN jobs j ON j.id = fps.job_id
      WHERE ${where}
      ORDER BY fps.submitted_at DESC
      LIMIT ${lim} OFFSET ${off}
    `)) as unknown as [Array<Record<string, unknown>>];

    const [countRows] = await db.execute(sql.raw(`
      SELECT COUNT(*) AS total FROM form_public_submissions fps WHERE ${where}
    `)) as unknown as [Array<{ total: number }>];

    res.json({
      submissions: rows ?? [],
      total: countRows?.[0]?.total ?? 0,
    });
  } catch (err) {
    console.error('GET /api/forms/submissions error:', err);
    res.status(500).json({ error: 'Failed to load submissions' });
  }
}
