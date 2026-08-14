/**
 * GET /api/bug-reports/:id/dazza-review/comments
 * Platform-owner ONLY. Returns all versioned Dazza comments for a bug report.
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
    if (!id) return res.status(400).json({ error: 'Bug report ID required.' });

    const [rows] = await db.execute(sql.raw(`
      SELECT id, version_label, review_status, what_happened, what_found,
             likely_cause, recommended_fix, airo_prompt, confidence,
             failure_reason, created_at, completed_at
      FROM dazza_review_comments
      WHERE bug_report_id = '${esc(id)}'
      ORDER BY created_at ASC
    `)) as unknown as [Array<Record<string, unknown>>, unknown];

    return res.json({ ok: true, comments: rows ?? [] });
  } catch (err) {
    console.error('[dazza-review/comments]', err);
    return res.status(500).json({ error: 'Failed to load comments.' });
  }
}
