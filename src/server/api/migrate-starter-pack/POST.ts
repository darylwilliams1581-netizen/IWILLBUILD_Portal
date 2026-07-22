import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';

/**
 * Idempotent migration for starter pack infrastructure.
 * Adds starter_pack_loaded / starter_pack_loaded_at to companies.
 * Creates starter_pack_runs table.
 * Safe to run multiple times.
 */
export default async function handler(_req: Request, res: Response) {
  const results: string[] = [];

  // 1. Add starter_pack_loaded column to companies (idempotent)
  try {
    await db.execute(sql`
      ALTER TABLE companies
        ADD COLUMN IF NOT EXISTS starter_pack_loaded TINYINT(1) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS starter_pack_loaded_at TIMESTAMP NULL
    `);
    results.push('companies.starter_pack_loaded: ok');
  } catch (e) {
    const msg = String(e);
    // MySQL 8 doesn't support IF NOT EXISTS on ALTER TABLE ADD COLUMN in all versions
    // Ignore "Duplicate column" errors — column already exists
    if (msg.includes('Duplicate column') || msg.includes('already exists')) {
      results.push('companies.starter_pack_loaded: already exists');
    } else {
      results.push(`companies.starter_pack_loaded ERROR: ${msg}`);
    }
  }

  // 2. Create starter_pack_runs table (idempotent)
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS starter_pack_runs (
        id INT PRIMARY KEY AUTO_INCREMENT,
        company_id INT NOT NULL,
        run_by_user_id VARCHAR(36) NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'pending',
        notes TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
      )
    `);
    results.push('starter_pack_runs: ok');
  } catch (e) {
    results.push(`starter_pack_runs ERROR: ${String(e)}`);
  }

  res.json({ ok: true, results });
}
