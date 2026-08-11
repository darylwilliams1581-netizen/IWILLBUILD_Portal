/**
 * GET /api/asset-manager/tenders/:id/attachments
 * List all attachments for a tender cycle.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../../lib/auth-middleware.js';
import { formatBytes } from '../../../../../lib/file-upload.js';

export default async function handler(req: Request, res: Response) {
  try {
    const sp = await getSessionAndProfile(req, res);
    if (!sp) return;
    const { profile } = sp;

    const tenderId = parseInt(String(req.params.id), 10);
    if (isNaN(tenderId)) return res.status(400).json({ error: 'Invalid tender id' });

    const [check] = await db.execute(sql`
      SELECT id FROM am_tender_cycles WHERE id = ${tenderId} AND company_id = ${profile.companyId}
    `) as unknown as [unknown[], unknown];
    if (!(check as unknown[]).length) return res.status(404).json({ error: 'Tender not found' });

    const [rows] = await db.execute(sql`
      SELECT * FROM tender_attachments
      WHERE tender_id = ${tenderId} AND company_id = ${profile.companyId}
      ORDER BY created_at ASC
    `) as unknown as [unknown[], unknown];

    const attachments = (rows as Record<string, unknown>[]).map((a) => ({
      ...a,
      url: `/airo-assets/uploads/tender-attachments/${a.stored_name}`,
      sizeLabel: formatBytes(Number(a.size_bytes ?? 0)),
    }));

    return res.json({ attachments });
  } catch (err) {
    console.error('[asset-manager/tenders/attachments] Unhandled error:', err);
    res.status(500).json({ error: 'Failed to fetch tender attachments' });
  }
}
