/**
 * GET /api/dazza/v3/communications
 * ─────────────────────────────────────────────────────────────────────────────
 * Returns active, approved communications relevant to the signed-in user.
 * Used by the dashboard banner and bug widget status centre.
 *
 * Targeting logic (server-side):
 *   - target_scope = 'all'            → everyone
 *   - target_scope = 'affected_users' → user's company matches OR user_id matches
 *   - target_scope = 'company'        → user's company_id matches target_company_id
 *   - target_scope = 'user'           → user_id matches target_user_id
 *   - target_scope = 'build'          → client sends ?build=X, matches target_build
 *
 * Excludes communications the user has already dismissed (non-critical only).
 * Auth: any authenticated user.
 */
import type { Request, Response } from 'express';
import { getSessionAndProfile } from '../../../../lib/auth-middleware.js';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const { session } = await getSessionAndProfile(req);
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const userId = session.user.id;
    const build = String(req.query.build ?? '');

    // Get user's company_id
    const [companyRows] = await db.execute(sql.raw(`
      SELECT company_id FROM company_users WHERE user_id = '${userId.replace(/'/g, "''")}' LIMIT 1
    `)) as unknown as [Array<{ company_id: number }>, unknown];
    const companyId = companyRows?.[0]?.company_id ?? null;

    const now = 'NOW()';
    const buildClause = build ? `OR (ic.target_scope = 'build' AND ic.target_build = '${build.replace(/'/g, "''")}')` : '';

    const [rows] = await db.execute(sql.raw(`
      SELECT ic.id, ic.incident_id, ic.bug_report_id, ic.comm_type, ic.channel,
             ic.status, ic.title, ic.message, ic.workaround,
             ic.action_label, ic.action_url,
             ic.target_scope, ic.is_dismissible, ic.is_critical,
             ic.display_from, ic.display_until,
             ic.created_at, ic.updated_at,
             di.title AS incident_title, di.severity AS incident_severity,
             di.status AS incident_status
      FROM incident_communications ic
      LEFT JOIN dazza_incidents di ON di.id = ic.incident_id
      WHERE ic.status = 'approved'
        AND (ic.display_from IS NULL OR ic.display_from <= ${now})
        AND (ic.display_until IS NULL OR ic.display_until >= ${now})
        AND ic.removed_at IS NULL
        AND (
          ic.target_scope = 'all'
          OR (ic.target_scope = 'affected_users' AND (
            ic.target_company_id = ${companyId ?? 'NULL'} OR ic.target_user_id = '${userId.replace(/'/g, "''")}'
          ))
          OR (ic.target_scope = 'company' AND ic.target_company_id = ${companyId ?? 'NULL'})
          OR (ic.target_scope = 'user' AND ic.target_user_id = '${userId.replace(/'/g, "''")}')
          ${buildClause}
        )
        AND ic.id NOT IN (
          SELECT comm_id FROM incident_comm_dismissals
          WHERE user_id = '${userId.replace(/'/g, "''")}' AND (
            SELECT is_critical FROM incident_communications WHERE id = comm_id LIMIT 1
          ) = 0
        )
      ORDER BY ic.is_critical DESC, ic.created_at DESC
      LIMIT 10
    `)) as unknown as [Array<Record<string, unknown>>, unknown];

    // Increment view count (fire-and-forget)
    if (rows?.length) {
      const ids = (rows as Array<{ id: string }>).map(r => `'${r.id}'`).join(',');
      void db.execute(sql.raw(`
        UPDATE incident_communications SET view_count = view_count + 1 WHERE id IN (${ids})
      `)).catch(() => {});
    }

    return res.json({ ok: true, communications: rows ?? [] });
  } catch (err) {
    console.error('[dazza/v3/communications GET]', err);
    return res.status(500).json({ error: 'Failed to load communications.' });
  }
}
