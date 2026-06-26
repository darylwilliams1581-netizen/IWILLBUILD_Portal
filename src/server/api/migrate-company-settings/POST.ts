import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { getAuth } from '../../../lib/auth/auth.js';
import { profiles } from '../../db/schema.js';
import { eq, sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });
    if (!['owner', 'admin'].includes(profile.role)) return res.status(403).json({ error: 'Owner/Admin only' });

    // Create company_settings table if not exists
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS company_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL UNIQUE,
        structure_json LONGTEXT NOT NULL DEFAULT '{}',
        dazza_json LONGTEXT NOT NULL DEFAULT '{}',
        banner_json LONGTEXT NOT NULL DEFAULT '{}',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Helper: add column if missing
    async function ensureCol(col: string, definition: string) {
      const [rows] = await db.execute(sql`
        SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'company_settings' AND COLUMN_NAME = ${col}
      `);
      const cnt = (rows as unknown as Array<{ cnt: number }>)[0]?.cnt ?? 0;
      if (cnt === 0) {
        await db.execute(sql.raw(`ALTER TABLE \`company_settings\` ADD COLUMN \`${col}\` ${definition}`));
      }
    }

    await ensureCol('banner_json', "LONGTEXT NOT NULL DEFAULT '{}'");
    await ensureCol('pdf_json',    "LONGTEXT NOT NULL DEFAULT '{}'");

    res.json({ ok: true, message: 'company_settings table ready' });
  } catch (error) {
    console.error('migrate-company-settings error:', error);
    res.status(500).json({ error: String(error) });
  }
}
