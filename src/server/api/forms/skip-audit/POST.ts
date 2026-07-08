/**
 * POST /api/forms/skip-audit
 * Record a skip logic audit entry.
 * Called by FormRunner when a skip rule fires.
 */
import type { Request, Response } from 'express';
import { getDb } from '@/server/db/config.js';
import type { SkipAuditEntry } from '@/lib/skip-logic-types.js';

export default async function handler(req: Request, res: Response) {
  try {
    const entry = req.body as Partial<SkipAuditEntry>;

    // Basic validation
    if (
      typeof entry.submissionId !== 'number' ||
      typeof entry.templateId !== 'number' ||
      typeof entry.ruleId !== 'string' ||
      typeof entry.sourceFieldId !== 'number'
    ) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const db = getDb();

    // Ensure table exists (idempotent guard)
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

    await db.run(
      `INSERT INTO form_skip_audit_log
         (submission_id, template_id, job_id, user_id, rule_id,
          source_field_id, source_field_label, trigger_value,
          target_type, target_field_id, target_field_label, triggered_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.submissionId,
        entry.templateId,
        entry.jobId ?? null,
        entry.userId ?? null,
        entry.ruleId,
        entry.sourceFieldId,
        entry.sourceFieldLabel ?? '',
        entry.triggerValue ?? '',
        entry.targetType ?? 'field',
        entry.targetFieldId ?? null,
        entry.targetFieldLabel ?? null,
        entry.triggeredAt ?? new Date().toISOString(),
      ],
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('[skip-audit POST]', err);
    res.status(500).json({ error: 'Failed to record skip audit entry' });
  }
}
