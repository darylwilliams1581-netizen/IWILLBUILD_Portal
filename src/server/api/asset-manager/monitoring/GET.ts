/**
 * GET /api/asset-manager/monitoring
 * Returns inspections + tenders with timeline/status for the monitoring board.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../lib/auth-middleware.js';

export default async function handler(req: Request, res: Response) {
  const sp = await getSessionAndProfile(req, res);
  if (!sp) return;
  const { profile } = sp;

  try {
    const [rows] = await db.execute(sql`
      SELECT
        i.id, i.report_no, i.report_title, i.inspection_date, i.overall_status,
        i.created_at, i.updated_at,
        a.name as asset_name, a.acronym as asset_acronym,
        (SELECT COUNT(*) FROM am_defects d WHERE d.inspection_id = i.id AND d.status = 'open' AND d.archived_at IS NULL) as open_defects,
        (SELECT COUNT(*) FROM am_defects d WHERE d.inspection_id = i.id AND d.archived_at IS NULL) as total_defects,
        (SELECT COUNT(*) FROM am_tender_cycles t WHERE t.inspection_id = i.id AND t.archived_at IS NULL) as tender_count,
        (SELECT MAX(t.award_status) FROM am_tender_cycles t WHERE t.inspection_id = i.id AND t.archived_at IS NULL) as latest_tender_status,
        (SELECT MIN(t.quote_due_at) FROM am_tender_cycles t WHERE t.inspection_id = i.id AND t.award_status = 'requested' AND t.archived_at IS NULL) as next_due
      FROM am_inspections i
      LEFT JOIN am_assets a ON a.id = i.asset_id
      WHERE i.company_id = ${profile.companyId} AND i.archived_at IS NULL
      ORDER BY i.inspection_date DESC, i.created_at DESC
      LIMIT 200
    `) as unknown as [unknown[], unknown];

    return res.json({ items: rows ?? [] });
  } catch (err) {
    console.error('GET /api/asset-manager/monitoring error:', err);
    return res.status(500).json({ error: 'Failed' });
  }
}
