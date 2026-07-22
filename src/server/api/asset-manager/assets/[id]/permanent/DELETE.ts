import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../../lib/auth-middleware.js';

export default async function handler(req: Request, res: Response) {
  const sp = await getSessionAndProfile(req, res);
  if (!sp) return;
  const { session, profile } = sp;
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

  try {
    // Must be archived first
    const [rows] = await db.execute(sql`SELECT archived_at FROM am_assets WHERE id = ${id} AND company_id = ${profile.companyId}`) as unknown as [Array<{ archived_at: string | null }>, unknown];
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    if (!rows[0].archived_at) return res.status(409).json({ error: 'Asset must be archived before permanent deletion' });

    await db.execute(sql`DELETE FROM am_assets WHERE id = ${id} AND company_id = ${profile.companyId}`);
    await db.execute(sql`INSERT INTO am_audit_log (entity_type, entity_id, action, actor_id) VALUES ('asset', ${id}, 'deleted_permanently', ${session.user.id})`);
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed' });
  }
}
