/**
 * GET /api/finance/ledger
 * Company-wide job cost ledger — additive, read-only.
 * Reads from the existing job_cost_ledger table.
 * Does NOT break the existing job-scoped GET /api/jobs/:id/ledger contract.
 *
 * Query params (all optional):
 *   cursor      — last seen id for stable cursor pagination
 *   limit       — default 50, max 100
 *   search      — description / job name substring
 *   jobId       — filter to a single job
 *   status      — pending|approved|all
 *   event_type  — LABOUR|MATERIAL|SUBCONTRACTOR|EQUIPMENT|OTHER
 *   from        — ISO date string, filter entry_date >= from
 *   to          — ISO date string, filter entry_date <= to
 *
 * Security:
 *   - companyId derived from authenticated server-side profile only
 *   - client-supplied companyId is ignored
 *   - company predicate on every joined table
 *   - returns 401 unauthenticated, 403 no company
 *   - response allowlist — no secrets, tokens, or unnecessary personal data
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';

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

    // Pagination
    const rawLimit = parseInt(String(req.query.limit ?? '50'), 10);
    const limit = Math.min(isNaN(rawLimit) ? 50 : rawLimit, 100);
    const cursor = req.query.cursor ? parseInt(String(req.query.cursor), 10) : null;

    // Filters
    const search    = req.query.search     ? String(req.query.search).trim()     : null;
    const status    = req.query.status     ? String(req.query.status)            : null;
    const eventType = req.query.event_type ? String(req.query.event_type)        : null;
    const jobId     = req.query.jobId      ? parseInt(String(req.query.jobId), 10) : null;
    const fromDt    = req.query.from       ? String(req.query.from)              : null;
    const toDt      = req.query.to         ? String(req.query.to)                : null;

    let query = sql`
      SELECT
        l.id,
        l.job_id,
        l.company_id,
        l.event_type,
        l.description,
        l.subtotal,
        l.gst,
        l.total,
        l.status,
        l.entry_date,
        l.created_at,
        l.updated_at,
        l.source_module,
        /* DDL uses contact_name / reference — alias to the names the handler expects */
        l.contact_name   AS supplier_name,
        l.reference      AS reference_number,
        j.name       AS job_name,
        j.job_number AS job_number
      FROM job_cost_ledger l
      INNER JOIN jobs j ON j.id = l.job_id AND j.company_id = ${companyId}
      WHERE l.company_id = ${companyId}
    `;

    if (cursor && !isNaN(cursor)) {
      query = sql`${query} AND (l.entry_date < (SELECT entry_date FROM job_cost_ledger WHERE id = ${cursor} AND company_id = ${companyId}) OR (l.entry_date = (SELECT entry_date FROM job_cost_ledger WHERE id = ${cursor} AND company_id = ${companyId}) AND l.id < ${cursor}))`;
    }
    if (status && status !== 'all') query = sql`${query} AND l.status = ${status}`;
    if (eventType && eventType !== 'all') query = sql`${query} AND l.event_type = ${eventType}`;
    if (jobId && !isNaN(jobId)) query = sql`${query} AND l.job_id = ${jobId}`;
    if (fromDt) query = sql`${query} AND l.entry_date >= ${fromDt}`;
    if (toDt)   query = sql`${query} AND l.entry_date <= ${toDt}`;
    if (search) {
      const like = `%${search}%`;
      query = sql`${query} AND (l.description LIKE ${like} OR j.name LIKE ${like})`;
    }

    query = sql`${query} ORDER BY l.entry_date DESC, l.created_at DESC, l.id DESC LIMIT ${limit + 1}`;

    const [rows] = await db.execute(query) as unknown as [Array<Record<string, unknown>>, unknown];
    const allRows = rows ?? [];
    const hasMore = allRows.length > limit;
    const pageRows = hasMore ? allRows.slice(0, limit) : allRows;

    // Summary totals over the full (unfiltered-by-cursor) result set for the same filters
    let summaryQuery = sql`
      SELECT
        SUM(CASE WHEN l.status = 'approved' THEN l.total ELSE 0 END) AS approved_total,
        SUM(CASE WHEN l.status = 'pending'  THEN l.total ELSE 0 END) AS pending_total,
        SUM(l.total) AS grand_total,
        COUNT(DISTINCT l.job_id) AS job_count
      FROM job_cost_ledger l
      INNER JOIN jobs j ON j.id = l.job_id AND j.company_id = ${companyId}
      WHERE l.company_id = ${companyId}
    `;
    if (status && status !== 'all') summaryQuery = sql`${summaryQuery} AND l.status = ${status}`;
    if (eventType && eventType !== 'all') summaryQuery = sql`${summaryQuery} AND l.event_type = ${eventType}`;
    if (jobId && !isNaN(jobId)) summaryQuery = sql`${summaryQuery} AND l.job_id = ${jobId}`;
    if (fromDt) summaryQuery = sql`${summaryQuery} AND l.entry_date >= ${fromDt}`;
    if (toDt)   summaryQuery = sql`${summaryQuery} AND l.entry_date <= ${toDt}`;
    if (search) {
      const like = `%${search}%`;
      summaryQuery = sql`${summaryQuery} AND (l.description LIKE ${like} OR j.name LIKE ${like})`;
    }

    const [summaryRows] = await db.execute(summaryQuery) as unknown as [Array<Record<string, unknown>>, unknown];
    const summary = summaryRows?.[0] ?? {};

    const entries = pageRows.map((r) => ({
      id:              r.id,
      jobId:           r.job_id,
      jobName:         r.job_name,
      jobNumber:       r.job_number,
      eventType:       r.event_type,
      description:     r.description,
      subtotal:        r.subtotal,
      gst:             r.gst,
      total:           r.total,
      status:          r.status,
      entryDate:       r.entry_date,
      createdAt:       r.created_at,
      updatedAt:       r.updated_at,
      supplierName:    r.supplier_name,
      sourceModule:    r.source_module,
      referenceNumber: r.reference_number,
    }));

    const nextCursor = hasMore ? pageRows[pageRows.length - 1]?.id : null;

    return res.json({
      entries,
      hasMore,
      nextCursor,
      summary: {
        approvedTotal: parseFloat(String(summary.approved_total ?? 0)),
        pendingTotal:  parseFloat(String(summary.pending_total  ?? 0)),
        grandTotal:    parseFloat(String(summary.grand_total    ?? 0)),
        jobCount:      parseInt(String(summary.job_count ?? 0), 10),
      },
    });
  } catch (error) {
    console.error('GET /api/finance/ledger error:', error);
    return res.status(500).json({ error: 'Failed to fetch ledger' });
  }
}
