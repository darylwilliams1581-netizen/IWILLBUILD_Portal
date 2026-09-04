/**
 * GET /api/library/check-published?ref=form:42
 *
 * Platform owner only. Returns the existing library_items row for a given
 * source_template_ref so the UI can pre-fill the publish modal and show
 * "Update in Library" instead of "Publish to Library".
 *
 * Query params:
 *   ref  — e.g. "form:42", "swms:7", "document:15"
 *
 * Returns:
 *   { exists: false }
 *   { exists: true, item: { id, title, type, category, discipline, summary, version, tags, updated_at } }
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getPlatformOwnerInfo } from '../../../lib/platform-owner-guard.js';

export default async function handler(req: Request, res: Response) {
  const info = await getPlatformOwnerInfo(req);
  if (!info) return res.status(401).json({ error: 'Unauthorised' });
  if (!info.isPlatformOwner) return res.status(403).json({ error: 'Platform owner only' });

  const ref = (req.query.ref as string | undefined)?.trim();
  if (!ref) return res.status(400).json({ error: 'ref query param required' });

  const safeRef = ref.replace(/'/g, "''");

  try {
    const [rows] = await db.execute(sql.raw(
      `SELECT id, title, type, category, discipline, summary, version, tags, updated_at
       FROM library_items
       WHERE source_template_ref = '${safeRef}'
         AND status = 'active'
       LIMIT 1`
    )) as unknown as [Array<{
      id: number; title: string; type: string;
      category: string | null; discipline: string | null;
      summary: string | null; version: string;
      tags: string | null; updated_at: string;
    }>, unknown];

    const item = rows?.[0];
    if (!item) return res.json({ exists: false });

    return res.json({ exists: true, item });
  } catch (err) {
    console.error('GET /api/library/check-published error:', err);
    return res.status(500).json({ error: 'Failed to check library status' });
  }
}
