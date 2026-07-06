/**
 * GET /api/asset-manager/reports/:shareToken
 * Public read-only endpoint — no auth required, token-validated.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { createHash } from 'crypto';

export default async function handler(req: Request, res: Response) {
  const { shareToken } = req.params;
  if (!shareToken) return res.status(400).json({ error: 'Token required' });

  const tokenHash = createHash('sha256').update(shareToken).digest('hex');

  try {
    const [shareRows] = await db.execute(sql`
      SELECT * FROM am_report_shares
      WHERE token_hash = ${tokenHash}
        AND revoked = 0
        AND (expires_at IS NULL OR expires_at > NOW())
    `) as unknown as [Array<{ inspection_id: number; scope: string; expires_at: string | null }>, unknown];

    if (!shareRows.length) return res.status(404).json({ error: 'Link not found or expired' });
    const share = shareRows[0];

    const [iRows] = await db.execute(sql`
      SELECT i.*, a.name as asset_name, a.acronym as asset_acronym, a.address as asset_address, a.asset_type
      FROM am_inspections i LEFT JOIN am_assets a ON a.id = i.asset_id
      WHERE i.id = ${share.inspection_id}
    `) as unknown as [unknown[], unknown];
    const inspection = (iRows as Record<string, unknown>[])[0];
    if (!inspection) return res.status(404).json({ error: 'Inspection not found' });

    const [defects] = await db.execute(sql`SELECT * FROM am_defects WHERE inspection_id = ${share.inspection_id} AND archived_at IS NULL ORDER BY severity DESC`) as unknown as [unknown[], unknown];
    const [media] = await db.execute(sql`SELECT * FROM am_media WHERE inspection_id = ${share.inspection_id} ORDER BY created_at ASC`) as unknown as [unknown[], unknown];
    const [tenders] = await db.execute(sql`SELECT * FROM am_tender_cycles WHERE inspection_id = ${share.inspection_id} AND archived_at IS NULL ORDER BY created_at DESC`) as unknown as [unknown[], unknown];

    return res.json({ inspection, defects: defects ?? [], media: media ?? [], tenders: tenders ?? [], scope: share.scope, expiresAt: share.expires_at });
  } catch (err) {
    console.error('GET asset-manager report share error:', err);
    return res.status(500).json({ error: 'Failed' });
  }
}
