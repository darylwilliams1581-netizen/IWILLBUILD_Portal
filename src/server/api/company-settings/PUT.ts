import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { getAuth } from '../../../lib/auth/auth.js';
import { profiles } from '../../db/schema.js';
import { eq, sql } from 'drizzle-orm';

const VALID_SECTIONS = ['structure', 'dazza', 'banner', 'pdf'] as const;
type Section = typeof VALID_SECTIONS[number];

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

    // col is validated against the whitelist — safe to embed in sql.raw for identifiers
    const col = `${section}_json`;
    const jsonStr = JSON.stringify(data ?? {});
    const companyId = profile.companyId;

    // Ensure column exists — attempt ALTER, ignore ER_DUP_FIELDNAME (1060)
    try {
      await db.execute(sql.raw(`ALTER TABLE \`company_settings\` ADD COLUMN \`${col}\` LONGTEXT NOT NULL DEFAULT '{}'`));
    } catch (e: unknown) {
      const err = e as { cause?: { errno?: number }; errno?: number };
      const errno = err?.cause?.errno ?? err?.errno;
      if (errno !== 1060) console.warn(`[company-settings PUT] ensureCol warning:`, e);
    }

    // db.execute returns [rowsArray, fields] — destructure to get rows
    const [existRows] = await db.execute(
      sql`SELECT company_id FROM company_settings WHERE company_id = ${companyId} LIMIT 1`
    ) as unknown as [Array<{ company_id: number }>, unknown];

    if (!existRows || existRows.length === 0) {
      // No row yet — INSERT with just company_id (all JSON cols default to '{}')
      await db.execute(sql`INSERT INTO company_settings (company_id) VALUES (${companyId})`);
    }

    // UPDATE the target column.
    // sql.raw inlines the column identifier verbatim; jsonStr and companyId become ? params.
    await db.execute(
      sql`UPDATE company_settings SET ${sql.raw(`\`${col}\``)} = ${jsonStr}, updated_at = NOW() WHERE company_id = ${companyId}`
    );

    res.json({ ok: true });
  } catch (error) {
    console.error('PUT /api/company-settings error:', error);
    res.status(500).json({ error: 'Failed to save settings' });
  }
}
