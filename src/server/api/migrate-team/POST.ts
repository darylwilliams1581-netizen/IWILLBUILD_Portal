import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(_req: Request, res: Response) {
  const results: string[] = [];

  // Helper: check if column exists
  async function columnExists(table: string, column: string): Promise<boolean> {
    const rows = await db.execute(sql`
      SELECT COUNT(*) as cnt
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ${table}
        AND COLUMN_NAME = ${column}
    `);
    const row = ((rows as unknown as [Array<{ cnt: number }>, unknown])[0])[0];
    return Number(row?.cnt ?? 0) > 0;
  }

  // Add permission + status columns to profiles
  const profileCols: Array<[string, string]> = [
    ['status',              "VARCHAR(30) NOT NULL DEFAULT 'active'"],
    ['perm_jobs',           'BOOLEAN NOT NULL DEFAULT 1'],
    ['perm_fleet',          'BOOLEAN NOT NULL DEFAULT 1'],
    ['perm_forms',          'BOOLEAN NOT NULL DEFAULT 1'],
    ['perm_files',          'BOOLEAN NOT NULL DEFAULT 1'],
    ['perm_estimating',     'BOOLEAN NOT NULL DEFAULT 1'],
    ['perm_dazza_ai',       'BOOLEAN NOT NULL DEFAULT 1'],
    ['perm_admin',          'BOOLEAN NOT NULL DEFAULT 0'],
    ['perm_see_dollars',    'BOOLEAN NOT NULL DEFAULT 1'],
    ['perm_invite_users',   'BOOLEAN NOT NULL DEFAULT 0'],
    ['perm_delete_records', 'BOOLEAN NOT NULL DEFAULT 0'],
  ];

  for (const [col, def] of profileCols) {
    try {
      const exists = await columnExists('profiles', col);
      if (!exists) {
        await db.execute(sql.raw(`ALTER TABLE profiles ADD COLUMN ${col} ${def}`));
        results.push(`profiles.${col}: added`);
      } else {
        results.push(`profiles.${col}: already exists`);
      }
    } catch (e) {
      results.push(`profiles.${col} error: ${String(e)}`);
    }
  }

  // Set admin users to have perm_admin=1 and all perms
  try {
    await db.execute(sql`
      UPDATE profiles
      SET perm_admin = 1,
          perm_invite_users = 1,
          perm_delete_records = 1
      WHERE role IN ('admin', 'owner')
    `);
    results.push('profiles: admin permissions backfilled');
  } catch (e) {
    results.push(`profiles admin backfill error: ${String(e)}`);
  }

  res.json({ ok: true, results });
}
