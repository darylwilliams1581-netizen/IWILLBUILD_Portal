/**
 * POST /api/asset-manager/assets
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../lib/auth-middleware.js';

export default async function handler(req: Request, res: Response) {
  const sp = await getSessionAndProfile(req, res);
  if (!sp) return;
  const { session, profile } = sp;

  const { name, acronym, address, asset_type, status } = req.body as {
    name?: string; acronym?: string; address?: string; asset_type?: string; status?: string;
  };
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });

  try {
    const [result] = await db.execute(sql`
      INSERT INTO am_assets (company_id, name, acronym, address, asset_type, status, created_by)
      VALUES (${profile.companyId}, ${name.trim()}, ${acronym?.trim() || null},
              ${address?.trim() || null}, ${asset_type || 'facility'}, ${status || 'active'},
              ${session.user.id})
    `) as unknown as [{ insertId: number }, unknown];

    await db.execute(sql`
      INSERT INTO am_audit_log (entity_type, entity_id, action, actor_id, details_json)
      VALUES ('asset', ${result.insertId}, 'created', ${session.user.id}, ${JSON.stringify({ name })})
    `);

    const [rows] = await db.execute(sql`SELECT * FROM am_assets WHERE id = ${result.insertId}`) as unknown as [unknown[], unknown];
    return res.status(201).json({ asset: (rows as Record<string, unknown>[])[0] });
  } catch (err) {
    console.error('POST /api/asset-manager/assets error:', err);
    return res.status(500).json({ error: 'Failed to create asset' });
  }
}
