/**
 * POST /api/migrate-sms-verified-at
 * Owner-only. Adds the missing `verified_at` column to sms_verification_codes.
 *
 * The original migrate-account-recovery used CREATE TABLE IF NOT EXISTS, so if
 * the table was created before verified_at was added to the schema, the column
 * is absent and every SMS send fails with ER_BAD_FIELD_ERROR.
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';
import { profiles } from '../../db/schema.js';
import { eq } from 'drizzle-orm';

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
    if (profile?.role !== 'owner' && !profile?.permAdmin) {
      return res.status(403).json({ error: 'Owner access required' });
    }
  } catch {
    return res.status(401).json({ error: 'Auth check failed' });
  }

  const results: string[] = [];

  async function run(label: string, query: string) {
    try {
      await db.execute(sql.raw(query));
      results.push(`✓ ${label}`);
    } catch (e: unknown) {
      const msg = String(e);
      if (
        msg.includes('Duplicate column') ||
        msg.includes('already exists') ||
        msg.includes('ER_DUP_FIELDNAME')
      ) {
        results.push(`— ${label} (already exists)`);
      } else {
        results.push(`✗ ${label}: ${msg}`);
      }
    }
  }

  await run(
    'Add verified_at to sms_verification_codes',
    `ALTER TABLE sms_verification_codes ADD COLUMN verified_at TIMESTAMP NULL DEFAULT NULL AFTER attempts`,
  );

  res.json({ ok: true, results });
}
