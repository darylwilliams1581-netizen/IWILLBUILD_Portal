/**
 * GET /api/forms/assets-list
 * Returns a lightweight list of fleet assets for the company — used by asset_link field dropdowns.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../lib/auth-middleware.js';

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  const companyId = auth.profile.companyId;

  try {
    const [rows] = await db.execute(
      sql.raw(`
        SELECT id, name, registration, asset_type, status
        FROM fleet_assets
        WHERE company_id = ${companyId}
        ORDER BY name ASC
        LIMIT 200
      `)
    ) as unknown as [Array<{ id: number; name: string; registration: string | null; asset_type: string | null; status: string }>, unknown];

    return res.json({ ok: true, assets: rows ?? [] });
  } catch (err) {
    console.error('GET /api/forms/assets-list error:', err);
    return res.status(500).json({ error: 'Failed to fetch assets' });
  }
}
