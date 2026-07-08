/**
 * POST /api/forms/migrate-skip-logic
 * Idempotent migration — creates form_skip_audit_log if it doesn't exist.
 */
import type { Request, Response } from 'express';
import { getDb } from '@/server/db/config.js';

export default async function handler(_req: Request, res: Response) {
  try {
    const db = getDb();

    await db.run(`
      CREATE TABLE IF NOT EXISTS form_skip_audit_log (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        submission_id    INTEGER NOT NULL,
        template_id      INTEGER NOT NULL,
        job_id           INTEGER,
        user_id          INTEGER,
        rule_id          TEXT    NOT NULL,
        source_field_id  INTEGER NOT NULL,
        source_field_label TEXT  NOT NULL DEFAULT '',
        trigger_value    TEXT    NOT NULL DEFAULT '',
        target_type      TEXT    NOT NULL DEFAULT 'field',
        target_field_id  INTEGER,
        target_field_label TEXT,
        triggered_at     TEXT    NOT NULL DEFAULT (datetime('now'))
      )
    `);

    await db.run(`
      CREATE INDEX IF NOT EXISTS idx_skip_audit_submission
        ON form_skip_audit_log(submission_id)
    `);

    await db.run(`
      CREATE INDEX IF NOT EXISTS idx_skip_audit_template
        ON form_skip_audit_log(template_id)
    `);

    res.json({ ok: true, message: 'form_skip_audit_log migration complete' });
  } catch (err) {
    console.error('[migrate-skip-logic]', err);
    res.status(500).json({ error: 'Migration failed', detail: String(err) });
  }
}
