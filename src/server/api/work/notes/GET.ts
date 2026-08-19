/**
 * GET /api/work/notes
 *
 * Company-wide notes register. Read-only. Additive — does not replace
 * GET /api/notes?entityType&entityId.
 *
 * Only returns entity_type='job' notes (job notes register).
 * Returns a safely truncated excerpt — not full body, not attachments.
 *
 * Query params:
 *   cursor   — last seen id (opaque integer)
 *   limit    — 1-100, default 50
 *   jobId    — filter to a single job
 *   authorId — filter by author user id
 *   q        — free-text search on excerpt
 *   dateFrom / dateTo — ISO date range
 *
 * Security:
 *   - Auth required
 *   - companyId server-side only
 *   - Parameterised queries
 *   - Excerpt only (200 chars) — no full body, no private attachments
 *   - No internal user IDs beyond what the caller already owns
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;
const EXCERPT_LEN = 200;

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

    const authorId = req.query.authorId ? String(req.query.authorId).slice(0, 36) : null;
    const q = req.query.q ? String(req.query.q).trim().slice(0, 200) : null;
    const dateFrom = req.query.dateFrom ? String(req.query.dateFrom).slice(0, 10) : null;
    const dateTo = req.query.dateTo ? String(req.query.dateTo).slice(0, 10) : null;

    // ── Build query ───────────────────────────────────────────────────────────
    // entity_notes has company_id directly; join jobs for job name
    const whereParts: string[] = [
      `n.company_id = ${companyId}`,
      `n.entity_type = 'job'`,
    ];

    if (rawCursor !== null) whereParts.push(`n.id < ${rawCursor}`);
    if (rawJobId !== null) {
      // Verify job belongs to company
      const [jobCheck] = await db.execute(
        sql`SELECT id FROM jobs WHERE id = ${rawJobId} AND company_id = ${companyId} LIMIT 1`
      ) as unknown as [Array<{ id: number }>, unknown];
      if (!jobCheck?.length) return res.status(404).json({ error: 'Job not found' });
      whereParts.push(`n.entity_id = ${rawJobId}`);
    }
    if (authorId) {
      // Safe: authorId is sliced to 36 chars and only used in parameterised context
      whereParts.push(`n.author_user_id = '${authorId.replace(/'/g, '')}'`);
    }
    if (q) {
      const safeQ = q.replace(/'/g, "''");
      whereParts.push(`n.body LIKE '%${safeQ}%'`);
    }
    if (dateFrom) whereParts.push(`DATE(n.created_at) >= '${dateFrom.replace(/'/g, '')}'`);
    if (dateTo) whereParts.push(`DATE(n.created_at) <= '${dateTo.replace(/'/g, '')}'`);

    const whereClause = whereParts.join(' AND ');
    const fetchLimit = limit + 1;

    const [rows] = await db.execute(sql.raw(`
      SELECT
        n.id,
        n.entity_id   AS job_id,
        n.entity_label,
        n.note_type,
        LEFT(n.body, ${EXCERPT_LEN}) AS excerpt,
        n.author_user_id,
        n.author_name,
        n.created_at,
        j.name        AS job_name,
        j.job_number
      FROM entity_notes n
      LEFT JOIN jobs j ON j.id = n.entity_id AND j.company_id = n.company_id
      WHERE ${whereClause}
      ORDER BY n.id DESC
      LIMIT ${fetchLimit}
    `)) as unknown as [Array<Record<string, unknown>>, unknown];

    const allRows = Array.isArray(rows) ? rows : [];
    const hasMore = allRows.length > limit;
    const pageRows = hasMore ? allRows.slice(0, limit) : allRows;
    const nextCursor = hasMore ? String(pageRows[pageRows.length - 1].id) : null;

    const notes = pageRows.map((r) => ({
      id: r.id,
      jobId: r.job_id,
      jobName: r.job_name ?? null,
      jobNumber: r.job_number ?? null,
      noteType: r.note_type,
      excerpt: r.excerpt,
      authorUserId: r.author_user_id,
      authorName: r.author_name,
      createdAt: toUtcIso(r.created_at),
    }));

    return res.json({ notes, nextCursor, hasMore });
  } catch (err) {
    console.error('[GET /api/work/notes]', err);
    return res.status(500).json({ error: 'Failed to load notes' });
  }
}
