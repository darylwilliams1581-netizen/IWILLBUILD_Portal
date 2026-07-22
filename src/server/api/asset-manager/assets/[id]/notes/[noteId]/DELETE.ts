/**
 * DELETE /api/asset-manager/assets/:id/notes/:noteId
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../../../lib/auth-middleware.js';

export default async function handler(req: Request, res: Response) {
  const sp = await getSessionAndProfile(req, res);
  if (!sp) return;
  const { profile } = sp;
  const assetId = parseInt(String(req.params.id), 10);
  const noteId  = parseInt(String(req.params.noteId), 10);
  if (isNaN(assetId) || isNaN(noteId)) return res.status(400).json({ error: 'Invalid id' });

  try {
    const [check] = await db.execute(sql.raw(`
      SELECT n.id FROM am_asset_notes n
      JOIN am_assets a ON a.id = n.asset_id
      WHERE n.id = ${noteId} AND n.asset_id = ${assetId} AND a.company_id = ${profile.companyId}
    `)) as unknown as [unknown[], unknown];
    if (!(check as unknown[]).length) return res.status(404).json({ error: 'Not found' });

    await db.execute(sql.raw(`DELETE FROM am_asset_notes WHERE id = ${noteId}`));
    return res.json({ ok: true });
  } catch (err) {
    console.error('DELETE asset note error:', err);
    return res.status(500).json({ error: 'Failed' });
  }
}
