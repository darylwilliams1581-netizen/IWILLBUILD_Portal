/**
 * POST /api/forms/skip-audit
 * Record a skip logic audit entry.
 * Called by FormRunner when a skip rule fires.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
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

    // Ensure table exists (idempotent guard — MySQL syntax)
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS form_skip_audit_log (
        id                 INT AUTO_INCREMENT PRIMARY KEY,
        submission_id      INT          NOT NULL,
        template_id        INT          NOT NULL,
        job_id             INT,
        user_id            INT,
        rule_id            VARCHAR(255) NOT NULL,
        source_field_id    INT          NOT NULL,
        source_field_label VARCHAR(255) NOT NULL DEFAULT '',
        trigger_value      TEXT         NOT NULL,
        target_type        VARCHAR(50)  NOT NULL DEFAULT 'field',
        target_field_id    INT,
        target_field_label VARCHAR(255),
        triggered_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)).catch(() => {/* table already exists */});

    const triggeredAt = entry.triggeredAt
      ? new Date(entry.triggeredAt).toISOString().slice(0, 19).replace('T', ' ')
      : new Date().toISOString().slice(0, 19).replace('T', ' ');

    await db.execute(sql.raw(
      `INSERT INTO form_skip_audit_log
         (submission_id, template_id, job_id, user_id, rule_id,
          source_field_id, source_field_label, trigger_value,
          target_type, target_field_id, target_field_label, triggered_at)
       VALUES (
         ${entry.submissionId},
         ${entry.templateId},
         ${entry.jobId ?? 'NULL'},
         ${entry.userId ?? 'NULL'},
         ${JSON.stringify(entry.ruleId)},
         ${entry.sourceFieldId},
         ${JSON.stringify(entry.sourceFieldLabel ?? '')},
         ${JSON.stringify(entry.triggerValue ?? '')},
         ${JSON.stringify(entry.targetType ?? 'field')},
         ${entry.targetFieldId ?? 'NULL'},
         ${entry.targetFieldLabel ? JSON.stringify(entry.targetFieldLabel) : 'NULL'},
         ${JSON.stringify(triggeredAt)}
       )`
    ));

    res.json({ ok: true });
  } catch (err) {
    console.error('[skip-audit POST]', err);
    res.status(500).json({ error: 'Failed to record skip audit entry' });
  }
}
