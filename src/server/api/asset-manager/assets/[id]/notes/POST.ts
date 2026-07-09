/**
 * POST /api/asset-manager/assets/:id/notes
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../../lib/auth-middleware.js';

export default async function handler(req: Request, res: Response) {
  const sp = await getSessionAndProfile(req, res);
  if (!sp) return;
  const { session, profile } = sp;
  const assetId = parseInt(String(req.params.id), 10);
  if (isNaN(assetId)) return res.status(400).json({ error: 'Invalid id' });

  const { body, authorName } = req.body as { body?: string; authorName?: string };
  if (!body?.trim()) return res.status(400).json({ error: 'Body required' });

  try {
    const [check] = await db.execute(sql`SELECT id FROM am_assets WHERE id = ${assetId} AND company_id = ${profile.companyId}`) as unknown as [unknown[], unknown];
    if (!(check as unknown[]).length) return res.status(404).json({ error: 'Not found' });

    const safeBody = body.trim().replace(/'/g, "''");
    const safeName = authorName ? `'${authorName.replace(/'/g, "''")}'` : 'NULL';

    const [result] = await db.execute(sql.raw(`
      INSERT INTO am_asset_notes (asset_id, company_id, body, created_by, created_by_name)
      VALUES (${assetId}, ${profile.companyId}, '${safeBody}', '${session.user.id}', ${safeName})
    `)) as unknown as [{ insertId: number }, unknown];

    const [rows] = await db.execute(sql.raw(`SELECT * FROM am_asset_notes WHERE id = ${result.insertId}`)) as unknown as [unknown[], unknown];
    return res.status(201).json({ note: (rows as Record<string, unknown>[])[0] });
  } catch (err) {
    console.error('POST asset note error:', err);
    return res.status(500).json({ error: 'Failed' });
  }
}
