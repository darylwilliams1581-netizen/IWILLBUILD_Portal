import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../lib/auth-middleware.js';

export default async function handler(req: Request, res: Response) {
  const sp = await getSessionAndProfile(req, res);
  if (!sp) return;
  const { session, profile } = sp;
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

  const { name, acronym, address, asset_type, status } = req.body as Record<string, string | undefined>;

  try {
    const [check] = await db.execute(sql`SELECT id FROM am_assets WHERE id = ${id} AND company_id = ${profile.companyId}`) as unknown as [unknown[], unknown];
    if (!(check as unknown[]).length) return res.status(404).json({ error: 'Not found' });

    const sets: string[] = [];
    if (name !== undefined) sets.push(`name = '${name.replace(/'/g, "''")}'`);
    if (acronym !== undefined) sets.push(`acronym = ${acronym ? `'${acronym.replace(/'/g, "''")}'` : 'NULL'}`);
    if (address !== undefined) sets.push(`address = ${address ? `'${address.replace(/'/g, "''")}'` : 'NULL'}`);
    if (asset_type !== undefined) sets.push(`asset_type = '${asset_type.replace(/'/g, "''")}'`);
    if (status !== undefined) sets.push(`status = '${status.replace(/'/g, "''")}'`);
    if (!sets.length) return res.status(400).json({ error: 'No fields to update' });

    await db.execute(sql.raw(`UPDATE am_assets SET ${sets.join(', ')}, updated_at = NOW() WHERE id = ${id}`));
    await db.execute(sql`INSERT INTO am_audit_log (entity_type, entity_id, action, actor_id, details_json) VALUES ('asset', ${id}, 'updated', ${session.user.id}, ${JSON.stringify(req.body)})`);

    const [rows] = await db.execute(sql`SELECT * FROM am_assets WHERE id = ${id}`) as unknown as [unknown[], unknown];
    return res.json({ asset: (rows as Record<string, unknown>[])[0] });
  } catch (err) {
    console.error('PATCH /api/asset-manager/assets/:id error:', err);
    return res.status(500).json({ error: 'Failed' });
  }
}
