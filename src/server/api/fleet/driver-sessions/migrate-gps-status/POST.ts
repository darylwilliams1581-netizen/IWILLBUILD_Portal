/**
 * POST /api/fleet/driver-sessions/migrate-gps-status
 *
 * One-shot migration: adds location_permission_status and gps_status columns
 * to fleet_driver_sessions if they don't already exist.
 * Safe to call multiple times (uses IF NOT EXISTS / column-existence check).
 * Admin / platform_owner only.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../lib/auth-middleware.js';

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  const role = auth.profile.role ?? '';
  if (!['owner', 'admin', 'platform_owner'].includes(role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  try {
    // Check which columns already exist
    const [cols] = await db.execute(sql.raw(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'fleet_driver_sessions'
        AND COLUMN_NAME IN ('location_permission_status', 'gps_status', 'last_heartbeat_at')
    `)) as unknown as [Array<{ COLUMN_NAME: string }>, unknown];

    const existing = new Set((cols ?? []).map(r => r.COLUMN_NAME));
    const added: string[] = [];

    if (!existing.has('location_permission_status')) {
      await db.execute(sql.raw(`
        ALTER TABLE fleet_driver_sessions
        ADD COLUMN location_permission_status VARCHAR(20) NULL DEFAULT NULL
        COMMENT 'granted | prompt | denied | unavailable | unknown'
      `));
      added.push('location_permission_status');
    }

    if (!existing.has('gps_status')) {
      await db.execute(sql.raw(`
        ALTER TABLE fleet_driver_sessions
        ADD COLUMN gps_status VARCHAR(20) NULL DEFAULT NULL
        COMMENT 'live | waiting_permission | denied | unavailable | waiting_fix | stale'
      `));
      added.push('gps_status');
    }

    if (!existing.has('last_heartbeat_at')) {
      await db.execute(sql.raw(`
        ALTER TABLE fleet_driver_sessions
        ADD COLUMN last_heartbeat_at DATETIME NULL DEFAULT NULL
        COMMENT 'Timestamp of last driver heartbeat (permission/GPS status ping)'
      `));
      added.push('last_heartbeat_at');
    }

    return res.json({
      ok: true,
      added,
      skipped: ['location_permission_status', 'gps_status', 'last_heartbeat_at'].filter(c => existing.has(c)),
    });
  } catch (err) {
    console.error('migrate-gps-status error:', err);
    return res.status(500).json({ error: 'Migration failed', detail: String(err) });
  }
}
