import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { getAuth } from '../../../lib/auth/auth.js';
import { profiles } from '../../db/schema.js';
import { eq, sql } from 'drizzle-orm';

const VALID_SECTIONS = ['structure', 'dazza', 'banner', 'pdf'] as const;
type Section = typeof VALID_SECTIONS[number];

function isDupFieldError(e: unknown): boolean {
  const msg = String((e as Error)?.message ?? e);
  return (
    msg.includes('ER_DUP_FIELDNAME') ||
    msg.includes('Duplicate column name') ||
    (e as { errno?: number })?.errno === 1060 ||
    (e as { cause?: { errno?: number } })?.cause?.errno === 1060
  );
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

    const col = `${section}_json`;
    const jsonStr = JSON.stringify(data ?? {});
    const companyId = profile.companyId;

    console.log(`[PUT company-settings] user=${session.user.id} company=${companyId} section=${section}`);

    // ── Step 1: ensure column exists ─────────────────────────────────────────
    try {
      await db.execute(sql.raw(`ALTER TABLE \`company_settings\` ADD COLUMN \`${col}\` LONGTEXT NOT NULL DEFAULT '{}'`));
      console.log(`[PUT company-settings] Added column ${col}`);
    } catch (e: unknown) {
      if (!isDupFieldError(e)) {
        console.warn(`[PUT company-settings] ensureCol(${col}) unexpected:`, String((e as Error)?.message ?? e));
      }
      // Duplicate = already exists, fine
    }

    // ── Step 2: ensure row exists ─────────────────────────────────────────────
    // db.execute returns [rowsArray, fields] — destructure
    const [existRows] = await db.execute(
      sql`SELECT company_id FROM company_settings WHERE company_id = ${companyId} LIMIT 1`
    ) as unknown as [Array<{ company_id: number }>, unknown];

    console.log(`[PUT company-settings] existRows.length=${existRows?.length ?? 'null'}`);

    if (!existRows || existRows.length === 0) {
      console.log(`[PUT company-settings] No row yet — inserting for company=${companyId}`);
      await db.execute(sql`INSERT INTO company_settings (company_id) VALUES (${companyId})`);
    }

    // ── Step 3: update the target column ─────────────────────────────────────
    // Build fully-raw SQL — col is whitelisted above, jsonStr and companyId
    // are embedded as escaped literals to avoid Drizzle sql.raw/sql mixing issues.
    const escapedJson = jsonStr.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const updateQuery = `UPDATE company_settings SET \`${col}\` = '${escapedJson}', updated_at = NOW() WHERE company_id = ${Number(companyId)}`;
    console.log(`[PUT company-settings] Updating ${col} → ${jsonStr.slice(0, 120)}`);
    await db.execute(sql.raw(updateQuery));

    // Verify the write landed
    const [verifyRows] = await db.execute(
      sql`SELECT LEFT(${sql.raw(`\`${col}\``)}, 80) as preview FROM company_settings WHERE company_id = ${companyId} LIMIT 1`
    ) as unknown as [Array<Record<string, string>>, unknown];
    console.log(`[PUT company-settings] VERIFY read-back: ${JSON.stringify(verifyRows?.[0])}`);

    console.log(`[PUT company-settings] SUCCESS section=${section} company=${companyId}`);
    res.json({ ok: true });
  } catch (error) {
    const msg = String((error as Error)?.message ?? error);
    console.error(`[PUT company-settings] FAILED: ${msg}`, error);
    res.status(500).json({ error: 'Failed to save settings', detail: msg });
  }
}
