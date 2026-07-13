/**
 * PUT /api/owner-console/library/items/:id
 * Platform owner only. Full update of a library item — metadata + builder_json content.
 * Bumping the version here marks installed company copies as update_available = 1.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getPlatformOwnerInfo } from '../../../../../lib/platform-owner-guard.js';

const ALLOWED_TYPES = new Set([
  'policy', 'procedure', 'swms', 'form', 'recipe', 'estimate_recipe', 'scope_line',
  'checklist', 'induction', 'report', 'toolbox_talk', 'prestart',
]);

export default async function handler(req: Request, res: Response) {
  const info = await getPlatformOwnerInfo(req);
  if (!info) return res.status(401).json({ error: 'Unauthorised' });
  if (!info.isPlatformOwner) return res.status(403).json({ error: 'Platform owner access required' });

  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });

  const body = req.body as Record<string, unknown>;
  const safe = (s: string) => s.replace(/'/g, "''");
  const str  = (v: unknown) => (v !== undefined && v !== null ? String(v) : null);

  const sets: string[] = ['updated_at = NOW()'];

  const title      = str(body.title);
  const type       = str(body.type);
  const category   = str(body.category);
  const discipline = str(body.discipline);
  const summary    = str(body.summary);
  const tags       = str(body.tags);
  const version    = str(body.version);
  const status     = str(body.status);
  const visibility = str(body.visibility);

  // builder_json may arrive as object or pre-stringified string
  let builderJsonStr: string | null = null;
  if (body.builder_json !== undefined && body.builder_json !== null) {
    builderJsonStr = typeof body.builder_json === 'string'
      ? body.builder_json
      : JSON.stringify(body.builder_json);
  }

  if (title !== null)      sets.push(`title = '${safe(title)}'`);
  if (type !== null && ALLOWED_TYPES.has(type)) sets.push(`type = '${safe(type)}'`);
  if (category !== null)   sets.push(`category = ${category ? `'${safe(category)}'` : 'NULL'}`);
  if (discipline !== null) sets.push(`discipline = ${discipline ? `'${safe(discipline)}'` : 'NULL'}`);
  if (summary !== null)    sets.push(`summary = ${summary ? `'${safe(summary)}'` : 'NULL'}`);
  if (tags !== null)       sets.push(`tags = ${tags ? `'${safe(tags)}'` : 'NULL'}`);
  if (version !== null)    sets.push(`version = '${safe(version)}'`);
  if (status !== null && ['active', 'draft', 'archived'].includes(status)) sets.push(`status = '${safe(status)}'`);
  if (visibility !== null && ['public', 'private'].includes(visibility)) sets.push(`visibility = '${safe(visibility)}'`);
  if (builderJsonStr !== null) sets.push(`builder_json = '${safe(builderJsonStr)}'`);

  if (sets.length === 1) return res.status(400).json({ error: 'No fields to update' });

  try {
    await db.execute(sql.raw(`UPDATE library_items SET ${sets.join(', ')} WHERE id = ${id}`));

    // If version changed, flag installed company copies as having an update available
    if (version !== null) {
      await db.execute(sql.raw(
        `UPDATE company_library_items
         SET update_available = 1
         WHERE source_item_id = ${id} AND source_version <> '${safe(version)}'`
      )).catch(() => { /* non-critical — table may not have all rows */ });
    }

    const [rows] = await db.execute(sql.raw(
      `SELECT * FROM library_items WHERE id = ${id} LIMIT 1`
    )) as unknown as [Array<Record<string, unknown>>, unknown];

    return res.json({ ok: true, item: rows?.[0] ?? { id } });
  } catch (err) {
    console.error('PUT /api/owner-console/library/items/:id error:', err);
    return res.status(500).json({ error: 'Failed to update library item' });
  }
}
