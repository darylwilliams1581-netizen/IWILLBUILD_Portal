/**
 * DELETE /api/asset-manager/tenders/:id/attachments/:fileId
 * Delete a specific attachment from a tender cycle.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../../../lib/auth-middleware.js';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';

const UPLOAD_DIR = '/shared-storage/public/assets/tender-attachments';

export default async function handler(req: Request, res: Response) {
  const sp = await getSessionAndProfile(req, res);
  if (!sp) return;
  const { profile } = sp;

  const tenderId = parseInt(String(req.params.id), 10);
  const fileId   = parseInt(String(req.params.fileId), 10);
  if (isNaN(tenderId) || isNaN(fileId)) return res.status(400).json({ error: 'Invalid id' });

  // Fetch the attachment — must belong to this company
  const [rows] = await db.execute(sql`
    SELECT ta.* FROM tender_attachments ta
    JOIN am_tender_cycles tc ON tc.id = ta.tender_id
    WHERE ta.id = ${fileId} AND ta.tender_id = ${tenderId} AND ta.company_id = ${profile.companyId}
  `) as unknown as [unknown[], unknown];

  const attachment = (rows as Record<string, unknown>[])[0];
  if (!attachment) return res.status(404).json({ error: 'Attachment not found' });

  // Delete physical file (best-effort — don't fail if already gone)
  try {
    await unlink(join(UPLOAD_DIR, String(attachment.stored_name)));
  } catch {
    // ignore ENOENT
  }

  await db.execute(sql`DELETE FROM tender_attachments WHERE id = ${fileId}`);

  return res.json({ ok: true });
}
