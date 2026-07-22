/**
 * DELETE /api/asset-manager/assets/:id/photos/:photoId
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../../../lib/auth-middleware.js';
import fs from 'fs/promises';
import path from 'path';

export default async function handler(req: Request, res: Response) {
  const sp = await getSessionAndProfile(req, res);
  if (!sp) return;
  const { profile } = sp;
  const assetId  = parseInt(String(req.params.id), 10);
  const photoId  = parseInt(String(req.params.photoId), 10);
  if (isNaN(assetId) || isNaN(photoId)) return res.status(400).json({ error: 'Invalid id' });

  try {
    const [rows] = await db.execute(sql.raw(`
      SELECT p.id, p.file_path FROM am_asset_photos p
      JOIN am_assets a ON a.id = p.asset_id
      WHERE p.id = ${photoId} AND p.asset_id = ${assetId} AND a.company_id = ${profile.companyId}
    `)) as unknown as [Array<{ id: number; file_path: string }>, unknown];
    if (!rows.length) return res.status(404).json({ error: 'Not found' });

    // Best-effort file deletion
    const filePath = rows[0].file_path;
    if (filePath) {
      const filename = path.basename(filePath);
      const diskPath = `/shared-storage/public/assets/am-asset-photos/${filename}`;
      await fs.unlink(diskPath).catch(() => {});
    }

    await db.execute(sql.raw(`DELETE FROM am_asset_photos WHERE id = ${photoId}`));
    return res.json({ ok: true });
  } catch (err) {
    console.error('DELETE asset photo error:', err);
    return res.status(500).json({ error: 'Failed' });
  }
}
