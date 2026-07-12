/**
 * GET /api/owner-console/swms/masters/:id
 * Returns a single platform master SWMS (full record including swms_body).
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
    const [rows] = await db.execute(sql.raw(
      `SELECT * FROM swms_templates WHERE id = ${id} AND is_platform_master = 1 LIMIT 1`
    )) as unknown as [Array<Record<string, unknown>>, unknown];

    if (!rows?.[0]) return res.status(404).json({ error: 'Not found' });
    return res.json({ master: rows[0] });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
