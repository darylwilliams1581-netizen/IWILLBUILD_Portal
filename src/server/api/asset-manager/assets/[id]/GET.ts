import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../lib/auth-middleware.js';

export default async function handler(req: Request, res: Response) {
  const sp = await getSessionAndProfile(req, res);
  if (!sp) return;
  const { profile } = sp;
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

  try {
    const [rows] = await db.execute(sql`SELECT * FROM am_assets WHERE id = ${id} AND company_id = ${profile.companyId}`) as unknown as [unknown[], unknown];
    const asset = (rows as Record<string, unknown>[])[0];
    if (!asset) return res.status(404).json({ error: 'Not found' });
    return res.json({ asset });
  } catch (err) {
    console.error('GET /api/asset-manager/assets/:id error:', err);
    return res.status(500).json({ error: 'Failed' });
  }
}
