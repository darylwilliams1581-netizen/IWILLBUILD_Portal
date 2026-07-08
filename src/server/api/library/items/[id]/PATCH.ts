/**
 * PATCH /api/library/items/:id
 *
 * Edit a company's installed copy of a library item.
 * The :id here is the company_library_items.id (NOT the source library_items.id).
 *
 * Only the company that owns the copy can edit it.
 * The global source item is never modified.
 *
 * Editable fields: title, content, metadata_json, category
 *
 * Access: owner, admin, estimator roles only.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../lib/auth-middleware.js';

const ALLOWED_EDIT_ROLES = new Set(['owner', 'admin', 'estimator']);

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  if (!ALLOWED_EDIT_ROLES.has(auth.profile.role)) {
    return res.status(403).json({ error: 'Only owners, admins, and estimators can edit library items.' });
  }

  const companyItemId = parseInt(req.params.id);
  if (!companyItemId) return res.status(400).json({ error: 'Invalid id' });

  const companyId = auth.profile.companyId;

  try {
    // ── Verify ownership ──────────────────────────────────────────────────────
    const [rows] = await db.execute(
      sql.raw(`
        SELECT id, company_id, source_item_id, type
        FROM company_library_items
        WHERE id = ${companyItemId} AND company_id = ${companyId}
        LIMIT 1
      `)
    ) as unknown as [Array<{ id: number; company_id: number; source_item_id: number; type: string }>, unknown];

    const item = rows?.[0];
    if (!item) return res.status(404).json({ error: 'Company library item not found.' });

    // ── Build update ──────────────────────────────────────────────────────────
    const { title, content, metadata_json, category } = req.body as {
      title?: string;
      content?: string;
      metadata_json?: string;
      category?: string;
    };

    const setClauses: string[] = [];

    if (title !== undefined) {
      setClauses.push(`title = '${String(title).replace(/'/g, "''").slice(0, 255)}'`);
    }
    if (content !== undefined) {
      setClauses.push(`content = '${String(content).replace(/'/g, "''")}'`);
    }
    if (metadata_json !== undefined) {
      setClauses.push(`metadata_json = '${String(metadata_json).replace(/'/g, "''")}'`);
    }
    if (category !== undefined) {
      setClauses.push(`category = '${String(category).replace(/'/g, "''").slice(0, 100)}'`);
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ error: 'No fields to update.' });
    }

    await db.execute(
      sql.raw(`
        UPDATE company_library_items
        SET ${setClauses.join(', ')}, updated_at = NOW()
        WHERE id = ${companyItemId} AND company_id = ${companyId}
      `)
    );

    return res.json({ ok: true, message: 'Company library item updated.' });
  } catch (err) {
    console.error('PATCH /api/library/items/:id error:', err);
    return res.status(500).json({ error: 'Failed to update library item' });
  }
}
