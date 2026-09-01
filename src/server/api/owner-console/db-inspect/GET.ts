/**
 * GET /api/owner-console/db-inspect
 * ─────────────────────────────────────────────────────────────────────────────
 * TEMPORARY diagnostic endpoint — platform-owner only.
 * Returns ONLY table names (no rows, no secrets, no R2 keys).
 * DELETE THIS FILE after the live check is complete.
 */

import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';

const TABLES_TO_CHECK = [
  'image_safeguard_scan_runs',
  'image_safeguard_findings',
  'image_safeguard_scan_cursor',
  'image_safeguard_finding_keys',
  'image_safeguard_records',
];

export default async function handler(_req: Request, res: Response) {
  try {
    const rows = await db.execute(sql`
      SELECT TABLE_NAME
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN (
          'image_safeguard_scan_runs',
          'image_safeguard_findings',
          'image_safeguard_scan_cursor',
          'image_safeguard_finding_keys',
          'image_safeguard_records'
        )
      ORDER BY TABLE_NAME
    `);

    const found = (rows as unknown as Array<{ TABLE_NAME: string }>).map(r => r.TABLE_NAME);
    const missing = TABLES_TO_CHECK.filter(t => !found.includes(t));

    return res.json({
      found,
      missing,
      allPresent: missing.length === 0,
    });
  } catch (err) {
    return res.status(500).json({
      error: 'inspect_failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
