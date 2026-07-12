/**
 * DELETE /api/owner-console/swms/masters/:id
 * Deletes a platform master SWMS template (does NOT affect company copies).
 * Platform owner only.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getPlatformOwnerInfo } from '../../../../../lib/platform-owner-guard.js';

export default async function handler(req: Request, res: Response) {
  const info = await getPlatformOwnerInfo(req);
  if (!info) return res.status(401).json({ error: 'Unauthorised' });
  if (!info.isPlatformOwner) return res.status(403).json({ error: 'Platform owner access required' });

  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Invalid id' });

  try {
    await db.execute(sql.raw(
      `DELETE FROM swms_templates WHERE id = ${id} AND is_platform_master = 1`
    ));
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
