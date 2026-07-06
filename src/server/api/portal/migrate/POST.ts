/**
 * POST /api/portal/migrate
 * Creates the customer_portal_tokens table if it doesn't exist.
 * Called once on portal first-load.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(_req: Request, res: Response) {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS customer_portal_tokens (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        company_id    INT NOT NULL,
        customer_id   INT NOT NULL,
        token         VARCHAR(128) NOT NULL UNIQUE,
        email         VARCHAR(255) NOT NULL,
        expires_at    DATETIME NOT NULL,
        used_at       DATETIME NULL,
        created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_token (token),
        INDEX idx_customer (company_id, customer_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    res.json({ ok: true });
  } catch (err) {
    console.error('Portal migrate error:', err);
    res.status(500).json({ error: String(err) });
  }
}
