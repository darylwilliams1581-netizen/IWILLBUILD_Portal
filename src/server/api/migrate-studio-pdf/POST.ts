/**
 * POST /api/migrate-studio-pdf
 * Idempotent — adds pdf_settings_json column to document_templates.
 * Safe to run multiple times.
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(_req: Request, res: Response) {
  const results: string[] = [];

  async function run(name: string, ddl: string) {
    try {
      await db.execute(sql.raw(ddl));
      results.push(`✓ ${name}`);
    } catch (e: unknown) {
      const msg = String((e as Error)?.message ?? e);
      if (
        msg.includes('Duplicate column name') ||
        msg.includes('ER_DUP_FIELDNAME') ||
        msg.includes('already exists')
      ) {
        results.push(`~ ${name} (already exists)`);
      } else {
        results.push(`✗ ${name}: ${msg}`);
      }
    }
  }

  await run('document_templates.pdf_settings_json', `
    ALTER TABLE document_templates
    ADD COLUMN pdf_settings_json LONGTEXT NULL
  `);

  const failed = results.filter(r => r.startsWith('✗'));
  return res.status(failed.length ? 500 : 200).json({ results, ok: failed.length === 0 });
}
