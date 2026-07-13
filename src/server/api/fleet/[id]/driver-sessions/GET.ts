/**
 * GET /api/fleet/:id/driver-sessions
 * Returns driver session history for a specific fleet asset.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  const session = (req as unknown as { user?: { id: string; companyId: number } }).user;
  if (!session?.id) return res.status(401).json({ error: 'Unauthorised' });

  const assetId = parseInt(req.params.id, 10);
  if (isNaN(assetId)) return res.status(400).json({ error: 'Invalid asset id' });

  const [rows] = await db.execute(
    sql`SELECT fds.id, fds.user_id, fds.driver_name, fds.start_at, fds.end_at, fds.status, fds.source
        FROM fleet_driver_sessions fds
        WHERE fds.company_id = ${session.companyId}
          AND fds.fleet_asset_id = ${assetId}
        ORDER BY fds.start_at DESC
        LIMIT 100`
  ) as unknown as [Array<Record<string, unknown>>, unknown];

  const sessions = (rows ?? []).map((r: Record<string, unknown>) => ({
    ...r,
    start_at: r.start_at ? (String(r.start_at).endsWith('Z') ? r.start_at : String(r.start_at).replace(' ', 'T') + 'Z') : null,
    end_at:   r.end_at   ? (String(r.end_at).endsWith('Z')   ? r.end_at   : String(r.end_at).replace(' ', 'T')   + 'Z') : null,
  }));

  res.json({ sessions });
}
