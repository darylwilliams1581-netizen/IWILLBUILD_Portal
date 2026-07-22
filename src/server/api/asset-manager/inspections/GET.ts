/**
 * GET /api/asset-manager/inspections?assetId=&status=
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../lib/auth-middleware.js';

export default async function handler(req: Request, res: Response) {
  const sp = await getSessionAndProfile(req, res);
  if (!sp) return;
  const { profile } = sp;

  const assetId = req.query.assetId ? parseInt(String(req.query.assetId), 10) : null;
  const status = (req.query.status as string) || 'active';

  try {
    let q = `SELECT i.*, a.name as asset_name, a.acronym as asset_acronym
             FROM am_inspections i
             LEFT JOIN am_assets a ON a.id = i.asset_id
             WHERE i.company_id = ${profile.companyId}`;
    if (assetId && !isNaN(assetId)) q += ` AND i.asset_id = ${assetId}`;
    if (status === 'archived') q += ` AND i.archived_at IS NOT NULL`;
    else if (status === 'active') q += ` AND i.archived_at IS NULL`;
    q += ` ORDER BY i.inspection_date DESC, i.created_at DESC`;

    const [rows] = await db.execute(sql.raw(q)) as unknown as [unknown[], unknown];
    return res.json({ inspections: rows ?? [] });
  } catch (err) {
    console.error('GET /api/asset-manager/inspections error:', err);
    return res.status(500).json({ error: 'Failed' });
  }
}
