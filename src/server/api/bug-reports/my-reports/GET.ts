/**
 * GET /api/bug-reports/my-reports
 * ─────────────────────────────────────────────────────────────────────────────
 * Returns the signed-in user's own bug reports with public status.
 * Joins incident_communications to surface any owner-approved public messages.
 * Never exposes internal details, stack traces, or other users' data.
 */
import type { Request, Response } from 'express';
import { getSessionAndProfile } from '../../../lib/auth-middleware.js';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const result = await getSessionAndProfile(req, res);
    if (!result) return; // response already sent by getSessionAndProfile
    const { session } = result;

    const userId = session.user.id;

    const [rows] = await db.execute(sql.raw(`
      SELECT
        br.id,
        br.category,
        LEFT(br.description, 200) AS description,
        br.status,
        br.created_at,
        br.updated_at,
        -- Latest approved communication for this bug report
        ic.id AS comm_id,
        ic.title AS public_title,
        ic.message AS public_message,
        ic.workaround,
        ic.comm_type AS public_comm_type,
        ic.status AS comm_status
      FROM bug_reports br
      LEFT JOIN incident_communications ic ON (
        ic.bug_report_id = br.id
        AND ic.status = 'approved'
        AND ic.removed_at IS NULL
        AND (ic.display_until IS NULL OR ic.display_until >= NOW())
        AND ic.id = (
          SELECT id FROM incident_communications
          WHERE bug_report_id = br.id AND status = 'approved' AND removed_at IS NULL
          ORDER BY created_at DESC LIMIT 1
        )
      )
      WHERE br.user_id = '${userId.replace(/'/g, "''")}' 
      ORDER BY br.created_at DESC
      LIMIT 20
    `)) as unknown as [Array<Record<string, unknown>>, unknown];

    // Map to public-safe shape
    const reports = (rows ?? []).map(r => {
      // Derive public_status from comm_type if a comm exists, else from internal status
      let publicStatus: string;
      if (r.comm_id) {
        const commType = String(r.public_comm_type ?? '');
        if (commType === 'resolved') publicStatus = 'resolved';
        else if (commType === 'modal') publicStatus = 'issue_confirmed';
        else if (commType === 'popup') publicStatus = 'repair_being_tested';
        else publicStatus = 'investigating';
      } else {
        const internalStatus = String(r.status ?? 'open');
        if (internalStatus === 'resolved') publicStatus = 'resolved';
        else if (internalStatus === 'in_progress') publicStatus = 'investigating';
        else publicStatus = 'received';
      }

      return {
        id: r.id,
        category: r.category,
        description: r.description,
        status: r.status,
        created_at: r.created_at,
        updated_at: r.updated_at,
        public_status: publicStatus,
        public_message: r.comm_id ? r.public_message : null,
        workaround: r.comm_id ? r.workaround : null,
        comm_id: r.comm_id ?? null,
      };
    });

    return res.json({ ok: true, reports });
  } catch (err) {
    console.error('[bug-reports/my-reports GET]', err);
    return res.status(500).json({ error: 'Failed to load reports.' });
  }
}
