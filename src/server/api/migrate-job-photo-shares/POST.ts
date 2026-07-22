/**
 * POST /api/migrate-job-photo-shares
 * Idempotent: creates the job_photo_shares table if it doesn't exist.
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(_req: Request, res: Response) {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS job_photo_shares (
        id                  INT AUTO_INCREMENT PRIMARY KEY,
        job_id              INT NOT NULL,
        company_id          INT NOT NULL,
        token_hash          VARCHAR(64) NOT NULL,
        expires_at          DATETIME NULL,
        created_by_user_id  VARCHAR(36) NULL,
        created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_job_photo_shares_token (token_hash),
        UNIQUE KEY uq_job_photo_shares_job (job_id),
        INDEX idx_jps_company (company_id)
      )
    `);
    res.json({ ok: true, message: 'job_photo_shares table ready' });
  } catch (error) {
    console.error('migrate-job-photo-shares error:', error);
    res.status(500).json({ error: String(error) });
  }
}
