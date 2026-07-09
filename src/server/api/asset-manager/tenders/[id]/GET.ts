/**
 * GET /api/asset-manager/tenders/:id
 * Returns a single tender with linked asset + inspection info.
 */
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
    const [rows] = await db.execute(sql.raw(`
      SELECT t.*,
             a.name  AS asset_name,
             a.acronym AS asset_acronym,
             a.address AS asset_address,
             a.asset_type,
             i.report_title AS inspection_title,
             i.report_no    AS inspection_no
      FROM am_tender_cycles t
      LEFT JOIN am_assets      a ON a.id = t.asset_id
      LEFT JOIN am_inspections i ON i.id = t.inspection_id
      WHERE t.id = ${id} AND t.company_id = ${profile.companyId}
    `)) as unknown as [unknown[], unknown];

    const tender = (rows as Record<string, unknown>[])[0];
    if (!tender) return res.status(404).json({ error: 'Not found' });

    return res.json({ tender });
  } catch (err) {
    console.error('GET /api/asset-manager/tenders/:id error:', err);
    return res.status(500).json({ error: 'Failed' });
  }
}
