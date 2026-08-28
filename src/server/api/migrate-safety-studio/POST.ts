/**
 * POST /api/migrate-safety-studio
 * Idempotent migration: adds source_widget_type, source_record_id, safety_category
 * columns to document_templates if they don't already exist.
 * Platform-owner only.
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';
import { profiles } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getSecret } from '#airo/secrets';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const [profile] = await db.select().from(profiles).where(eq(profiles.userId, session.user.id)).limit(1);
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const ownerEmail = getSecret('PLATFORM_OWNER_EMAIL');
    if (session.user.email !== ownerEmail) return res.status(403).json({ error: 'Platform owner only' });

    const results: string[] = [];

    const cols = [
      { name: 'source_widget_type', ddl: "VARCHAR(50) NULL DEFAULT NULL COMMENT 'swms | whs_plan'" },
      { name: 'source_record_id',   ddl: 'INT NULL DEFAULT NULL' },
      { name: 'safety_category',    ddl: "VARCHAR(100) NULL DEFAULT NULL COMMENT 'SWMS | WHS Plan'" },
    ];

    for (const col of cols) {
      try {
        await db.execute(sql.raw(`ALTER TABLE document_templates ADD COLUMN ${col.name} ${col.ddl}`));
        results.push(`Added ${col.name}`);
      } catch (e: unknown) {
        const msg = String((e as { message?: string }).message ?? e);
        if (msg.includes('Duplicate column') || msg.includes('already exists')) {
          results.push(`${col.name} already exists — skipped`);
        } else {
          throw e;
        }
      }
    }

    return res.json({ ok: true, results });
  } catch (err) {
    console.error('POST /api/migrate-safety-studio error:', err);
    return res.status(500).json({ error: String(err) });
  }
}
