/**
 * GET /api/finance/estimates
 * Company-wide estimates list — additive, read-only.
 * Does NOT break the existing job-scoped GET /api/estimates contract.
 *
 * Query params (all optional):
 *   cursor    — last seen id for stable cursor pagination
 *   limit     — default 50, max 100
 *   search    — title / job name / client substring
 *   status    — exact status value (Draft|Sent|Accepted|Declined|Locked)
 *   jobId     — filter to a single job
 *   from      — ISO date string, filter updatedAt >= from
 *   to        — ISO date string, filter updatedAt <= to
 *
 * Security:
 *   - companyId derived from authenticated server-side profile only
 *   - client-supplied companyId is ignored
 *   - returns 401 when unauthenticated, 403 when no company
 *   - summary fields only; no estimate lines or private data returned
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';

function computeTotal(
  lines: { quantity: string; rate: string }[],
  markupPercent: string,
  gstMode: string,
): number {
  const subtotal = lines.reduce((sum, l) => {
    return sum + (parseFloat(l.quantity) || 0) * (parseFloat(l.rate) || 0);
  }, 0);
  const markup = (parseFloat(markupPercent) || 0) / 100;
  const afterMarkup = subtotal * (1 + markup);
  const gst = gstMode === 'Add 10% GST' ? afterMarkup * 0.1 : 0;
  return afterMarkup + gst;
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

    // Pagination
    const rawLimit = parseInt(String(req.query.limit ?? '50'), 10);
    const limit = Math.min(isNaN(rawLimit) ? 50 : rawLimit, 100);
    const cursor = req.query.cursor ? parseInt(String(req.query.cursor), 10) : null;

    // Filters
    const search  = req.query.search  ? String(req.query.search).trim()  : null;
    const status  = req.query.status  ? String(req.query.status).trim()  : null;
    const jobId   = req.query.jobId   ? parseInt(String(req.query.jobId), 10) : null;
    const fromDt  = req.query.from    ? String(req.query.from)            : null;
    const toDt    = req.query.to      ? String(req.query.to)              : null;

    // Build query — company predicate on both estimates and jobs tables
    let query = sql`
      SELECT
        e.id,
        e.job_id,
        e.company_id,
        e.title,
        e.status,
        e.markup_percent,
        e.gst_mode,
        e.notes,
        e.created_at,
        e.updated_at,
        e.locked,
        e.locked_at,
        e.locked_invoice_id,
        CASE WHEN e.locked_invoice_id IS NOT NULL AND inv.id IS NOT NULL THEN 1 ELSE 0 END AS invoice_exists,
        j.name        AS job_name,
        j.job_number  AS job_number,
        j.client      AS customer_name
      FROM estimates e
      INNER JOIN jobs j ON j.id = e.job_id AND j.company_id = ${companyId}
      LEFT JOIN invoices inv ON inv.id = e.locked_invoice_id AND inv.company_id = ${companyId}
      WHERE e.company_id = ${companyId}
    `;

    if (cursor && !isNaN(cursor)) {
      query = sql`${query} AND (e.updated_at < (SELECT updated_at FROM estimates WHERE id = ${cursor} AND company_id = ${companyId}) OR (e.updated_at = (SELECT updated_at FROM estimates WHERE id = ${cursor} AND company_id = ${companyId}) AND e.id < ${cursor}))`;
    }
    if (status)  query = sql`${query} AND e.status = ${status}`;
    if (jobId && !isNaN(jobId)) query = sql`${query} AND e.job_id = ${jobId}`;
    if (fromDt)  query = sql`${query} AND e.updated_at >= ${fromDt}`;
    if (toDt)    query = sql`${query} AND e.updated_at <= ${toDt}`;
    if (search) {
      const like = `%${search}%`;
      query = sql`${query} AND (e.title LIKE ${like} OR j.name LIKE ${like} OR j.client LIKE ${like})`;
    }

    query = sql`${query} ORDER BY e.updated_at DESC, e.id DESC LIMIT ${limit + 1}`;

    const [rows] = await db.execute(query) as unknown as [Array<Record<string, unknown>>, unknown];
    const allRows = rows ?? [];
    const hasMore = allRows.length > limit;
    const pageRows = hasMore ? allRows.slice(0, limit) : allRows;

    // Fetch summary totals (lines) for these estimates only
    const ids = pageRows.map((r) => r.id as number);
    let linesByEstimate = new Map<number, { quantity: string; rate: string }[]>();
    if (ids.length > 0) {
      const [allLines] = await db.execute(
        sql`SELECT estimate_id, quantity, rate FROM estimate_lines
            WHERE estimate_id IN (${sql.raw(ids.join(','))}) AND estimate_id IN (
              SELECT id FROM estimates WHERE company_id = ${companyId}
            )`
      ) as unknown as [Array<{ estimate_id: number; quantity: string; rate: string }>, unknown];
      for (const l of (allLines ?? [])) {
        const arr = linesByEstimate.get(l.estimate_id) ?? [];
        arr.push({ quantity: l.quantity, rate: l.rate });
        linesByEstimate.set(l.estimate_id, arr);
      }
    }

    const estimates = pageRows.map((est) => ({
      id:             est.id,
      jobId:          est.job_id,
      jobName:        est.job_name,
      jobNumber:      est.job_number,
      customerName:   est.customer_name,
      title:          est.title,
      status:         est.status,
      markupPercent:  est.markup_percent,
      gstMode:        est.gst_mode,
      createdAt:      est.created_at,
      updatedAt:      est.updated_at,
      locked:         est.locked,
      lockedAt:       est.locked_at,
      lockedInvoiceId: est.locked_invoice_id,
      invoiceExists:  est.invoice_exists === 1 || est.invoice_exists === true,
      total: computeTotal(
        linesByEstimate.get(est.id as number) ?? [],
        String(est.markup_percent ?? '0'),
        String(est.gst_mode ?? 'No GST'),
      ),
    }));

    const nextCursor = hasMore ? pageRows[pageRows.length - 1]?.id : null;

    return res.json({ estimates, hasMore, nextCursor });
  } catch (error) {
    console.error('GET /api/finance/estimates error:', error);
    return res.status(500).json({ error: 'Failed to fetch estimates' });
  }
}
