import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { getAuth } from '../../../lib/auth/auth.js';
import { profiles } from '../../db/schema.js';
import { eq, sql } from 'drizzle-orm';

const VALID_SECTIONS = ['structure', 'dazza', 'banner', 'pdf'] as const;
type Section = typeof VALID_SECTIONS[number];

/** Ensure the column exists — self-healing for older installs */
async function ensureCol(col: string) {
  try {
    const [rows] = await db.execute(sql`
      SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'company_settings' AND COLUMN_NAME = ${col}
    `);
    const cnt = (rows as unknown as Array<{ cnt: number }>)[0]?.cnt ?? 0;
    if (cnt === 0) {
      await db.execute(sql.raw(`ALTER TABLE \`company_settings\` ADD COLUMN \`${col}\` LONGTEXT NOT NULL DEFAULT '{}'`));
    }
  } catch {
    // ignore — best effort
  }
}

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

    const { section, data } = req.body as { section: Section; data: unknown };
    if (!section || !VALID_SECTIONS.includes(section)) {
      return res.status(400).json({ error: 'Invalid section' });
    }

    const col = `${section}_json`;

    // Self-heal: add column if missing (handles pdf_json on older installs)
    await ensureCol(col);

    const jsonStr = JSON.stringify(data ?? {});

    await db.execute(
      sql`INSERT INTO company_settings (company_id, ${sql.raw(col)})
          VALUES (${profile.companyId}, ${jsonStr})
          ON DUPLICATE KEY UPDATE ${sql.raw(col)} = ${jsonStr}, updated_at = NOW()`
    );

    res.json({ ok: true });
  } catch (error) {
    console.error('PUT /api/company-settings error:', error);
    res.status(500).json({ error: 'Failed to save settings' });
  }
}
