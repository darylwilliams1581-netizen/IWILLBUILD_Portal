/**
 * POST /api/migrate-library-downloads
 * Platform owner only.
 *
 * Adds file_path and file_mime columns to library_items so uploaded
 * documents can be stored and downloaded by users.
 *
 * Idempotent — safe to run multiple times.
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../lib/auth-middleware.js';

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  const [ownerCheck] = await db.execute(sql.raw(
    `SELECT role FROM profiles WHERE user_id = '${auth.session.user.id}' LIMIT 1`
  )) as unknown as [Array<{ role: string }>, unknown];
  if (ownerCheck?.[0]?.role !== 'platform_owner') {
    return res.status(403).json({ error: 'Platform owner access required' });
  }

  const results: string[] = [];

  async function tryExec(label: string, query: string) {
    try {
      await db.execute(sql.raw(query));
      results.push(`✅ ${label}`);
    } catch (err) {
      const msg = String(err);
      if (msg.includes('Duplicate') || msg.includes('already exists') || msg.includes("Column 'file_path' already exists")) {
        results.push(`⚠️  ${label}: already exists`);
      } else {
        results.push(`❌ ${label}: ${msg.slice(0, 200)}`);
      }
    }
  }

  await tryExec('Add file_path to library_items', `
    ALTER TABLE library_items ADD COLUMN file_path VARCHAR(1000) NULL
  `);

  await tryExec('Add file_mime to library_items', `
    ALTER TABLE library_items ADD COLUMN file_mime VARCHAR(100) NULL
  `);

  const ok = results.every((r) => !r.startsWith('❌'));
  return res.json({ ok, results });
}
