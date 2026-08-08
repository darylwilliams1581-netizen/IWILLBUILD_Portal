/**
 * POST /api/admin/fix-photo-thumbnails
 * ─────────────────────────────────────────────────────────────────────────────
 * One-shot cleanup: clears stale thumbnail_key / preview_key on job_photos
 * rows where the original file was replaced via the photo editor (originalName
 * = 'edited.jpg').  Those rows have a new filename but the old thumbnail/preview
 * keys still point to deleted R2 objects, causing blank images in the grid.
 *
 * Safe to run multiple times (idempotent — only touches rows where at least
 * one of the keys is non-null).
 *
 * Owner-only endpoint.
 */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client';
import { sql } from 'drizzle-orm';
import { getAuth } from '@/lib/auth/auth';
import { getSecret } from '#airo/secrets';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    // Owner-only guard
    const ownerEmail = getSecret('PLATFORM_OWNER_EMAIL');
    if (session.user.email !== ownerEmail) {
      return res.status(403).json({ error: 'Owner only' });
    }

    // Clear thumbnail_key and preview_key for all replaced photos
    // (any photo where originalName = 'edited.jpg' and at least one key is set)
    const result = await db.execute(
      sql`UPDATE job_photos
          SET thumbnail_key = NULL,
              preview_key   = NULL
          WHERE original_name = 'edited.jpg'
            AND (thumbnail_key IS NOT NULL OR preview_key IS NOT NULL)`
    );

    // Also clear for any photo where the thumbnail_key equals the filename
    // (shouldn't happen but defensive)
    const result2 = await db.execute(
      sql`UPDATE job_photos
          SET thumbnail_key = NULL
          WHERE thumbnail_key = filename
            AND thumbnail_key IS NOT NULL`
    );

    return res.json({
      ok: true,
      message: 'Stale thumbnail/preview keys cleared',
      affectedRows: (result as unknown as { affectedRows?: number }).affectedRows ?? 0,
    });
  } catch (error) {
    console.error('fix-photo-thumbnails error:', error);
    return res.status(500).json({ error: 'Failed', detail: String(error) });
  }
}
