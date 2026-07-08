/**
 * DELETE /api/owner-console/library/items/:id
 * Platform-owner only. Permanently removes a library item.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../../lib/auth-middleware.js';

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  const [ownerCheck] = await db.execute(sql.raw(
    `SELECT role FROM profiles WHERE user_id = '${auth.session.user.id}' LIMIT 1`
  )) as unknown as [Array<{ role: string }>, unknown];
  if (ownerCheck?.[0]?.role !== 'platform_owner') {
    return res.status(403).json({ error: 'Platform owner access required' });
  }

  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });

  try {
    await db.execute(sql.raw(`DELETE FROM library_items WHERE id = ${id}`));
    return res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/owner-console/library/items/:id error:', err);
    return res.status(500).json({ error: 'Failed to delete item' });
  }
}
