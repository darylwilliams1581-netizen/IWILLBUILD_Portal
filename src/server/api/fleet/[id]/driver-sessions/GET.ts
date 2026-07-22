/**
 * GET /api/fleet/:id/driver-sessions
 * Returns driver session history for a specific fleet asset.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../lib/auth-middleware.js';

function toUtcIso(val: unknown): string | null {
  if (!val) return null;
  const s = String(val);
  if (s.endsWith('Z') || s.includes('+')) return s;
  return s.replace(' ', 'T') + 'Z';
}

export default async function handler(req: Request, res: Response) {
  try {
    const ctx = await getSessionAndProfile(req, res);
    if (!ctx) return;

    const assetId = parseInt(req.params.id, 10);
    if (isNaN(assetId)) return res.status(400).json({ error: 'Invalid asset id' });

    const companyId = ctx.profile.companyId;

    const [rows] = await db.execute(
      sql`SELECT fds.id, fds.user_id, fds.driver_name, fds.start_at, fds.end_at, fds.status, fds.source
          FROM fleet_driver_sessions fds
          WHERE fds.company_id = ${companyId}
            AND fds.fleet_asset_id = ${assetId}
          ORDER BY fds.start_at DESC
          LIMIT 100`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    const sessions = (rows ?? []).map((r: Record<string, unknown>) => ({
      ...r,
      start_at: toUtcIso(r.start_at),
      end_at:   toUtcIso(r.end_at),
    }));

    res.json({ sessions });
  } catch (error) {
    console.error('GET /api/fleet/:id/driver-sessions error:', error);
    res.status(500).json({ error: 'Failed to load driver sessions' });
  }
}
