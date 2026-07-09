/**
 * GET /api/asset-manager/tenders?assetId=&status=
 * Returns tenders for the company, optionally filtered by asset.
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
    let q = `SELECT t.*
             FROM am_tender_cycles t
             WHERE t.company_id = ${profile.companyId}`;
    if (assetId && !isNaN(assetId)) q += ` AND t.asset_id = ${assetId}`;
    if (status) q += ` AND t.award_status = '${status.replace(/'/g, "''")}'`;
    q += ` ORDER BY t.created_at DESC`;

    const [rows] = await db.execute(sql.raw(q)) as unknown as [unknown[], unknown];
    return res.json({ tenders: rows ?? [] });
  } catch (err) {
    console.error('GET /api/asset-manager/tenders error:', err);
    return res.status(500).json({ error: 'Failed' });
  }
}
