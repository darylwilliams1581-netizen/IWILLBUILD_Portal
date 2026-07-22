/**
 * DELETE /api/library/items/:id/install
 *
 * Uninstalls a library item from the current company
 * (removes the row from company_library_items).
 *
 * Access: owner, admin, estimator roles only.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../../lib/auth-middleware.js';
import type { ResultSetHeader } from 'mysql2';

const ALLOWED_ROLES = new Set(['owner', 'admin', 'estimator']);

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  if (!ALLOWED_ROLES.has(auth.profile.role)) {
    return res.status(403).json({ error: 'Only owners, admins, and estimators can uninstall library items.' });
  }

  const sourceId = parseInt(req.params.id);
  if (!sourceId) return res.status(400).json({ error: 'Invalid id' });

  const companyId = auth.profile.companyId;

  try {
    const [result] = await db.execute(
      sql.raw(`
        DELETE FROM company_library_items
        WHERE company_id = ${companyId} AND source_item_id = ${sourceId}
        LIMIT 1
      `)
    ) as unknown as [ResultSetHeader, unknown];

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Item not installed.' });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/library/items/:id/install error:', err);
    return res.status(500).json({ error: 'Failed to uninstall library item' });
  }
}
