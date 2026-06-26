import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(_req: Request, res: Response) {
  const results: string[] = [];

  // Add job_number column (best-effort — ignore if already exists)
  try {
    await db.execute(sql`ALTER TABLE jobs ADD COLUMN job_number VARCHAR(50) NULL`);
    results.push('Added job_number column');
  } catch (e: unknown) {
    const msg = String(e);
    if (msg.includes('Duplicate column') || msg.includes('already exists') || msg.includes('ER_DUP_FIELDNAME')) {
      results.push('job_number column already exists — skipped');
    } else {
      return res.status(500).json({ error: msg, results });
    }
  }

  // Drop progress column (best-effort — ignore if already gone)
  try {
    await db.execute(sql`ALTER TABLE jobs DROP COLUMN progress`);
    results.push('Dropped progress column');
  } catch {
    results.push('progress column not present — skipped');
  }

  // Widen status column to 60 chars
  try {
    await db.execute(sql`ALTER TABLE jobs MODIFY COLUMN status VARCHAR(60) NOT NULL DEFAULT 'New'`);
    results.push('Widened status column to VARCHAR(60)');
  } catch (e: unknown) {
    results.push(`status column modify skipped: ${String(e)}`);
  }

  res.json({ ok: true, results });
}
