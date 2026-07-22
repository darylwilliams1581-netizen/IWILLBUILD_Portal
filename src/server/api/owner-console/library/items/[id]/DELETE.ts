/**
 * DELETE /api/owner-console/library/items/:id
 * Platform-owner only. Permanently removes a library item.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getPlatformOwnerInfo } from '../../../../../lib/platform-owner-guard.js';

export default async function handler(req: Request, res: Response) {
  const info = await getPlatformOwnerInfo(req);
  if (!info) return res.status(401).json({ error: 'Unauthorised' });
  if (!info.isPlatformOwner) return res.status(403).json({ error: 'Platform owner access required' });

  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });

  try {
    // Remove company-installed copies first (FK constraint: company_library_items → library_items)
    await db.execute(sql.raw(`DELETE FROM company_library_items WHERE source_item_id = ${id}`));
    await db.execute(sql.raw(`DELETE FROM library_items WHERE id = ${id}`));
    return res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/owner-console/library/items/:id error:', err);
    return res.status(500).json({ error: 'Failed to delete item' });
  }
}
