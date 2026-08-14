/**
 * GET /api/dazza/v3/communications/owner
 * ─────────────────────────────────────────────────────────────────────────────
 * Owner-only. List all communications (all statuses) for the communication panel.
 * Query params: incidentId, status, limit
 */
import type { Request, Response } from 'express';
import { getPlatformOwnerInfo } from '../../../../../lib/platform-owner-guard.js';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const ownerInfo = await getPlatformOwnerInfo(req);
    if (!ownerInfo) return res.status(401).json({ error: 'Unauthorised' });
    if (!ownerInfo.isPlatformOwner) return res.status(403).json({ error: 'Owner access required.' });

    const incidentId = String(req.query.incidentId ?? '');
    const status = String(req.query.status ?? 'all');
    const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10) || 50, 100);

    const whereIncident = incidentId ? `AND ic.incident_id = '${incidentId.replace(/'/g, "''")}'` : '';
    const whereStatus = status !== 'all' ? `AND ic.status = '${status.replace(/'/g, "''")}'` : '';

    const [rows] = await db.execute(sql.raw(`
      SELECT ic.*,
             di.title AS incident_title, di.severity AS incident_severity
      FROM incident_communications ic
      LEFT JOIN dazza_incidents di ON di.id = ic.incident_id
      WHERE 1=1 ${whereIncident} ${whereStatus}
      ORDER BY ic.created_at DESC
      LIMIT ${limit}
    `)) as unknown as [Array<Record<string, unknown>>, unknown];

    return res.json({ ok: true, communications: rows ?? [] });
  } catch (err) {
    console.error('[dazza/v3/communications/owner GET]', err);
    return res.status(500).json({ error: 'Failed to load communications.' });
  }
}
