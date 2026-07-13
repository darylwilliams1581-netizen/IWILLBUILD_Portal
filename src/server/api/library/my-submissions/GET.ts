/**
 * GET /api/library/my-submissions
 *
 * Platform owner only — returns all library_items.
 * Regular company users always get an empty list (they cannot submit to the Global Library).
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getPlatformOwnerInfo } from '../../../lib/platform-owner-guard.js';

export default async function handler(req: Request, res: Response) {
  const info = await getPlatformOwnerInfo(req);
  // Non-owners get an empty list (not an error — UI may call this without knowing the role)
  if (!info || !info.isPlatformOwner) return res.json({ submissions: [] });

  try {
    const [rows] = await db.execute(sql.raw(
      `SELECT id, title, type, category, discipline, summary,
              visibility, status, version, created_at, updated_at
       FROM library_items
       ORDER BY created_at DESC
       LIMIT 100`
    )) as unknown as [Array<Record<string, unknown>>, unknown];

    return res.json({ submissions: rows ?? [] });
  } catch (err) {
    console.error('my-submissions error:', err);
    return res.status(500).json({ error: 'Failed to load submissions' });
  }
}
