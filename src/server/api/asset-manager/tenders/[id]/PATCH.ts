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

  const { code, contractor_name, quote_requested_at, quote_due_at, quote_amount, award_status, notes } = req.body as Record<string, string | undefined>;

  try {
    const [check] = await db.execute(sql`SELECT id FROM am_tender_cycles WHERE id = ${id} AND company_id = ${profile.companyId}`) as unknown as [unknown[], unknown];
    if (!(check as unknown[]).length) return res.status(404).json({ error: 'Not found' });

    const sets: string[] = [];
    if (code !== undefined) sets.push(`code = ${code ? `'${code.replace(/'/g, "''")}'` : 'NULL'}`);
    if (contractor_name !== undefined) sets.push(`contractor_name = ${contractor_name ? `'${contractor_name.replace(/'/g, "''")}'` : 'NULL'}`);
    if (quote_requested_at !== undefined) sets.push(`quote_requested_at = ${quote_requested_at ? `'${quote_requested_at}'` : 'NULL'}`);
    if (quote_due_at !== undefined) sets.push(`quote_due_at = ${quote_due_at ? `'${quote_due_at}'` : 'NULL'}`);
    if (quote_amount !== undefined) sets.push(`quote_amount = ${quote_amount ? parseFloat(quote_amount) : 'NULL'}`);
    if (award_status !== undefined) sets.push(`award_status = '${award_status}'`);
    if (notes !== undefined) sets.push(`notes = ${notes ? `'${notes.replace(/'/g, "''")}'` : 'NULL'}`);
    if (!sets.length) return res.status(400).json({ error: 'No fields' });

    await db.execute(sql.raw(`UPDATE am_tender_cycles SET ${sets.join(', ')}, updated_at = NOW() WHERE id = ${id}`));
    await db.execute(sql`INSERT INTO am_audit_log (entity_type, entity_id, action, actor_id, details_json) VALUES ('tender', ${id}, 'updated', ${session.user.id}, ${JSON.stringify(req.body)})`);

    const [rows] = await db.execute(sql`SELECT * FROM am_tender_cycles WHERE id = ${id}`) as unknown as [unknown[], unknown];
    return res.json({ tender: (rows as Record<string, unknown>[])[0] });
  } catch (err) {
    console.error('PATCH tender error:', err);
    return res.status(500).json({ error: 'Failed' });
  }
}
