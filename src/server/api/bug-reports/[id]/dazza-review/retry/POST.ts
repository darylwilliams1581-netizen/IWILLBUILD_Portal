/**
 * POST /api/bug-reports/:id/dazza-review/retry
 * Platform-owner ONLY. Deletes a failed review comment and re-runs ensure.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getPlatformOwnerInfo } from '../../../../../lib/platform-owner-guard.js';

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export default async function handler(req: Request, res: Response) {
  try {
    const ownerInfo = await getPlatformOwnerInfo(req);
    if (!ownerInfo) return res.status(401).json({ error: 'Unauthorised' });
    if (!ownerInfo.isPlatformOwner) return res.status(403).json({ error: 'Owner access required.' });

    const { id } = req.params as { id: string };
    const { commentId } = req.body as { commentId?: string };
    if (!id || !commentId) return res.status(400).json({ error: 'IDs required.' });

    // Only delete if it belongs to this bug report and is failed
    await db.execute(sql.raw(`
      DELETE FROM dazza_review_comments
      WHERE id = '${esc(commentId)}'
        AND bug_report_id = '${esc(id)}'
        AND review_status = 'failed'
    `));

    return res.json({ ok: true });
  } catch (err) {
    console.error('[dazza-review/retry]', err);
    return res.status(500).json({ error: 'Retry failed.' });
  }
}
