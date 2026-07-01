/**
 * GET /api/fleet/vehicles
 * Returns all active fleet assets for the company.
 * Used by the Start Driving modal — shows every asset a driver can select.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';

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

    const [rows] = await db.execute(
      sql`SELECT fa.id, fa.name, fa.type, fa.make_model, fa.rego, fa.rego_not_applicable, fa.status,
                 (SELECT fds.driver_name FROM fleet_driver_sessions fds
                  WHERE fds.fleet_asset_id = fa.id AND fds.status = 'active'
                  LIMIT 1) as current_driver
          FROM fleet_assets fa
          WHERE fa.company_id = ${profile.companyId}
            AND fa.archived = 0
            AND fa.status != 'Out of Service'
          ORDER BY fa.name ASC`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    res.json({ vehicles: rows ?? [] });
  } catch (error) {
    console.error('GET /api/fleet/vehicles error:', error);
    res.status(500).json({ error: 'Failed to load fleet assets' });
  }
}
