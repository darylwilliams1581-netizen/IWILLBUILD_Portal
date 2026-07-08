/**
 * POST /api/migrate-emergency-alerts
 * Idempotent migration — creates the emergency_alerts table.
 * Safe to call multiple times.
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../lib/auth-middleware.js';

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;
  if (auth.profile.role !== 'owner' && auth.profile.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS emergency_alerts (
        id                  INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
        company_id          INT           NOT NULL,
        job_id              INT           NOT NULL,
        initiated_by        VARCHAR(255)  NOT NULL,
        initiated_by_name   VARCHAR(255)  NOT NULL,
        reason              VARCHAR(100)  NOT NULL,
        note                VARCHAR(100)  NULL,
        status              VARCHAR(30)   NOT NULL DEFAULT 'active',
        lat                 DECIMAL(10,7) NULL,
        lng                 DECIMAL(10,7) NULL,
        location_accuracy_m DECIMAL(7,2)  NULL,
        location_denied     TINYINT(1)    NOT NULL DEFAULT 0,
        acknowledged_by     VARCHAR(255)  NULL,
        acknowledged_by_name VARCHAR(255) NULL,
        acknowledged_at     TIMESTAMP     NULL,
        resolved_by         VARCHAR(255)  NULL,
        resolved_by_name    VARCHAR(255)  NULL,
        resolved_at         TIMESTAMP     NULL,
        offline_queued      TINYINT(1)    NOT NULL DEFAULT 0,
        created_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_ea_company_job  (company_id, job_id),
        INDEX idx_ea_status       (status),
        INDEX idx_ea_initiated_by (initiated_by)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `));

    return res.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('already exists')) return res.json({ ok: true, skipped: true });
    console.error('migrate-emergency-alerts error:', err);
    return res.status(500).json({ error: msg });
  }
}
