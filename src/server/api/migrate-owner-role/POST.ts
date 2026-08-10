import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(_req: Request, res: Response) {
  const results: string[] = [];

  try {
    // ── Helper: check if column exists ────────────────────────────────────────
    async function columnExists(table: string, column: string): Promise<boolean> {
      const rows = await db.execute(sql`
        SELECT COUNT(*) as cnt
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = ${table}
          AND COLUMN_NAME  = ${column}
      `);
      const row = ((rows as unknown as [Array<{ cnt: number }>, unknown])[0])[0];
      return Number(row?.cnt ?? 0) > 0;
    }

    // ── Step 1: Ensure all permission columns exist (idempotent) ──────────────
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

    // ── Step 2: For each company, promote the earliest admin to owner ─────────
    // Single query: find the lowest profile.id per company where role is admin/owner
    try {
      await db.execute(sql`
        UPDATE profiles p
        INNER JOIN (
          SELECT MIN(id) AS min_id
          FROM profiles
          WHERE company_id IS NOT NULL
            AND role IN ('admin', 'owner')
          GROUP BY company_id
        ) AS first_admins ON p.id = first_admins.min_id
        SET p.role               = 'owner',
            p.perm_admin          = 1,
            p.perm_invite_users   = 1,
            p.perm_delete_records = 1,
            p.perm_jobs           = 1,
            p.perm_fleet          = 1,
            p.perm_forms          = 1,
            p.perm_files          = 1,
            p.perm_estimating     = 1,
            p.perm_dazza_ai       = 1,
            p.perm_see_dollars    = 1,
            p.status              = 'active'
        WHERE p.role != 'owner'
      `);
      results.push('first admin per company promoted to owner');
    } catch (e) {
      results.push(`owner promotion error: ${String(e)}`);
    }

    // ── Step 3: Ensure existing owners have all perms locked on ───────────────
    try {
      await db.execute(sql`
        UPDATE profiles
        SET perm_admin          = 1,
            perm_invite_users   = 1,
            perm_delete_records = 1,
            perm_jobs           = 1,
            perm_fleet          = 1,
            perm_forms          = 1,
            perm_files          = 1,
            perm_estimating     = 1,
            perm_dazza_ai       = 1,
            perm_see_dollars    = 1,
            status              = 'active'
        WHERE role = 'owner'
      `);
      results.push('owner profiles: all permissions locked on');
    } catch (e) {
      results.push(`owner perm lock error: ${String(e)}`);
    }

    // ── Step 4: Ensure admin-role profiles have admin perms ───────────────────
    try {
      await db.execute(sql`
        UPDATE profiles
        SET perm_admin          = 1,
            perm_invite_users   = 1,
            perm_delete_records = 1
        WHERE role = 'admin'
      `);
      results.push('admin profiles: permissions backfilled');
    } catch (e) {
      results.push(`admin backfill error: ${String(e)}`);
    }

    res.json({ ok: true, results });
  } catch (error) {
    console.error('migrate-owner-role error:', error);
    res.status(500).json({ ok: false, error: String(error), results });
  }
}
