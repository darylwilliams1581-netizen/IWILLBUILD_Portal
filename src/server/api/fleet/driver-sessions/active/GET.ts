/**
 * GET /api/fleet/driver-sessions/active
 * Returns the current user's active driving session (if any).
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  const session = (req as unknown as { user?: { id: string; companyId: number } }).user;
  if (!session?.id) return res.status(401).json({ error: 'Unauthorised' });

  const [rows] = await db.execute(
    sql`SELECT fds.id, fds.fleet_asset_id, fds.driver_name, fds.start_at, fds.status, fds.source,
               fa.name as asset_name, fa.type as asset_type, fa.rego
        FROM fleet_driver_sessions fds
        JOIN fleet_assets fa ON fa.id = fds.fleet_asset_id
        WHERE fds.company_id = ${session.companyId}
          AND fds.user_id = ${session.id}
          AND fds.status = 'active'
        ORDER BY fds.start_at DESC LIMIT 1`
  ) as unknown as [Array<Record<string, unknown>>, unknown];

  res.json({ session: rows[0] ?? null });
}
