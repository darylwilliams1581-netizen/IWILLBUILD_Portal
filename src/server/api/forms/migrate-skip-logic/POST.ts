/**
 * POST /api/forms/migrate-skip-logic
 * Idempotent migration — creates form_skip_audit_log if it doesn't exist.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(_req: Request, res: Response) {
  try {
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS form_skip_audit_log (
        id               INT AUTO_INCREMENT PRIMARY KEY,
        submission_id    INT          NOT NULL,
        template_id      INT          NOT NULL,
        job_id           INT,
        user_id          INT,
        rule_id          VARCHAR(255) NOT NULL,
        source_field_id  INT          NOT NULL,
        source_field_label VARCHAR(255) NOT NULL DEFAULT '',
        trigger_value    TEXT         NOT NULL,
        target_type      VARCHAR(50)  NOT NULL DEFAULT 'field',
        target_field_id  INT,
        target_field_label VARCHAR(255),
        triggered_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `));

    await db.execute(sql.raw(`
      CREATE INDEX IF NOT EXISTS idx_skip_audit_submission
        ON form_skip_audit_log(submission_id)
    `)).catch(() => {/* index may already exist */});

    await db.execute(sql.raw(`
      CREATE INDEX IF NOT EXISTS idx_skip_audit_template
        ON form_skip_audit_log(template_id)
    `)).catch(() => {/* index may already exist */});

    res.json({ ok: true, message: 'form_skip_audit_log migration complete' });
  } catch (err) {
    console.error('[migrate-skip-logic]', err);
    res.status(500).json({ error: 'Migration failed', detail: String(err) });
  }
}
