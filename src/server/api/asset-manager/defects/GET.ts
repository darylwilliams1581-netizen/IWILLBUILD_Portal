/**
 * GET /api/asset-manager/defects?assetId=&status=
 * Returns defects for the company, optionally filtered by asset.
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
  const status = (req.query.status as string) || '';

  try {
    let q = `SELECT d.*
             FROM am_defects d
             LEFT JOIN am_inspections i ON i.id = d.inspection_id
             WHERE d.company_id = ${profile.companyId}`;
    if (assetId && !isNaN(assetId)) q += ` AND i.asset_id = ${assetId}`;
    if (status === 'archived') q += ` AND d.archived_at IS NOT NULL`;
    else if (status === 'active') q += ` AND d.archived_at IS NULL`;
    q += ` ORDER BY d.created_at DESC`;

    const [rows] = await db.execute(sql.raw(q)) as unknown as [unknown[], unknown];
    return res.json({ defects: rows ?? [] });
  } catch (err) {
    console.error('GET /api/asset-manager/defects error:', err);
    return res.status(500).json({ error: 'Failed' });
  }
}
