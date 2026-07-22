/**
 * POST /api/migrate-fleet-analytics
 *
 * Idempotent migration that:
 *  1. Adds telemetry + summary columns to fleet_driver_sessions
 *  2. Creates fleet_session_telemetry table (GPS point log)
 *  3. Creates fleet_analytics_settings table (per-company toggles)
 *
 * Safe to call multiple times — uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../lib/auth-middleware.js';

async function tryExec(label: string, query: string) {
  try {
    await db.execute(sql.raw(query));
    return { label, ok: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    // Ignore "Duplicate column" — means migration already ran
    if (msg.includes('Duplicate column') || msg.includes('already exists')) {
      return { label, ok: true, skipped: true };
    }
    return { label, ok: false, error: msg };
  }
}

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;
  if (auth.profile.role !== 'owner' && auth.profile.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const results = await Promise.all([
    // ── fleet_driver_sessions: summary columns ────────────────────────────
    tryExec('fds.total_distance_km',
      `ALTER TABLE fleet_driver_sessions ADD COLUMN IF NOT EXISTS total_distance_km DECIMAL(10,3) NULL`),
    tryExec('fds.active_drive_seconds',
      `ALTER TABLE fleet_driver_sessions ADD COLUMN IF NOT EXISTS active_drive_seconds INT NULL`),
    tryExec('fds.avg_speed_kmh',
      `ALTER TABLE fleet_driver_sessions ADD COLUMN IF NOT EXISTS avg_speed_kmh DECIMAL(6,2) NULL`),
    tryExec('fds.max_speed_kmh',
      `ALTER TABLE fleet_driver_sessions ADD COLUMN IF NOT EXISTS max_speed_kmh DECIMAL(6,2) NULL`),
    tryExec('fds.collision_count',
      `ALTER TABLE fleet_driver_sessions ADD COLUMN IF NOT EXISTS collision_count INT NOT NULL DEFAULT 0`),
    tryExec('fds.summary_computed_at',
      `ALTER TABLE fleet_driver_sessions ADD COLUMN IF NOT EXISTS summary_computed_at TIMESTAMP NULL`),

    // ── fleet_session_telemetry ───────────────────────────────────────────
    tryExec('create fleet_session_telemetry', `
      CREATE TABLE IF NOT EXISTS fleet_session_telemetry (
        id            BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
        company_id    INT          NOT NULL,
        session_id    INT          NOT NULL,
        recorded_at   DATETIME(3)  NOT NULL,
        lat           DECIMAL(10,7) NOT NULL,
        lng           DECIMAL(10,7) NOT NULL,
        speed_kmh     DECIMAL(6,2)  NULL,
        heading       DECIMAL(5,2)  NULL,
        accuracy_m    DECIMAL(7,2)  NULL,
        is_collision  TINYINT(1)   NOT NULL DEFAULT 0,
        INDEX idx_fst_session (session_id),
        INDEX idx_fst_company_session (company_id, session_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `),

    // ── fleet_analytics_settings ──────────────────────────────────────────
    tryExec('create fleet_analytics_settings', `
      CREATE TABLE IF NOT EXISTS fleet_analytics_settings (
        id                      INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
        company_id              INT          NOT NULL UNIQUE,
        track_distance          TINYINT(1)   NOT NULL DEFAULT 1,
        track_drive_time        TINYINT(1)   NOT NULL DEFAULT 1,
        track_speed             TINYINT(1)   NOT NULL DEFAULT 1,
        enable_speeding_alerts  TINYINT(1)   NOT NULL DEFAULT 0,
        speeding_threshold_kmh  INT          NOT NULL DEFAULT 110,
        enable_collision_alerts TINYINT(1)   NOT NULL DEFAULT 0,
        updated_at              TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_fas_company (company_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `),
  ]);

  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    return res.status(500).json({ ok: false, results, failed });
  }
  return res.json({ ok: true, results });
}
