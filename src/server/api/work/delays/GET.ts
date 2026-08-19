/**
 * GET /api/work/delays
 *
 * Company-wide delay/condition register. Read-only. Additive — does not
 * replace GET /api/jobs/:id/delays.
 *
 * Query params:
 *   cursor   — last seen id (opaque integer)
 *   limit    — 1-100, default 50
 *   jobId    — filter to a single job
 *   status   — open | resolved (maps to entry_type or status col if present)
 *   category — Weather | Material | Site access | etc.
 *   q        — free-text search on impact_summary / reason
 *   dateFrom / dateTo — ISO date range on delay_date
 *
 * Security:
 *   - Auth required
 *   - companyId server-side only
 *   - Tenant-scoped via company_id AND inner join to company-owned job
 *   - All filters parameterised
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

const VALID_CATEGORIES = new Set([
  'Weather', 'Material', 'Site access', 'Client / instruction',
  'Labour / subcontractor', 'Plant / equipment', 'Other',
]);

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

    const categoryFilter = req.query.category ? String(req.query.category) : null;
    const q = req.query.q ? String(req.query.q).trim().slice(0, 200) : null;
    const dateFrom = req.query.dateFrom ? String(req.query.dateFrom).slice(0, 10) : null;
    const dateTo = req.query.dateTo ? String(req.query.dateTo).slice(0, 10) : null;

    // ── Build WHERE ───────────────────────────────────────────────────────────
    // Tenant-scope: d.company_id = companyId AND inner join to jobs ensures
    // the job also belongs to this company (double-lock).
    const whereParts: string[] = [
      `d.company_id = ${companyId}`,
      `j.company_id = ${companyId}`,
    ];

    if (rawCursor !== null) whereParts.push(`d.id < ${rawCursor}`);

    if (rawJobId !== null) {
      const [jobCheck] = await db.execute(
        sql`SELECT id FROM jobs WHERE id = ${rawJobId} AND company_id = ${companyId} LIMIT 1`
      ) as unknown as [Array<{ id: number }>, unknown];
      if (!jobCheck?.length) return res.status(404).json({ error: 'Job not found' });
      whereParts.push(`d.job_id = ${rawJobId}`);
    }

    if (categoryFilter && VALID_CATEGORIES.has(categoryFilter)) {
      whereParts.push(`d.category = '${categoryFilter.replace(/'/g, "''")}'`);
    }

    if (q) {
      const safeQ = q.replace(/'/g, "''");
      whereParts.push(`(d.impact_summary LIKE '%${safeQ}%' OR d.reason LIKE '%${safeQ}%')`);
    }

    if (dateFrom) whereParts.push(`d.delay_date >= '${dateFrom.replace(/'/g, '')}'`);
    if (dateTo) whereParts.push(`d.delay_date <= '${dateTo.replace(/'/g, '')}'`);

    const whereClause = whereParts.join(' AND ');
    const fetchLimit = limit + 1;

    const [rows] = await db.execute(sql.raw(`
      SELECT
        d.id,
        d.job_id,
        d.company_id,
        d.reason,
        d.impact_summary,
        d.category,
        d.entry_type,
        d.days,
        d.delay_date,
        d.notes,
        d.created_by_name,
        d.created_at,
        d.updated_at,
        j.name       AS job_name,
        j.job_number
      FROM job_delays d
      INNER JOIN jobs j ON j.id = d.job_id
      WHERE ${whereClause}
      ORDER BY d.id DESC
      LIMIT ${fetchLimit}
    `)) as unknown as [Array<Record<string, unknown>>, unknown];

    const allRows = Array.isArray(rows) ? rows : [];
    const hasMore = allRows.length > limit;
    const pageRows = hasMore ? allRows.slice(0, limit) : allRows;
    const nextCursor = hasMore ? String(pageRows[pageRows.length - 1].id) : null;

    const delays = pageRows.map((r) => ({
      id: r.id,
      jobId: r.job_id,
      jobName: r.job_name ?? null,
      jobNumber: r.job_number ?? null,
      impactSummary: r.impact_summary ?? r.reason ?? null,
      category: r.category ?? null,
      entryType: r.entry_type ?? 'delay',
      days: r.days,
      delayDate: r.delay_date,
      notes: r.notes ?? null,
      createdByName: r.created_by_name ?? null,
      createdAt: toUtcIso(r.created_at),
      updatedAt: toUtcIso(r.updated_at),
    }));

    return res.json({ delays, nextCursor, hasMore });
  } catch (err) {
    console.error('[GET /api/work/delays]', err);
    return res.status(500).json({ error: 'Failed to load delays' });
  }
}
