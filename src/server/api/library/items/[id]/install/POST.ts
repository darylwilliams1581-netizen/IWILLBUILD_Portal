/**
 * POST /api/library/items/:id/install
 *
 * Installs a global library item into the current company.
 * Creates a company-scoped editable copy in company_library_items.
 * If already installed, returns the existing copy (idempotent).
 *
 * The source item remains read-only. The company copy can be edited
 * via PATCH /api/library/items/:id without touching the source.
 *
 * Access: owner, admin, estimator roles only.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../../lib/auth-middleware.js';
import type { ResultSetHeader } from 'mysql2';

const ALLOWED_INSTALL_ROLES = new Set(['owner', 'admin', 'estimator']);

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  if (!ALLOWED_INSTALL_ROLES.has(auth.profile.role)) {
    return res.status(403).json({ error: 'Only owners, admins, and estimators can install library items.' });
  }

  const sourceId = parseInt(req.params.id);
  if (!sourceId) return res.status(400).json({ error: 'Invalid id' });

  const companyId = auth.profile.companyId;
  const userId = auth.session.user.id;

  try {
    // ── Fetch source item ─────────────────────────────────────────────────────
    const [sourceRows] = await db.execute(
      sql.raw(`
        SELECT id, type, category, title, content, metadata_json, version
        FROM library_items
        WHERE id = ${sourceId} AND visibility = 'public' AND status = 'active'
        LIMIT 1
      `)
    ) as unknown as [Array<{
      id: number; type: string; category: string | null; title: string;
      content: string | null; metadata_json: string | null; version: string;
    }>, unknown];

    const source = sourceRows?.[0];
    if (!source) return res.status(404).json({ error: 'Library item not found or not available.' });

    // ── Check if already installed ────────────────────────────────────────────
    const [existingRows] = await db.execute(
      sql.raw(`
        SELECT id, source_version, update_available, installed_at
        FROM company_library_items
        WHERE company_id = ${companyId} AND source_item_id = ${sourceId}
        LIMIT 1
      `)
    ) as unknown as [Array<{ id: number; source_version: string; update_available: number; installed_at: string }>, unknown];

    if (existingRows?.[0]) {
      const existing = existingRows[0];
      return res.json({
        ok: true,
        alreadyInstalled: true,
        companyItemId: existing.id,
        sourceVersion: existing.source_version,
        installedAt: existing.installed_at,
        message: 'Already installed. Edit your company copy to customise it.',
      });
    }

    // ── Create company copy ───────────────────────────────────────────────────
    // scope_line: strip rate/cost fields from content to avoid sharing pricing
    let content = source.content;
    if (source.type === 'scope_line' && content) {
      try {
        const parsed = JSON.parse(content) as Record<string, unknown>;
        delete parsed.rate;
        delete parsed.cost;
        delete parsed.unit_rate;
        delete parsed.unit_cost;
        delete parsed.price;
        content = JSON.stringify(parsed);
      } catch {
        // not JSON — leave as-is
      }
    }

    const safeTitle   = (source.title ?? '').replace(/'/g, "''");
    const safeType    = (source.type ?? '').replace(/'/g, "''");
    const safeCategory = source.category ? `'${source.category.replace(/'/g, "''")}'` : 'NULL';
    const safeVersion = (source.version ?? '1.0').replace(/'/g, "''");
    const safeContent = content ? `'${content.replace(/'/g, "''")}'` : 'NULL';
    const safeMeta    = source.metadata_json ? `'${source.metadata_json.replace(/'/g, "''")}'` : 'NULL';

    const [insertResult] = await db.execute(
      sql.raw(`
        INSERT INTO company_library_items
          (company_id, source_item_id, source_version, type, category, title, content, metadata_json, installed_by)
        VALUES
          (${companyId}, ${sourceId}, '${safeVersion}', '${safeType}', ${safeCategory}, '${safeTitle}', ${safeContent}, ${safeMeta}, '${userId}')
      `)
    ) as unknown as [ResultSetHeader, unknown];

    const companyItemId = insertResult.insertId;

    // ── Increment install_count on source ─────────────────────────────────────
    await db.execute(
      sql.raw(`UPDATE library_items SET install_count = install_count + 1 WHERE id = ${sourceId}`)
    ).catch(() => { /* non-critical */ });

    return res.status(201).json({
      ok: true,
      alreadyInstalled: false,
      companyItemId,
      sourceVersion: source.version,
      message: `"${source.title}" installed. You can now edit your company copy.`,
    });
  } catch (err) {
    console.error('POST /api/library/items/:id/install error:', err);
    return res.status(500).json({ error: 'Failed to install library item' });
  }
}
