/**
 * POST /api/dazza/v3/communications/:id/dismiss
 * ─────────────────────────────────────────────────────────────────────────────
 * Authenticated user dismisses a non-critical banner/popup.
 * Critical modals cannot be dismissed this way — they require acknowledgement.
 */
import type { Request, Response } from 'express';
import { getSessionAndProfile } from '../../../../../../lib/auth-middleware.js';
import { db } from '../../../../../../db/client.js';
import { sql } from 'drizzle-orm';

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export default async function handler(req: Request, res: Response) {
  try {
    const { session } = await getSessionAndProfile(req);
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const { id } = req.params as { id: string };
    const userId = session.user.id;

    // Check it's not critical
    const [rows] = await db.execute(sql.raw(`
      SELECT is_critical FROM incident_communications WHERE id = '${esc(id)}' LIMIT 1
    `)) as unknown as [Array<{ is_critical: number }>, unknown];

    if (!rows?.[0]) return res.status(404).json({ error: 'Communication not found.' });
    if (rows[0].is_critical) {
      return res.status(400).json({ error: 'Critical communications cannot be dismissed — use acknowledge.' });
    }

    // Upsert dismissal
    await db.execute(sql.raw(`
      INSERT IGNORE INTO incident_comm_dismissals (comm_id, user_id, dismissed_at)
      VALUES ('${esc(id)}', '${esc(userId)}', NOW())
    `));

    // Increment dismiss count
    await db.execute(sql.raw(`
      UPDATE incident_communications SET dismiss_count = dismiss_count + 1 WHERE id = '${esc(id)}'
    `));

    return res.json({ ok: true });
  } catch (err) {
    console.error('[dazza/v3/communications/:id/dismiss POST]', err);
    return res.status(500).json({ error: 'Failed to dismiss.' });
  }
}
