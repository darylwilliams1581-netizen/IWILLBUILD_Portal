/**
 * PATCH /api/owner-console/library/items/:id
 * Platform-owner only. Update metadata for a library item.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../../lib/auth-middleware.js';

const ALLOWED_TYPES = new Set([
  'policy', 'procedure', 'swms', 'form', 'recipe', 'estimate_recipe', 'scope_line',
]);

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  const [ownerCheck] = await db.execute(sql.raw(
    `SELECT role FROM profiles WHERE user_id = '${auth.session.user.id}' LIMIT 1`
  )) as unknown as [Array<{ role: string }>, unknown];
  if (ownerCheck?.[0]?.role !== 'platform_owner') {
    return res.status(403).json({ error: 'Platform owner access required' });
  }

  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });

  const body = req.body as Record<string, string>;
  const sets: string[] = [];

  if (body.title !== undefined)      sets.push(`title = '${body.title.replace(/'/g, "''")}'`);
  if (body.type !== undefined && ALLOWED_TYPES.has(body.type)) sets.push(`type = '${body.type}'`);
  if (body.category !== undefined)   sets.push(`category = ${body.category ? `'${body.category.replace(/'/g, "''")}'` : 'NULL'}`);
  if (body.discipline !== undefined) sets.push(`discipline = ${body.discipline ? `'${body.discipline.replace(/'/g, "''")}'` : 'NULL'}`);
  if (body.summary !== undefined)    sets.push(`summary = ${body.summary ? `'${body.summary.replace(/'/g, "''")}'` : 'NULL'}`);
  if (body.tags !== undefined)       sets.push(`tags = ${body.tags ? `'${body.tags.replace(/'/g, "''")}'` : 'NULL'}`);
  if (body.version !== undefined)    sets.push(`version = '${body.version.replace(/'/g, "''")}'`);
  if (body.status !== undefined && ['active', 'draft', 'archived'].includes(body.status)) sets.push(`status = '${body.status}'`);
  if (body.visibility !== undefined && ['public', 'private'].includes(body.visibility)) sets.push(`visibility = '${body.visibility}'`);

  if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
  sets.push('updated_at = NOW()');

  try {
    await db.execute(sql.raw(`UPDATE library_items SET ${sets.join(', ')} WHERE id = ${id}`));
    return res.json({ ok: true });
  } catch (err) {
    console.error('PATCH /api/owner-console/library/items/:id error:', err);
    return res.status(500).json({ error: 'Failed to update item' });
  }
}
