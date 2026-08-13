/**
 * POST /api/migrate-photo-gps
 * Idempotent migration — adds gps_lat, gps_lng, gps_accuracy columns to job_photos.
 * Safe to run multiple times; duplicate-column errors are silently ignored.
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(_req: Request, res: Response) {
  const results: string[] = [];

  async function run(name: string, ddl: string) {
    try {
      await db.execute(sql.raw(ddl));
      results.push(`✓ ${name}`);
    } catch (e: unknown) {
      const msg = String((e as Error)?.message ?? e);
      if (
        msg.includes('already exists') ||
        msg.includes('Duplicate column name') ||
        msg.includes('ER_DUP_FIELDNAME')
      ) {
        results.push(`~ ${name} (already exists)`);
      } else {
        results.push(`✗ ${name}: ${msg}`);
        console.warn(`[migrate-photo-gps] ${name} failed:`, msg);
      }
    }
  }

  await run(
    'job_photos.gps_lat',
    'ALTER TABLE job_photos ADD COLUMN gps_lat DOUBLE NULL',
  );
  await run(
    'job_photos.gps_lng',
    'ALTER TABLE job_photos ADD COLUMN gps_lng DOUBLE NULL',
  );
  await run(
    'job_photos.gps_accuracy',
    'ALTER TABLE job_photos ADD COLUMN gps_accuracy DOUBLE NULL',
  );

  const allOk = results.every((r) => r.startsWith('✓') || r.startsWith('~'));
  return res.status(allOk ? 200 : 207).json({ results });
}
