/**
 * GET /api/asset-manager/assets
 * Query: ?status=active|archived|all&search=&type=
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../lib/auth-middleware.js';

export default async function handler(req: Request, res: Response) {
  const sp = await getSessionAndProfile(req, res);
  if (!sp) return;
  const { profile } = sp;

  const status = (req.query.status as string) || 'active';
  const search = (req.query.search as string) || '';
  const type = (req.query.type as string) || '';

  try {
    let q = `SELECT * FROM am_assets WHERE company_id = ${profile.companyId}`;
    if (status === 'archived') q += ` AND archived_at IS NOT NULL`;
    else if (status === 'active') q += ` AND archived_at IS NULL`;
    if (search) q += ` AND (name LIKE '%${search.replace(/'/g, "''")}%' OR acronym LIKE '%${search.replace(/'/g, "''")}%' OR address LIKE '%${search.replace(/'/g, "''")}%')`;
    if (type) q += ` AND asset_type = '${type.replace(/'/g, "''")}'`;
    q += ` ORDER BY name ASC`;

    const [rows] = await db.execute(sql.raw(q)) as unknown as [unknown[], unknown];
    return res.json({ assets: rows ?? [] });
  } catch (err) {
    console.error('GET /api/asset-manager/assets error:', err);
    return res.status(500).json({ error: 'Failed to load assets' });
  }
}
