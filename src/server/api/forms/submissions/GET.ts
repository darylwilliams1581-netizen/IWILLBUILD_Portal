/**
 * GET /api/forms/submissions
 * Returns a combined, company-isolated list of form submissions.
 *
 * Sources:
 *   - Internal: job_form_submissions WHERE status = 'completed'
 *   - Public:   form_public_submissions (all statuses)
 *
 * By default, archived submissions are EXCLUDED.
 * Pass ?archived=1 to return ONLY archived submissions.
 *
 * Normalised response shape:
 *   {
 *     submissions: NormalisedSubmission[],
 *     total: number
 *   }
 *
 * NormalisedSubmission:
 *   id              – original table PK
 *   source          – 'internal' | 'public'
 *   template_id
 *   template_name
 *   form_type
 *   job_id          – null for public submissions without a job
 *   job_number      – null when no job
 *   job_name        – null when no job
 *   submitter_name
 *   submitter_email – null for internal (not stored)
 *   status
 *   completed_at    – ISO timestamp
 *   answers_json
 *   form_route      – '/jobs/:jobId/forms/:id' for internal; null for public
 *   archived_at     – ISO timestamp or null
 *   archived_by     – name/email of archiver or null
 *   archive_reason  – free-text or null
 *   legal_hold      – 0 or 1
 *
 * Query params:
 *   templateId  – filter by template
 *   archived    – '1' to return archived submissions only (default: active only)
 *   limit       – default 100, max 200
 *   offset      – default 0
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

    const companyId = profile.companyId;
    const { templateId, limit = '100', offset = '0', archived = '0' } = req.query as Record<string, string>;

    const lim = Math.min(parseInt(limit, 10) || 100, 200);
    const off = parseInt(offset, 10) || 0;
    const tidFilter = templateId ? `AND template_id = ${parseInt(templateId, 10)}` : '';
    const showArchived = archived === '1';

    // archived_at filter — default view excludes archived; archived view includes only archived
    const archiveFilter = showArchived
      ? 'AND archived_at IS NOT NULL'
      : 'AND archived_at IS NULL';

    // ── Internal: completed job_form_submissions ──────────────────────────────
    const [internalRows] = await db.execute(sql.raw(`
      SELECT
        jfs.id,
        'internal'                          AS source,
        jfs.template_id,
        ft.name                             AS template_name,
        ft.form_type,
        jfs.job_id,
        j.job_number,
        j.name                              AS job_name,
        jfs.completed_by_name               AS submitter_name,
        NULL                                AS submitter_email,
        jfs.status,
        jfs.updated_at                      AS completed_at,
        jfs.answers_json,
        CONCAT('/jobs/', jfs.job_id, '/forms/', jfs.id) AS form_route,
        jfs.archived_at,
        jfs.archived_by,
        jfs.archive_reason,
        COALESCE(jfs.legal_hold, 0)         AS legal_hold
      FROM job_form_submissions jfs
      JOIN form_templates ft ON ft.id = jfs.template_id
      JOIN jobs j            ON j.id  = jfs.job_id
      WHERE jfs.company_id = ${companyId}
        AND jfs.status = 'completed'
        ${archiveFilter}
        ${tidFilter}
    `)) as unknown as [Array<Record<string, unknown>>];

    // ── Public: form_public_submissions ───────────────────────────────────────
    const [publicRows] = await db.execute(sql.raw(`
      SELECT
        fps.id,
        'public'                            AS source,
        fps.template_id,
        ft.name                             AS template_name,
        ft.form_type,
        fps.job_id,
        j.job_number,
        j.name                              AS job_name,
        fps.submitter_name,
        fps.submitter_email,
        fps.status,
        fps.submitted_at                    AS completed_at,
        fps.answers_json,
        NULL                                AS form_route,
        fps.archived_at,
        fps.archived_by,
        fps.archive_reason,
        COALESCE(fps.legal_hold, 0)         AS legal_hold
      FROM form_public_submissions fps
      JOIN form_templates ft ON ft.id = fps.template_id
      LEFT JOIN jobs j       ON j.id  = fps.job_id
      WHERE fps.company_id = ${companyId}
        ${archiveFilter}
        ${tidFilter}
    `)) as unknown as [Array<Record<string, unknown>>];

    // ── Merge, sort by completed_at DESC, paginate ────────────────────────────
    const all = [...(internalRows ?? []), ...(publicRows ?? [])].sort((a, b) => {
      const ta = a.completed_at ? new Date(a.completed_at as string).getTime() : 0;
      const tb = b.completed_at ? new Date(b.completed_at as string).getTime() : 0;
      return tb - ta;
    });

    const total = all.length;
    const page  = all.slice(off, off + lim);

    res.json({ submissions: page, total });
  } catch (err) {
    console.error('GET /api/forms/submissions error:', err);
    res.status(500).json({ error: 'Failed to load submissions' });
  }
}
