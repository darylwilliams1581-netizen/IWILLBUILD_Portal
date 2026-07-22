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

  const { title, severity, location, description, action_owner_id, due_date, status } = req.body as Record<string, string | undefined>;

  try {
    const [check] = await db.execute(sql`SELECT id FROM am_defects WHERE id = ${id} AND company_id = ${profile.companyId}`) as unknown as [unknown[], unknown];
    if (!(check as unknown[]).length) return res.status(404).json({ error: 'Not found' });

    const sets: string[] = [];
    if (title !== undefined) sets.push(`title = '${title.replace(/'/g, "''")}'`);
    if (severity !== undefined) sets.push(`severity = '${severity}'`);
    if (location !== undefined) sets.push(`location = ${location ? `'${location.replace(/'/g, "''")}'` : 'NULL'}`);
    if (description !== undefined) sets.push(`description = ${description ? `'${description.replace(/'/g, "''")}'` : 'NULL'}`);
    if (action_owner_id !== undefined) sets.push(`action_owner_id = ${action_owner_id ? `'${action_owner_id}'` : 'NULL'}`);
    if (due_date !== undefined) sets.push(`due_date = ${due_date ? `'${due_date}'` : 'NULL'}`);
    if (status !== undefined) sets.push(`status = '${status}'`);
    if (!sets.length) return res.status(400).json({ error: 'No fields' });

    await db.execute(sql.raw(`UPDATE am_defects SET ${sets.join(', ')}, updated_at = NOW() WHERE id = ${id}`));
    await db.execute(sql`INSERT INTO am_audit_log (entity_type, entity_id, action, actor_id, details_json) VALUES ('defect', ${id}, 'updated', ${session.user.id}, ${JSON.stringify(req.body)})`);

    const [rows] = await db.execute(sql`SELECT * FROM am_defects WHERE id = ${id}`) as unknown as [unknown[], unknown];
    return res.json({ defect: (rows as Record<string, unknown>[])[0] });
  } catch (err) {
    console.error('PATCH defect error:', err);
    return res.status(500).json({ error: 'Failed' });
  }
}
