/**
 * DELETE /api/asset-manager/assets/:id/todos/:todoId
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
  const todoId  = parseInt(String(req.params.todoId), 10);
  if (isNaN(assetId) || isNaN(todoId)) return res.status(400).json({ error: 'Invalid id' });

  try {
    const [check] = await db.execute(sql.raw(`
      SELECT t.id FROM am_asset_todos t
      JOIN am_assets a ON a.id = t.asset_id
      WHERE t.id = ${todoId} AND t.asset_id = ${assetId} AND a.company_id = ${profile.companyId}
    `)) as unknown as [unknown[], unknown];
    if (!(check as unknown[]).length) return res.status(404).json({ error: 'Not found' });

    await db.execute(sql.raw(`DELETE FROM am_asset_todos WHERE id = ${todoId}`));
    return res.json({ ok: true });
  } catch (err) {
    console.error('DELETE asset todo error:', err);
    return res.status(500).json({ error: 'Failed' });
  }
}
