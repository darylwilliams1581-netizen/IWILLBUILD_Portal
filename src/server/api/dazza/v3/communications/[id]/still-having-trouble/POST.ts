/**
 * POST /api/dazza/v3/communications/:id/still-having-trouble
 * ─────────────────────────────────────────────────────────────────────────────
 * User reports they are still having trouble after a "resolved" communication.
 * Increments still_trouble_count and notifies the owner.
 */
import type { Request, Response } from 'express';
import { getSessionAndProfile } from '../../../../../../lib/auth-middleware.js';
import { db } from '../../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { sendSms, isSmsConfigured } from '../../../../../../lib/sms.js';
import { getSecret } from '#airo/secrets';

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export default async function handler(req: Request, res: Response) {
  try {
    const result = await getSessionAndProfile(req, res);
    if (!result) return; // response already sent by getSessionAndProfile
    const { session } = result;

    const { id } = req.params as { id: string };
    const userId = session.user.id;
    const userName = session.user.name ?? session.user.email ?? 'A user';

    // Load the communication
    const [rows] = await db.execute(sql.raw(`
      SELECT ic.*, di.title AS incident_title
      FROM incident_communications ic
      LEFT JOIN dazza_incidents di ON di.id = ic.incident_id
      WHERE ic.id = '${esc(id)}' LIMIT 1
    `)) as unknown as [Array<Record<string, unknown>>, unknown];

    if (!rows?.[0]) return res.status(404).json({ error: 'Communication not found.' });
    const comm = rows[0];

    // Increment counter
    await db.execute(sql.raw(`
      UPDATE incident_communications SET still_trouble_count = still_trouble_count + 1 WHERE id = '${esc(id)}'
    `));

    // Notify owner via SMS
    if (isSmsConfigured()) {
      const ownerPhone = getSecret('PLATFORM_OWNER_PHONE');
      if (ownerPhone) {
        const incidentRef = comm.incident_title ? ` (${String(comm.incident_title).slice(0, 60)})` : '';
        void sendSms(
          ownerPhone,
          `DAZZA — STILL HAVING TROUBLE: ${userName} says the issue is NOT resolved${incidentRef}. Check the Owner Console.`
        ).catch(() => {});
      }
    }

    // Create a new incident or link a recurrence (fire-and-forget)
    void db.execute(sql.raw(`
      INSERT INTO dazza_v3_audit (id, owner_user_id, event_type, details_json, created_at)
      VALUES (UUID(), 'system', 'still_having_trouble', '${esc(JSON.stringify({
        commId: id,
        userId,
        userName,
        incidentId: comm.incident_id ?? null,
      }))}', NOW())
    `)).catch(() => {});

    return res.json({ ok: true, message: 'Thank you — we have been notified and will follow up.' });
  } catch (err) {
    console.error('[dazza/v3/communications/:id/still-having-trouble POST]', err);
    return res.status(500).json({ error: 'Failed to record.' });
  }
}
