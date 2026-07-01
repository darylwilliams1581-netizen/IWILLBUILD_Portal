/**
 * GET /api/fleet/vehicles
 * Returns only Vehicle-type fleet assets (not machinery/plant/equipment).
 * Used by the Start Driving modal.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  const session = (req as unknown as { user?: { id: string; companyId: number } }).user;
  if (!session?.id) return res.status(401).json({ error: 'Unauthorised' });

  const [rows] = await db.execute(
    sql`SELECT fa.id, fa.name, fa.type, fa.make_model, fa.rego, fa.rego_not_applicable, fa.status,
               (SELECT fds.driver_name FROM fleet_driver_sessions fds
                WHERE fds.fleet_asset_id = fa.id AND fds.status = 'active'
                LIMIT 1) as current_driver
        FROM fleet_assets fa
        WHERE fa.company_id = ${session.companyId}
          AND fa.type = 'Vehicle'
          AND fa.archived = 0
          AND fa.status != 'Out of Service'
        ORDER BY fa.name ASC`
  ) as unknown as [Array<Record<string, unknown>>, unknown];

  res.json({ vehicles: rows ?? [] });
}
