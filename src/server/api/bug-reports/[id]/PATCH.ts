/**
 * PATCH /api/bug-reports/:id
 * Owner-only. Update status, resolution note, category.
 * Body: { status?, resolution_note?, category? }
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getPlatformOwnerInfo } from '../../../lib/platform-owner-guard.js';

const VALID_STATUSES = new Set(['open', 'in_progress', 'resolved', 'closed']);

export default async function handler(req: Request, res: Response) {
  try {
    const ownerInfo = await getPlatformOwnerInfo(req);
    if (!ownerInfo) return res.status(401).json({ error: 'Unauthorised' });
    if (!ownerInfo.isPlatformOwner) return res.status(403).json({ error: 'Owner access required.' });

    const { id } = req.params;
    const { status, resolution_note, category } = req.body as {
      status?: string;
      resolution_note?: string;
      category?: string;
    };

    const sets: string[] = ['updated_at = NOW()'];

    if (status !== undefined) {
      if (!VALID_STATUSES.has(status)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${[...VALID_STATUSES].join(', ')}` });
      }
      sets.push(`status = '${status}'`);
      if (status === 'resolved') {
        const resolverName = (ownerInfo.email ?? 'Owner').replace(/'/g, "''");
        sets.push(`resolved_at = NOW()`);
        sets.push(`resolved_by_name = '${resolverName}'`);
      }
    }

    if (resolution_note !== undefined) {
      sets.push(`resolution_note = '${resolution_note.slice(0, 2000).replace(/'/g, "''")}'`);
    }

    if (category !== undefined) {
      sets.push(`category = '${category.slice(0, 100).replace(/'/g, "''")}'`);
    }

    await db.execute(sql.raw(
      `UPDATE bug_reports SET ${sets.join(', ')} WHERE id = '${id.replace(/'/g, "''")}'`
    ));

    return res.json({ ok: true });
  } catch (err) {
    console.error('[bug-reports/PATCH]', err);
    return res.status(500).json({ error: 'Failed to update bug report.' });
  }
}
