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

  const { code, contractor_name, quote_requested_at, quote_due_at, quote_amount, notes } = req.body as Record<string, string | undefined>;

  try {
    const [check] = await db.execute(sql`SELECT asset_id FROM am_inspections WHERE id = ${id} AND company_id = ${profile.companyId}`) as unknown as [Array<{ asset_id: number }>, unknown];
    if (!check.length) return res.status(404).json({ error: 'Inspection not found' });

    const [result] = await db.execute(sql`
      INSERT INTO am_tender_cycles (inspection_id, asset_id, company_id, code, quote_requested_at, quote_due_at, contractor_name, quote_amount, notes, created_by)
      VALUES (${id}, ${check[0].asset_id}, ${profile.companyId},
              ${code?.trim() || null}, ${quote_requested_at || null}, ${quote_due_at || null},
              ${contractor_name?.trim() || null},
              ${quote_amount ? parseFloat(quote_amount) : null},
              ${notes?.trim() || null}, ${session.user.id})
    `) as unknown as [{ insertId: number }, unknown];

    await db.execute(sql`INSERT INTO am_audit_log (entity_type, entity_id, action, actor_id) VALUES ('tender', ${result.insertId}, 'created', ${session.user.id})`);

    const [rows] = await db.execute(sql`SELECT * FROM am_tender_cycles WHERE id = ${result.insertId}`) as unknown as [unknown[], unknown];
    return res.status(201).json({ tender: (rows as Record<string, unknown>[])[0] });
  } catch (err) {
    console.error('POST tender error:', err);
    return res.status(500).json({ error: 'Failed' });
  }
}
