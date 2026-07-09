/**
 * PUT /api/asset-manager/assets/:id/todos/:todoId
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../../../lib/auth-middleware.js';

export default async function handler(req: Request, res: Response) {
  const sp = await getSessionAndProfile(req, res);
  if (!sp) return;
  const { profile } = sp;
  const assetId = parseInt(String(req.params.id), 10);
  const todoId  = parseInt(String(req.params.todoId), 10);
  if (isNaN(assetId) || isNaN(todoId)) return res.status(400).json({ error: 'Invalid id' });

  const { title, dueDate, notes, status } = req.body as Record<string, string | undefined>;

  try {
    const [check] = await db.execute(sql.raw(`
      SELECT t.id FROM am_asset_todos t
      JOIN am_assets a ON a.id = t.asset_id
      WHERE t.id = ${todoId} AND t.asset_id = ${assetId} AND a.company_id = ${profile.companyId}
    `)) as unknown as [unknown[], unknown];
    if (!(check as unknown[]).length) return res.status(404).json({ error: 'Not found' });

    const sets: string[] = [];
    if (title !== undefined) sets.push(`title = '${title.trim().replace(/'/g, "''")}'`);
    if (dueDate !== undefined) sets.push(`due_date = ${dueDate ? `'${dueDate}'` : 'NULL'}`);
    if (notes !== undefined) sets.push(`notes = ${notes ? `'${notes.replace(/'/g, "''")}'` : 'NULL'}`);
    if (status !== undefined) sets.push(`status = '${status}'`);
    if (!sets.length) return res.status(400).json({ error: 'No fields' });

    await db.execute(sql.raw(`UPDATE am_asset_todos SET ${sets.join(', ')}, updated_at = NOW() WHERE id = ${todoId}`));
    const [rows] = await db.execute(sql.raw(`SELECT * FROM am_asset_todos WHERE id = ${todoId}`)) as unknown as [unknown[], unknown];
    return res.json({ todo: (rows as Record<string, unknown>[])[0] });
  } catch (err) {
    console.error('PUT asset todo error:', err);
    return res.status(500).json({ error: 'Failed' });
  }
}
