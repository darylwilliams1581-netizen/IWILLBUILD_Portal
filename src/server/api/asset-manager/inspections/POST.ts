import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../lib/auth-middleware.js';

export default async function handler(req: Request, res: Response) {
  const sp = await getSessionAndProfile(req, res);
  if (!sp) return;
  const { session, profile } = sp;

  const { asset_id, report_no, inspection_date, report_title, overall_status, notes } = req.body as {
    asset_id?: number; report_no?: string; inspection_date?: string;
    report_title?: string; overall_status?: string; notes?: string;
  };
  if (!asset_id) return res.status(400).json({ error: 'asset_id is required' });

  try {
    const [result] = await db.execute(sql`
      INSERT INTO am_inspections (asset_id, company_id, report_no, inspection_date, report_title, overall_status, notes, created_by)
      VALUES (${asset_id}, ${profile.companyId}, ${report_no?.trim() || null},
              ${inspection_date || null}, ${report_title?.trim() || null},
              ${overall_status || 'draft'}, ${notes?.trim() || null}, ${session.user.id})
    `) as unknown as [{ insertId: number }, unknown];

    await db.execute(sql`INSERT INTO am_audit_log (entity_type, entity_id, action, actor_id) VALUES ('inspection', ${result.insertId}, 'created', ${session.user.id})`);

    const [rows] = await db.execute(sql`SELECT * FROM am_inspections WHERE id = ${result.insertId}`) as unknown as [unknown[], unknown];
    return res.status(201).json({ inspection: (rows as Record<string, unknown>[])[0] });
  } catch (err) {
    console.error('POST /api/asset-manager/inspections error:', err);
    return res.status(500).json({ error: 'Failed' });
  }
}
