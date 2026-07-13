/**
 * POST /api/owner-console/library/items/:id/push-update
 * Platform owner only.
 *
 * Explicitly pushes the current global master content to all company copies
 * that have NOT been locally customised (i.e. update_available = 1 and
 * customised = 0).  Customised copies are skipped — the owner must use the
 * ?force=true query param to overwrite those too.
 *
 * Body: { force?: boolean }  — if true, overwrites even customised copies.
 *
 * Returns: { ok, pushed, skipped }
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getPlatformOwnerInfo } from '../../../../../../lib/platform-owner-guard.js';

export default async function handler(req: Request, res: Response) {
  const info = await getPlatformOwnerInfo(req);
  if (!info) return res.status(401).json({ error: 'Unauthorised' });
  if (!info.isPlatformOwner) return res.status(403).json({ error: 'Platform owner access required' });

  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });

  const force = (req.body as Record<string, unknown>)?.force === true
    || req.query.force === 'true';

  try {
    // Fetch the current global master
    const [masterRows] = await db.execute(sql.raw(
      `SELECT id, title, type, category, content, metadata_json, builder_json, version
       FROM library_items WHERE id = ${id} LIMIT 1`
    )) as unknown as [Array<Record<string, unknown>>, unknown];

    const master = masterRows?.[0];
    if (!master) return res.status(404).json({ error: 'Library item not found' });

    const safe = (s: string) => String(s).replace(/'/g, "''");
    const version = String(master.version ?? '1.0');

    // Find company copies to update
    const customisedClause = force ? '' : 'AND (customised IS NULL OR customised = 0)';
    const [copyRows] = await db.execute(sql.raw(
      `SELECT id FROM company_library_items
       WHERE source_item_id = ${id} ${customisedClause}`
    )) as unknown as [Array<{ id: number }>, unknown];

    if (!copyRows?.length) {
      return res.json({ ok: true, pushed: 0, skipped: 0, message: 'No company copies to update.' });
    }

    const copyIds = copyRows.map((r) => r.id).join(',');

    const contentSql = master.content
      ? `'${safe(String(master.content))}'`
      : 'NULL';
    const metaSql = master.metadata_json
      ? `'${safe(String(master.metadata_json))}'`
      : 'NULL';
    const builderSql = master.builder_json
      ? `'${safe(String(master.builder_json))}'`
      : 'NULL';

    await db.execute(sql.raw(
      `UPDATE company_library_items
       SET content = ${contentSql},
           metadata_json = ${metaSql},
           builder_json = ${builderSql},
           source_version = '${safe(version)}',
           update_available = 0,
           updated_at = NOW()
       WHERE id IN (${copyIds})`
    ));

    // Count skipped (customised copies when force=false)
    let skipped = 0;
    if (!force) {
      const [skipRows] = await db.execute(sql.raw(
        `SELECT COUNT(*) AS cnt FROM company_library_items
         WHERE source_item_id = ${id} AND customised = 1`
      )) as unknown as [Array<{ cnt: number }>, unknown];
      skipped = Number(skipRows?.[0]?.cnt ?? 0);
    }

    return res.json({
      ok: true,
      pushed: copyRows.length,
      skipped,
      message: `Updated ${copyRows.length} company ${copyRows.length === 1 ? 'copy' : 'copies'}.${skipped ? ` ${skipped} customised ${skipped === 1 ? 'copy was' : 'copies were'} skipped.` : ''}`,
    });
  } catch (err) {
    console.error('POST push-update error:', err);
    return res.status(500).json({ error: 'Failed to push update' });
  }
}
