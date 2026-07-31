/**
 * DELETE /api/form-global-lists/:id
 * Delete a global list.
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

  try {
    await db.execute(sql`
      DELETE FROM form_global_lists WHERE id = ${listId} AND company_id = ${companyId}
    `);
    return res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/form-global-lists/:id error:', err);
    return res.status(500).json({ error: 'Failed to delete global list' });
  }
}
