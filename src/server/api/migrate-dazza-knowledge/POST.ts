/**
 * POST /api/migrate-dazza-knowledge
 * Creates the dazza_knowledge table if it doesn't exist.
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(_req: Request, res: Response) {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS dazza_knowledge (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        company_id    INT NOT NULL,
        title         VARCHAR(255) NOT NULL,
        category      VARCHAR(100) NOT NULL DEFAULT 'Company procedure',
        content       LONGTEXT NOT NULL,
        source_name   VARCHAR(255) DEFAULT NULL,
        active        TINYINT(1) NOT NULL DEFAULT 1,
        created_by    VARCHAR(255) NOT NULL DEFAULT '',
        created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_dk_company (company_id),
        INDEX idx_dk_active  (company_id, active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    res.json({ ok: true, message: 'dazza_knowledge table ready' });
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    console.error('migrate-dazza-knowledge error:', msg);
    res.status(500).json({ error: msg });
  }
}
