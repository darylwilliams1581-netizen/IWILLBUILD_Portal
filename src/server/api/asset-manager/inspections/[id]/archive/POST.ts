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
    await db.execute(sql`UPDATE am_inspections SET archived_at = NOW(), updated_at = NOW() WHERE id = ${id} AND company_id = ${profile.companyId}`);
    await db.execute(sql`INSERT INTO am_audit_log (entity_type, entity_id, action, actor_id) VALUES ('inspection', ${id}, 'archived', ${session.user.id})`);
    return res.json({ ok: true });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Failed' }); }
}
