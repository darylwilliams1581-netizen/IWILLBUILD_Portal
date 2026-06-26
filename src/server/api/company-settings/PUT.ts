import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { getAuth } from '../../../lib/auth/auth.js';
import { profiles } from '../../db/schema.js';
import { eq, sql } from 'drizzle-orm';

const VALID_SECTIONS = ['structure', 'dazza', 'banner', 'pdf'] as const;
type Section = typeof VALID_SECTIONS[number];

/**
 * Ensure the column exists — self-healing for older installs.
 * db.execute returns [rows, fields] from mysql2 — must unpack correctly.
 */
async function ensureCol(col: string) {
  try {
    await db.execute(sql.raw(`ALTER TABLE \`company_settings\` ADD COLUMN \`${col}\` LONGTEXT NOT NULL DEFAULT '{}'`));
  } catch (e: unknown) {
    const err = e as { cause?: { errno?: number } };
    if (err?.cause?.errno !== 1060) {
      // Not a duplicate-column error — log it
      console.warn(`[ensureCol] Could not add ${col}:`, e);
    }
    // ER_DUP_FIELDNAME (1060) = column already exists, silently ignore
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
    if (!['owner', 'admin'].includes(profile.role ?? '')) return res.status(403).json({ error: 'Owner/Admin only' });

    const { section, data } = req.body as { section: Section; data: unknown };
    if (!section || !VALID_SECTIONS.includes(section)) {
      return res.status(400).json({ error: 'Invalid section' });
    }

    // col is safe — validated against the whitelist above
    const col = `${section}_json`;

    // Self-heal: add column if missing
    await ensureCol(col);

    const jsonStr = JSON.stringify(data ?? {});
    const companyId = profile.companyId;

    // Check if row exists — db.execute returns [rows, fields]
    const existResult = await db.execute(
      sql`SELECT company_id FROM company_settings WHERE company_id = ${companyId} LIMIT 1`
    );
    const existRows = existResult as unknown as Array<Array<{ company_id: number }>>;
    const rowExists = (existRows[0]?.length ?? 0) > 0;

    if (!rowExists) {
      // Insert a bare row first (all JSON columns default to '{}')
      await db.execute(
        sql`INSERT INTO company_settings (company_id) VALUES (${companyId})`
      );
    }

    // UPDATE the specific column.
    // col is validated against VALID_SECTIONS — safe to use in sql.raw for the column identifier.
    const colRaw = sql.raw(`\`${col}\``);
    await db.execute(
      sql`UPDATE company_settings SET ${colRaw} = ${jsonStr}, updated_at = NOW() WHERE company_id = ${companyId}`
    );

    res.json({ ok: true });
  } catch (error) {
    console.error('PUT /api/company-settings error:', error);
    res.status(500).json({ error: 'Failed to save settings' });
  }
}
