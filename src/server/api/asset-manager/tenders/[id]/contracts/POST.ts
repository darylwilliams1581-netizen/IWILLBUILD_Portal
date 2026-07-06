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

  const { contractor_name, submitted_at, status, notes } = req.body as Record<string, string | undefined>;

  try {
    const [check] = await db.execute(sql`SELECT id FROM am_tender_cycles WHERE id = ${id} AND company_id = ${profile.companyId}`) as unknown as [unknown[], unknown];
    if (!(check as unknown[]).length) return res.status(404).json({ error: 'Tender not found' });

    const [result] = await db.execute(sql`
      INSERT INTO am_contract_submissions (tender_cycle_id, company_id, contractor_name, submitted_at, status, received_by, notes)
      VALUES (${id}, ${profile.companyId}, ${contractor_name?.trim() || null},
              ${submitted_at || null}, ${status || 'received'}, ${session.user.id},
              ${notes?.trim() || null})
    `) as unknown as [{ insertId: number }, unknown];

    await db.execute(sql`INSERT INTO am_audit_log (entity_type, entity_id, action, actor_id) VALUES ('contract_submission', ${result.insertId}, 'created', ${session.user.id})`);

    const [rows] = await db.execute(sql`SELECT * FROM am_contract_submissions WHERE id = ${result.insertId}`) as unknown as [unknown[], unknown];
    return res.status(201).json({ submission: (rows as Record<string, unknown>[])[0] });
  } catch (err) {
    console.error('POST contract submission error:', err);
    return res.status(500).json({ error: 'Failed' });
  }
}
