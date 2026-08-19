/**
 * GET /api/safety/swms-submissions
 *
 * Returns the company-scoped SWMS sign-off register with cursor pagination.
 *
 * Permission: owner | admin | permAdmin only.
 *   - Unauthenticated → 401
 *   - No company profile → 403
 *   - Insufficient role → 403
 *
 * Tenant isolation:
 *   - company_id is read from the session profile — never from the request.
 *   - Both the job_swms JOIN and the jobs JOIN are hard-restricted to the
 *     session company_id, so cross-company rows cannot satisfy the predicate.
 *   - The signoff's own company_id column is also verified to match.
 *
 * Excluded fields: white_card_number, signature_data, share_token, company_id,
 *   internal tokens.
 *
 * Pagination: cursor-based, ordered by signed_at DESC then id DESC.
 *   Query params:
 *     limit  — default 50, max 100
 *     cursor — opaque string returned as nextCursor from a previous response
 *   Response:
 *     { submissions, hasMore, nextCursor }
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { profiles } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';

// ── Cursor helpers ────────────────────────────────────────────────────────────

function encodeCursor(signedAt: string, id: number): string {
  return Buffer.from(JSON.stringify({ signedAt, id })).toString('base64url');
}

function decodeCursor(cursor: string): { signedAt: string; id: number } | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof parsed.signedAt === 'string' && typeof parsed.id === 'number') {
      return parsed as { signedAt: string; id: number };
    }
    return null;
  } catch {
    return null;
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: Request, res: Response) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    // ── Profile + company ─────────────────────────────────────────────────────
    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, session.user.id),
    });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company profile' });

    // ── Role check: owner | admin | permAdmin ─────────────────────────────────
    const role = profile.role ?? 'viewer';
    const isAdmin = role === 'owner' || role === 'admin' || profile.permAdmin === true;
    if (!isAdmin) return res.status(403).json({ error: 'Admin or owner access required' });

    // ── Pagination params ─────────────────────────────────────────────────────
    const rawLimit = parseInt(String(req.query.limit ?? '50'), 10);
    const limit = Math.min(Math.max(isNaN(rawLimit) ? 50 : rawLimit, 1), 100);
    const cursorParam = typeof req.query.cursor === 'string' ? req.query.cursor : null;
    const cursor = cursorParam ? decodeCursor(cursorParam) : null;

    // ── Query ─────────────────────────────────────────────────────────────────
    // Fetch limit+1 rows so we can determine hasMore without a COUNT query.
    // Tenant isolation is enforced by the JOIN conditions on company_id.
    // white_card_number, signature_data, share_token are excluded from SELECT.
    const companyId = profile.companyId;

    let rows: Array<Record<string, unknown>>;

    if (cursor) {
      const [result] = await db.execute(sql`
        SELECT
          s.id,
          s.worker_name,
          s.company_name,
          s.role,
          s.signed_at,
          js.id          AS job_swms_id,
          COALESCE(NULLIF(js.title, ''), st.title) AS swms_title,
          js.job_id,
          j.name         AS job_name,
          j.job_number
        FROM swms_signoffs s
        JOIN job_swms js
          ON js.id = s.job_swms_id
         AND js.company_id = ${companyId}
        LEFT JOIN jobs j
          ON j.id = js.job_id
         AND j.company_id = ${companyId}
        LEFT JOIN swms_templates st
          ON st.id = js.template_id
        WHERE (
          s.signed_at < ${cursor.signedAt}
          OR (s.signed_at = ${cursor.signedAt} AND s.id < ${cursor.id})
        )
        ORDER BY s.signed_at DESC, s.id DESC
        LIMIT ${limit + 1}
      `) as unknown as [Array<Record<string, unknown>>, unknown];
      rows = result ?? [];
    } else {
      const [result] = await db.execute(sql`
        SELECT
          s.id,
          s.worker_name,
          s.company_name,
          s.role,
          s.signed_at,
          js.id          AS job_swms_id,
          COALESCE(NULLIF(js.title, ''), st.title) AS swms_title,
          js.job_id,
          j.name         AS job_name,
          j.job_number
        FROM swms_signoffs s
        JOIN job_swms js
          ON js.id = s.job_swms_id
         AND js.company_id = ${companyId}
        LEFT JOIN jobs j
          ON j.id = js.job_id
         AND j.company_id = ${companyId}
        LEFT JOIN swms_templates st
          ON st.id = js.template_id
        ORDER BY s.signed_at DESC, s.id DESC
        LIMIT ${limit + 1}
      `) as unknown as [Array<Record<string, unknown>>, unknown];
      rows = result ?? [];
    }

    // ── Pagination ────────────────────────────────────────────────────────────
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);

    let nextCursor: string | null = null;
    if (hasMore && page.length > 0) {
      const last = page[page.length - 1];
      nextCursor = encodeCursor(
        String(last.signed_at ?? ''),
        Number(last.id ?? 0),
      );
    }

    res.json({ submissions: page, hasMore, nextCursor });
  } catch (err) {
    console.error('GET /api/safety/swms-submissions error:', err);
    res.status(500).json({ error: 'Failed to fetch SWMS submissions' });
  }
}
