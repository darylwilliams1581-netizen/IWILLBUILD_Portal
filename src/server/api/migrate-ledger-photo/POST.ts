/**
 * POST /api/migrate-ledger-photo
 * Adds photo_url column to job_cost_ledger (idempotent).
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(_req: Request, res: Response) {
  const results: string[] = [];

  try {
    await db.execute(sql`ALTER TABLE job_cost_ledger ADD COLUMN photo_url VARCHAR(1000) NULL`);
    results.push('Added photo_url column to job_cost_ledger');
  } catch (e: unknown) {
    const msg = String(e);
    if (msg.includes('Duplicate column') || msg.includes('already exists') || msg.includes('ER_DUP_FIELDNAME')) {
      results.push('photo_url column already exists — skipped');
    } else {
      return res.status(500).json({ error: msg, results });
    }
  }

  res.json({ ok: true, results });
}
