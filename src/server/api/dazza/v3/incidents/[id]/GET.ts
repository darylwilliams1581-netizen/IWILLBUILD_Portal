/**
 * GET /api/dazza/v3/incidents/:id
 * ─────────────────────────────────────────────────────────────────────────────
 * Platform-owner only. Full incident detail including rescue entries.
 */
import type { Request, Response } from 'express';
import { getPlatformOwnerInfo } from '../../../../../lib/platform-owner-guard.js';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const ownerInfo = await getPlatformOwnerInfo(req);
    if (!ownerInfo) return res.status(401).json({ error: 'Unauthorised' });
    if (!ownerInfo.isPlatformOwner) return res.status(403).json({ error: 'Owner access required.' });

    const { id } = req.params as { id: string };

    const [rows] = await db.execute(sql.raw(`
      SELECT * FROM dazza_incidents WHERE id = '${id.replace(/'/g, "''")}' LIMIT 1
    `)) as unknown as [Array<Record<string, unknown>>, unknown];

    if (!rows?.[0]) return res.status(404).json({ error: 'Incident not found.' });

    const [rescueRows] = await db.execute(sql.raw(`
      SELECT id, user_name, user_email, user_phone,
             attempted_action, failure_description, recovered,
             last_successful_action, likely_cause, safe_workaround,
             suggested_call_wording, rescue_status,
             called_at, resolved_at, created_at
      FROM dazza_client_rescue
      WHERE incident_id = '${id.replace(/'/g, "''")}'
      ORDER BY created_at DESC
      LIMIT 20
    `)) as unknown as [Array<Record<string, unknown>>, unknown];

    return res.json({
      ok: true,
      incident: rows[0],
      rescueEntries: rescueRows ?? [],
    });
  } catch (err) {
    console.error('[dazza/v3/incidents/:id GET]', err);
    return res.status(500).json({ error: 'Failed to load incident.' });
  }
}
