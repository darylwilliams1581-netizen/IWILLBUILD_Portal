/**
 * POST /api/owner-console/swms/migrate-master-library
 *
 * Idempotent migration:
 *  1. Alters swms_templates.company_id to allow NULL
 *     (NULL = platform master template, not owned by any company)
 *  2. Adds is_platform_master TINYINT(1) column
 *  3. Adds source_master_id INT column (links a company copy back to its master)
 *
 * Platform owner only. Safe to re-run.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../lib/auth-middleware.js';

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  const [ownerCheck] = await db.execute(sql.raw(
    `SELECT role FROM profiles WHERE user_id = '${auth.session.user.id}' LIMIT 1`
  )) as unknown as [Array<{ role: string }>, unknown];

  if (ownerCheck?.[0]?.role !== 'platform_owner') {
    return res.status(403).json({ error: 'Platform owner access required' });
  }

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
        msg.includes('ER_DUP_FIELDNAME') ||
        msg.includes("Can't DROP")
      ) {
        results.push(`~ ${name} (already done)`);
      } else {
        results.push(`✗ ${name}: ${msg}`);
        console.warn(`[migrate-master-library] ${name}:`, msg);
      }
    }
  }

  // 1. Allow NULL on company_id so platform masters have no company
  await run(
    'swms_templates.company_id → nullable',
    `ALTER TABLE swms_templates MODIFY COLUMN company_id INT NULL`
  );

  // 2. Add is_platform_master flag
  await run(
    'swms_templates.is_platform_master',
    `ALTER TABLE swms_templates ADD COLUMN is_platform_master TINYINT(1) NOT NULL DEFAULT 0`
  );

  // 3. Add source_master_id so company copies can reference their origin
  await run(
    'swms_templates.source_master_id',
    `ALTER TABLE swms_templates ADD COLUMN source_master_id INT NULL`
  );

  // 4. Add index for fast platform master queries
  await run(
    'idx_platform_master',
    `ALTER TABLE swms_templates ADD INDEX idx_platform_master (is_platform_master)`
  );

  return res.json({ ok: true, results });
}
