/**
 * GET /api/work/attendance
 *
 * Company-wide attendance register. Read-only. Additive — does not replace
 * GET /api/jobs/:id/signin-status.
 *
 * Returns:
 *   - currentlyOnSite: workers with net sign-ins > sign-outs across all jobs
 *   - history: paginated attendance log
 *
 * Query params:
 *   cursor     — last seen id (opaque integer)
 *   limit      — 1-100, default 50
 *   jobId      — filter to a single job
 *   userId     — filter to a single worker
 *   status     — signed_in | signed_out
 *   dateFrom / dateTo — ISO date range on created_at
 *
 * Security:
 *   - Auth required
 *   - companyId server-side only
 *   - Tenant-scoped via company_id AND inner join to company-owned job
 *   - NO QR tokens, NO sign-in tokens, NO private credentials in response
 *   - Response field allowlist
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

function toUtcIso(val: unknown): string | null {
  if (!val) return null;
  const s = String(val);
  return s.endsWith('Z') || s.includes('+') ? s : s + 'Z';
}

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
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const companyId = profile.companyId;

    // ── Parse & validate params ───────────────────────────────────────────────
    const rawLimit = parseInt(String(req.query.limit ?? DEFAULT_LIMIT), 10);
    const limit = isNaN(rawLimit) || rawLimit < 1 ? DEFAULT_LIMIT : Math.min(rawLimit, MAX_LIMIT);

    const rawCursor = req.query.cursor ? parseInt(String(req.query.cursor), 10) : null;
    if (req.query.cursor && (rawCursor === null || isNaN(rawCursor))) {
      return res.status(400).json({ error: 'Invalid cursor' });
    }

    const rawJobId = req.query.jobId ? parseInt(String(req.query.jobId), 10) : null;
    if (req.query.jobId && (rawJobId === null || isNaN(rawJobId))) {
      return res.status(400).json({ error: 'Invalid jobId' });
    }

    const userIdFilter = req.query.userId ? String(req.query.userId).slice(0, 36) : null;
    const statusFilter = req.query.status ? String(req.query.status) : null;
    const dateFrom = req.query.dateFrom ? String(req.query.dateFrom).slice(0, 10) : null;
    const dateTo = req.query.dateTo ? String(req.query.dateTo).slice(0, 10) : null;

    // ── Verify job if provided ────────────────────────────────────────────────
    if (rawJobId !== null) {
      const [jobCheck] = await db.execute(
        sql`SELECT id FROM jobs WHERE id = ${rawJobId} AND company_id = ${companyId} LIMIT 1`
      ) as unknown as [Array<{ id: number }>, unknown];
      if (!jobCheck?.length) return res.status(404).json({ error: 'Job not found' });
    }

    // ── 1. Currently on site (company-wide or job-filtered) ───────────────────
    const onSiteJobFilter = rawJobId !== null ? `AND ja.job_id = ${rawJobId}` : '';
    const [onSiteRows] = await db.execute(sql.raw(`
      SELECT
        ja.user_id,
        ja.job_id,
        MAX(CASE WHEN ja.action = 'signin' THEN ja.created_at END) AS signed_in_at,
        MAX(CASE WHEN ja.action = 'signin' THEN ja.actor_type END) AS actor_type,
        MAX(CASE WHEN ja.action = 'signin' THEN ja.source    END) AS source,
        u.name  AS user_name,
        u.email AS user_email,
        j.name  AS job_name,
        j.job_number
      FROM job_attendance ja
      INNER JOIN jobs j ON j.id = ja.job_id AND j.company_id = ${companyId}
      LEFT JOIN user u ON u.id = ja.user_id
      WHERE ja.company_id = ${companyId} ${onSiteJobFilter}
      GROUP BY ja.user_id, ja.job_id, u.name, u.email, j.name, j.job_number
      HAVING SUM(CASE WHEN ja.action = 'signin'  THEN 1 ELSE 0 END)
           > SUM(CASE WHEN ja.action = 'signout' THEN 1 ELSE 0 END)
      ORDER BY signed_in_at DESC
      LIMIT 200
    `)) as unknown as [Array<Record<string, unknown>>, unknown];

    const currentlyOnSite = (Array.isArray(onSiteRows) ? onSiteRows : []).map((r) => ({
      userId: r.user_id,
      jobId: r.job_id,
      jobName: r.job_name ?? null,
      jobNumber: r.job_number ?? null,
      signedInAt: toUtcIso(r.signed_in_at),
      actorType: r.actor_type ?? null,
      source: r.source ?? null,
      userName: r.user_name ?? null,
      userEmail: r.user_email ?? null,
    }));

    // ── 2. Paginated history ──────────────────────────────────────────────────
    const histWhere: string[] = [
      `ja.company_id = ${companyId}`,
      `j.company_id = ${companyId}`,
    ];

    if (rawCursor !== null) histWhere.push(`ja.id < ${rawCursor}`);
    if (rawJobId !== null) histWhere.push(`ja.job_id = ${rawJobId}`);
    if (userIdFilter) histWhere.push(`ja.user_id = '${userIdFilter.replace(/'/g, '')}'`);
    if (statusFilter === 'signed_in') histWhere.push(`ja.action = 'signin'`);
    else if (statusFilter === 'signed_out') histWhere.push(`ja.action = 'signout'`);
    if (dateFrom) histWhere.push(`DATE(ja.created_at) >= '${dateFrom.replace(/'/g, '')}'`);
    if (dateTo) histWhere.push(`DATE(ja.created_at) <= '${dateTo.replace(/'/g, '')}'`);

    const histWhereClause = histWhere.join(' AND ');
    const fetchLimit = limit + 1;

    const [histRows] = await db.execute(sql.raw(`
      SELECT
        ja.id,
        ja.job_id,
        ja.user_id,
        ja.action,
        ja.source,
        ja.actor_type,
        ja.notes,
        ja.created_at,
        u.name  AS user_name,
        u.email AS user_email,
        j.name  AS job_name,
        j.job_number
      FROM job_attendance ja
      INNER JOIN jobs j ON j.id = ja.job_id
      LEFT JOIN user u ON u.id = ja.user_id
      WHERE ${histWhereClause}
      ORDER BY ja.id DESC
      LIMIT ${fetchLimit}
    `)) as unknown as [Array<Record<string, unknown>>, unknown];

    const allHist = Array.isArray(histRows) ? histRows : [];
    const hasMore = allHist.length > limit;
    const pageHist = hasMore ? allHist.slice(0, limit) : allHist;
    const nextCursor = hasMore ? String(pageHist[pageHist.length - 1].id) : null;

    // Allowlist — NO tokens, NO QR secrets, NO private credentials
    const history = pageHist.map((r) => ({
      id: r.id,
      jobId: r.job_id,
      jobName: r.job_name ?? null,
      jobNumber: r.job_number ?? null,
      userId: r.user_id,
      userName: r.user_name ?? null,
      userEmail: r.user_email ?? null,
      action: r.action,
      source: r.source ?? null,
      actorType: r.actor_type ?? null,
      notes: r.notes ?? null,
      createdAt: toUtcIso(r.created_at),
    }));

    return res.json({ currentlyOnSite, history, nextCursor, hasMore });
  } catch (err) {
    console.error('[GET /api/work/attendance]', err);
    return res.status(500).json({ error: 'Failed to load attendance' });
  }
}
