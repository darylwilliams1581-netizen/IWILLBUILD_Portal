/**
 * PUT /api/form-global-lists/:id
 * Update a global list's name and/or items.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../lib/auth-middleware.js';

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;
  const companyId = auth.profile.companyId;
  const listId = Number(req.params.id);
  if (!listId) return res.status(400).json({ error: 'Invalid id' });

  const { name, items } = req.body as { name?: string; items?: string[] };

  // Verify ownership
  const [rows] = await db.execute(sql`
    SELECT id FROM form_global_lists WHERE id = ${listId} AND company_id = ${companyId} LIMIT 1
  `) as unknown as [Array<{ id: number }>, unknown];
  if (!rows?.length) return res.status(404).json({ error: 'List not found' });

  const updates: string[] = [];
  if (name !== undefined) updates.push(`name = ${JSON.stringify(name.trim())}`);
  if (items !== undefined) {
    const itemsJson = JSON.stringify(Array.isArray(items) ? items.filter((i) => typeof i === 'string' && i.trim()) : []);
    updates.push(`items = '${itemsJson.replace(/'/g, "''")}'`);
  }
  if (!updates.length) return res.json({ ok: true });

  try {
    await db.execute(sql`
      UPDATE form_global_lists
      SET name  = ${name !== undefined ? name.trim() : sql`name`},
          items = ${items !== undefined ? JSON.stringify(Array.isArray(items) ? items.filter((i) => typeof i === 'string' && i.trim()) : []) : sql`items`}
      WHERE id = ${listId} AND company_id = ${companyId}
    `);
    return res.json({ ok: true });
  } catch (err) {
    console.error('PUT /api/form-global-lists/:id error:', err);
    return res.status(500).json({ error: 'Failed to update global list' });
  }
}
