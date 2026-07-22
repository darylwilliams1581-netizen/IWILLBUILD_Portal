/**
 * POST /api/migrate-fleet-usage
 * Creates the fleet_usage_logs table if it doesn't exist.
 * Safe to run multiple times (idempotent).
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../lib/auth-middleware.js';

export default async function handler(req: Request, res: Response) {
  try {
    const ctx = await getSessionAndProfile(req, res);
    if (!ctx) return;
    if (ctx.profile.role !== 'owner' && ctx.profile.role !== 'admin') {
      return res.status(403).json({ error: 'Owner or admin required' });
    }

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS fleet_usage_logs (
        id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        company_id      INT UNSIGNED NOT NULL,
        fleet_id        INT UNSIGNED NOT NULL,
        job_id          INT UNSIGNED NULL,
        user_id         VARCHAR(255) NOT NULL,
        actor_type      ENUM('employee','contractor','consultant','delivery_driver','guest')
                        NOT NULL DEFAULT 'employee',
        started_at      DATETIME NOT NULL,
        ended_at        DATETIME NULL,
        duration_minutes INT UNSIGNED NULL,
        source          ENUM('portal','qr') NOT NULL DEFAULT 'portal',
        note            TEXT NULL,
        meter_start     DECIMAL(10,1) NULL,
        meter_end       DECIMAL(10,1) NULL,
        created_by      VARCHAR(255) NOT NULL,
        created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_fleet_usage_company  (company_id),
        INDEX idx_fleet_usage_fleet    (fleet_id),
        INDEX idx_fleet_usage_job      (job_id),
        INDEX idx_fleet_usage_user     (user_id),
        INDEX idx_fleet_usage_started  (started_at),
        INDEX idx_fleet_usage_active   (fleet_id, ended_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    res.json({ ok: true, message: 'fleet_usage_logs table ready' });
  } catch (error) {
    console.error('POST /api/migrate-fleet-usage error:', error);
    res.status(500).json({ error: String(error) });
  }
}
