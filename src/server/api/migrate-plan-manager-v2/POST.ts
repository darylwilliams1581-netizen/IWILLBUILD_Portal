/**
 * POST /api/migrate-plan-manager-v2
 * Idempotent — adds sort_order to project_drawings and job_drawing_links.
 * Safe to run multiple times.
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
      }
    }
  }

  // Add sort_order to project_drawings
  await run('project_drawings.sort_order', `
    ALTER TABLE project_drawings ADD COLUMN sort_order INT NOT NULL DEFAULT 0
  `);

  // Add sort_order to job_drawing_links (per-job ordering)
  await run('job_drawing_links.sort_order', `
    ALTER TABLE job_drawing_links ADD COLUMN sort_order INT NOT NULL DEFAULT 0
  `);

  // Backfill sort_order from id so existing rows have a stable order
  await run('backfill project_drawings sort_order', `
    UPDATE project_drawings SET sort_order = id WHERE sort_order = 0
  `);

  await run('backfill job_drawing_links sort_order', `
    UPDATE job_drawing_links SET sort_order = id WHERE sort_order = 0
  `);

  const failed = results.filter(r => r.startsWith('✗'));
  return res.status(failed.length ? 500 : 200).json({ results, ok: failed.length === 0 });
}
