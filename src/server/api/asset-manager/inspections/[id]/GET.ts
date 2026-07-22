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
    const [rows] = await db.execute(sql`
      SELECT i.*, a.name as asset_name, a.acronym as asset_acronym, a.asset_type
      FROM am_inspections i LEFT JOIN am_assets a ON a.id = i.asset_id
      WHERE i.id = ${id} AND i.company_id = ${profile.companyId}
    `) as unknown as [unknown[], unknown];
    const inspection = (rows as Record<string, unknown>[])[0];
    if (!inspection) return res.status(404).json({ error: 'Not found' });

    const [defects] = await db.execute(sql`SELECT * FROM am_defects WHERE inspection_id = ${id} AND archived_at IS NULL ORDER BY severity DESC, created_at ASC`) as unknown as [unknown[], unknown];
    const [tenders] = await db.execute(sql`SELECT * FROM am_tender_cycles WHERE inspection_id = ${id} AND archived_at IS NULL ORDER BY created_at DESC`) as unknown as [unknown[], unknown];
    const [media] = await db.execute(sql`SELECT * FROM am_media WHERE inspection_id = ${id} ORDER BY created_at ASC`) as unknown as [unknown[], unknown];
    const [closeouts] = await db.execute(sql`SELECT * FROM am_closeout_forms WHERE inspection_id = ${id} AND archived_at IS NULL ORDER BY created_at DESC`) as unknown as [unknown[], unknown];

    return res.json({ inspection, defects: defects ?? [], tenders: tenders ?? [], media: media ?? [], closeouts: closeouts ?? [] });
  } catch (err) {
    console.error('GET /api/asset-manager/inspections/:id error:', err);
    return res.status(500).json({ error: 'Failed' });
  }
}
