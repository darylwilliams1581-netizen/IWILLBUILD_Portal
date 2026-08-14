/**
 * GET /api/dazza/v3/client-rescue
 * ─────────────────────────────────────────────────────────────────────────────
 * Platform-owner only. Client rescue queue.
 * Query params: status (needs_call, called, resolved, all), limit
 */
import type { Request, Response } from 'express';
import { getPlatformOwnerInfo } from '../../../../lib/platform-owner-guard.js';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const ownerInfo = await getPlatformOwnerInfo(req);
    if (!ownerInfo) return res.status(401).json({ error: 'Unauthorised' });
    if (!ownerInfo.isPlatformOwner) return res.status(403).json({ error: 'Owner access required.' });

    const status = String(req.query.status ?? 'needs_call');
    const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10) || 50, 100);
    const whereStatus = status !== 'all' ? `AND dcr.rescue_status = '${status.replace(/'/g, "''")}'` : '';

    const [rows] = await db.execute(sql.raw(`
      SELECT dcr.id, dcr.incident_id, dcr.user_id, dcr.user_name,
             dcr.user_email, dcr.user_phone,
             dcr.attempted_action, dcr.failure_description,
             dcr.recovered, dcr.last_successful_action,
             dcr.likely_cause, dcr.safe_workaround,
             dcr.suggested_call_wording, dcr.rescue_status,
             dcr.called_at, dcr.resolved_at, dcr.created_at,
             di.title AS incident_title, di.severity AS incident_severity,
             di.affected_route
      FROM dazza_client_rescue dcr
      LEFT JOIN dazza_incidents di ON di.id = dcr.incident_id
      WHERE 1=1 ${whereStatus}
      ORDER BY
        CASE dcr.rescue_status WHEN 'needs_call' THEN 1 WHEN 'called' THEN 2 ELSE 3 END,
        dcr.created_at DESC
      LIMIT ${limit}
    `)) as unknown as [Array<Record<string, unknown>>, unknown];

    const [counts] = await db.execute(sql.raw(`
      SELECT rescue_status, COUNT(*) AS cnt
      FROM dazza_client_rescue
      GROUP BY rescue_status
    `)) as unknown as [Array<{ rescue_status: string; cnt: number }>, unknown];

    const statusCounts = Object.fromEntries(
      (counts ?? []).map(r => [r.rescue_status, Number(r.cnt)])
    );

    return res.json({
      ok: true,
      rescueEntries: rows ?? [],
      total: rows?.length ?? 0,
      statusCounts,
    });
  } catch (err) {
    console.error('[dazza/v3/client-rescue GET]', err);
    return res.status(500).json({ error: 'Failed to load rescue queue.' });
  }
}
