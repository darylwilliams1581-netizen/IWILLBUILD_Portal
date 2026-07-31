/**
 * POST /api/form-global-lists
 * Create a new global list.
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../lib/auth-middleware.js';

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;
  const companyId = auth.profile.companyId;

  const { name, items } = req.body as { name?: string; items?: string[] };
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });

  const itemsJson = JSON.stringify(Array.isArray(items) ? items.filter((i) => typeof i === 'string' && i.trim()) : []);

  try {
    const [result] = await db.execute(sql`
      INSERT INTO form_global_lists (company_id, name, items)
      VALUES (${companyId}, ${name.trim()}, ${itemsJson})
    `) as unknown as [{ insertId: number }, unknown];

    return res.status(201).json({ ok: true, id: result.insertId });
  } catch (err) {
    console.error('POST /api/form-global-lists error:', err);
    return res.status(500).json({ error: 'Failed to create global list' });
  }
}
