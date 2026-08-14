/**
 * PATCH /api/dazza/v3/client-rescue/:id
 * ─────────────────────────────────────────────────────────────────────────────
 * Platform-owner only. Update rescue entry status.
 * Body: { status: 'called' | 'resolved' | 'escalated' | 'follow_up', note?: string }
 */
import type { Request, Response } from 'express';
import { getPlatformOwnerInfo } from '../../../../../../lib/platform-owner-guard.js';
import { db } from '../../../../../../db/client.js';
import { sql } from 'drizzle-orm';

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export default async function handler(req: Request, res: Response) {
  try {
    const ownerInfo = await getPlatformOwnerInfo(req);
    if (!ownerInfo) return res.status(401).json({ error: 'Unauthorised' });
    if (!ownerInfo.isPlatformOwner) return res.status(403).json({ error: 'Owner access required.' });

    const { id } = req.params as { id: string };
    const { status, note } = req.body as { status?: string; note?: string };

    const VALID_STATUSES = ['needs_call', 'called', 'resolved', 'escalated', 'follow_up'];
    if (!status || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    }

    const calledAt = status === 'called' ? ', called_at = NOW()' : '';
    const resolvedAt = status === 'resolved' ? ', resolved_at = NOW()' : '';
    const noteUpdate = note ? `, resolution_note = '${esc(note.slice(0, 1000))}'` : '';

    await db.execute(sql.raw(`
      UPDATE dazza_client_rescue
      SET rescue_status = '${esc(status)}',
          updated_at = NOW()
          ${calledAt} ${resolvedAt} ${noteUpdate}
      WHERE id = '${esc(id)}'
    `));

    return res.json({ ok: true });
  } catch (err) {
    console.error('[dazza/v3/client-rescue/:id PATCH]', err);
    return res.status(500).json({ error: 'Failed to update rescue entry.' });
  }
}
