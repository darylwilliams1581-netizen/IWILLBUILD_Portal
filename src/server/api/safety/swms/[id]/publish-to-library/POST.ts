/**
 * POST /api/safety/swms/:id/publish-to-library
 * Platform owner only. Publishes a SWMS template to the Global Library.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getPlatformOwnerInfo } from '../../../../../lib/platform-owner-guard.js';

export default async function handler(req: Request, res: Response) {
  const info = await getPlatformOwnerInfo(req);
  if (!info) return res.status(401).json({ error: 'Unauthorised' });
  if (!info.isPlatformOwner) {
    return res.status(403).json({ error: 'Only the platform owner can publish to the Global Library.' });
  }

  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });

  const [rows] = await db.execute(sql.raw(
    `SELECT id, title, work_activity, swms_body, build_mode FROM swms_templates WHERE id = ${id} LIMIT 1`
  )) as unknown as [Array<{ id: number; title: string; work_activity: string | null; swms_body: string | null; build_mode: string | null }>, unknown];

  const swms = rows?.[0];
  if (!swms) return res.status(404).json({ error: 'SWMS not found' });

  const body = req.body as {
    title?: string; category?: string; discipline?: string;
    summary?: string; version?: string; tags?: string;
  };

  const safe = (s: string) => s.replace(/'/g, "''");
  const title      = (body.title ?? swms.title ?? 'Untitled').trim();
  const category   = (body.category ?? '').trim() || null;
  const discipline = (body.discipline ?? '').trim() || null;
  const summary    = (body.summary ?? swms.work_activity ?? '').trim() || null;
  const version    = (body.version ?? '1.0').trim();
  const tags       = (body.tags ?? '').trim() || null;
  const builderJson = swms.swms_body ?? '{"blocks":[]}';

  try {
    const [result] = await db.execute(sql.raw(
      `INSERT INTO library_items (
         title, type, category, discipline, summary, tags, builder_json,
         status, visibility, version,
         install_count, download_count, rating_sum, rating_count,
         created_at, updated_at
       ) VALUES (
         '${safe(title)}', 'swms',
         ${category   ? `'${safe(category)}'`   : 'NULL'},
         ${discipline ? `'${safe(discipline)}'` : 'NULL'},
         ${summary    ? `'${safe(summary)}'`    : 'NULL'},
         ${tags       ? `'${safe(tags)}'`       : 'NULL'},
         '${safe(builderJson)}',
         'active', 'public', '${safe(version)}',
         0, 0, 0, 0, NOW(), NOW()
       )`
    )) as unknown as [{ insertId: number }, unknown];

    const libraryItemId = (result as unknown as { insertId: number }).insertId;
    return res.json({ ok: true, libraryItemId });
  } catch (err) {
    console.error('SWMS publish-to-library error:', err);
    return res.status(500).json({ error: 'Failed to publish to library' });
  }
}
