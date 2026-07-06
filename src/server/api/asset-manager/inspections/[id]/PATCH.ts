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

  const { report_no, inspection_date, report_title, overall_status, notes, auditor_id } = req.body as Record<string, string | undefined>;

  try {
    const [check] = await db.execute(sql`SELECT id FROM am_inspections WHERE id = ${id} AND company_id = ${profile.companyId}`) as unknown as [unknown[], unknown];
    if (!(check as unknown[]).length) return res.status(404).json({ error: 'Not found' });

    const sets: string[] = [];
    if (report_no !== undefined) sets.push(`report_no = ${report_no ? `'${report_no.replace(/'/g, "''")}'` : 'NULL'}`);
    if (inspection_date !== undefined) sets.push(`inspection_date = ${inspection_date ? `'${inspection_date}'` : 'NULL'}`);
    if (report_title !== undefined) sets.push(`report_title = ${report_title ? `'${report_title.replace(/'/g, "''")}'` : 'NULL'}`);
    if (overall_status !== undefined) sets.push(`overall_status = '${overall_status.replace(/'/g, "''")}'`);
    if (notes !== undefined) sets.push(`notes = ${notes ? `'${notes.replace(/'/g, "''")}'` : 'NULL'}`);
    if (auditor_id !== undefined) sets.push(`auditor_id = ${auditor_id ? `'${auditor_id}'` : 'NULL'}`);
    if (!sets.length) return res.status(400).json({ error: 'No fields' });

    await db.execute(sql.raw(`UPDATE am_inspections SET ${sets.join(', ')}, updated_at = NOW() WHERE id = ${id}`));
    await db.execute(sql`INSERT INTO am_audit_log (entity_type, entity_id, action, actor_id, details_json) VALUES ('inspection', ${id}, 'updated', ${session.user.id}, ${JSON.stringify(req.body)})`);

    const [rows] = await db.execute(sql`SELECT * FROM am_inspections WHERE id = ${id}`) as unknown as [unknown[], unknown];
    return res.json({ inspection: (rows as Record<string, unknown>[])[0] });
  } catch (err) {
    console.error('PATCH /api/asset-manager/inspections/:id error:', err);
    return res.status(500).json({ error: 'Failed' });
  }
}
