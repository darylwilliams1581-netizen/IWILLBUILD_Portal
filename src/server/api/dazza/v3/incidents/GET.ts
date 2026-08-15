/**
 * GET /api/dazza/v3/incidents
 * ─────────────────────────────────────────────────────────────────────────────
 * Platform-owner only. List incidents with filters.
 * Query params: severity, status, limit
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

    const severity = String(req.query.severity ?? 'all');
    const status = String(req.query.status ?? 'open');
    const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10) || 50, 100);

    const whereSeverity = severity !== 'all' ? `AND severity = '${severity.replace(/'/g, "''")}'` : '';
    const whereStatus = status !== 'all' ? `AND status = '${status.replace(/'/g, "''")}'` : '';

    const [rows] = await db.execute(sql.raw(`
      SELECT id, title, incident_type, severity, status,
             affected_route, affected_company_id, affected_user_count,
             first_seen_at, last_seen_at, event_count,
             likely_cause, confidence, data_loss_risk,
             immediate_workaround, customer_recovered,
             notification_sent, notification_sent_at,
             repair_prompt IS NOT NULL AS has_repair_prompt,
             created_at, updated_at
      FROM dazza_incidents
      WHERE 1=1 ${whereSeverity} ${whereStatus}
      ORDER BY
        CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
        last_seen_at DESC
      LIMIT ${limit}
    `)) as unknown as [Array<Record<string, unknown>>, unknown];

    // Count by severity
    const [counts] = await db.execute(sql.raw(`
      SELECT severity, COUNT(*) AS cnt
      FROM dazza_incidents
      WHERE status != 'resolved'
      GROUP BY severity
    `)) as unknown as [Array<{ severity: string; cnt: number }>, unknown];

    const severityCounts = Object.fromEntries(
      (counts ?? []).map(r => [r.severity, Number(r.cnt)])
    );

    return res.json({
      ok: true,
      incidents: rows ?? [],
      total: rows?.length ?? 0,
      severityCounts,
    });
  } catch (err) {
    console.error('[dazza/v3/incidents GET]', err);
    return res.status(500).json({ error: 'Failed to load incidents.' });
  }
}
