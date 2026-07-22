/**
 * GET /api/forms/skip-audit?templateId=&submissionId=
 * Returns skip audit entries for analytics.
 * Also returns aggregated skip metrics per source field.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';

interface SkipAuditRow {
  id: number;
  submission_id: number;
  template_id: number;
  job_id: number | null;
  user_id: number | null;
  rule_id: string;
  source_field_id: number;
  source_field_label: string;
  trigger_value: string;
  target_type: string;
  target_field_id: number | null;
  target_field_label: string | null;
  triggered_at: string;
}

interface SkipMetric {
  sourceFieldId: number;
  sourceFieldLabel: string;
  totalSkips: number;
  topTriggerValues: Array<{ value: string; count: number }>;
}

export default async function handler(req: Request, res: Response) {
  try {
    // Ensure table exists (idempotent DDL)
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS form_skip_audit_log (
        id                 INT AUTO_INCREMENT PRIMARY KEY,
        submission_id      INT         NOT NULL,
        template_id        INT         NOT NULL,
        job_id             INT,
        user_id            INT,
        rule_id            VARCHAR(255) NOT NULL,
        source_field_id    INT         NOT NULL,
        source_field_label VARCHAR(255) NOT NULL DEFAULT '',
        trigger_value      VARCHAR(255) NOT NULL DEFAULT '',
        target_type        VARCHAR(50)  NOT NULL DEFAULT 'field',
        target_field_id    INT,
        target_field_label VARCHAR(255),
        triggered_at       DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `));

    const templateId  = req.query.templateId  ? Number(req.query.templateId)  : null;
    const submissionId = req.query.submissionId ? Number(req.query.submissionId) : null;

    // Build WHERE clause
    const conditions: string[] = [];
    if (templateId)   conditions.push(`template_id = ${templateId}`);
    if (submissionId) conditions.push(`submission_id = ${submissionId}`);
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows] = await db.execute(sql.raw(
      `SELECT * FROM form_skip_audit_log ${where} ORDER BY triggered_at DESC LIMIT 500`
    )) as unknown as [SkipAuditRow[], unknown];

    const safeRows: SkipAuditRow[] = Array.isArray(rows) ? rows : [];

    // Build metrics: total skips per source field + top trigger values
    const metricsMap = new Map<number, {
      label: string;
      total: number;
      valueCounts: Map<string, number>;
    }>();

    for (const row of safeRows) {
      const existing = metricsMap.get(row.source_field_id);
      if (!existing) {
        metricsMap.set(row.source_field_id, {
          label: row.source_field_label,
          total: 1,
          valueCounts: new Map([[row.trigger_value, 1]]),
        });
      } else {
        existing.total++;
        existing.valueCounts.set(
          row.trigger_value,
          (existing.valueCounts.get(row.trigger_value) ?? 0) + 1,
        );
      }
    }

    const metrics: SkipMetric[] = Array.from(metricsMap.entries()).map(([fieldId, data]) => ({
      sourceFieldId: fieldId,
      sourceFieldLabel: data.label,
      totalSkips: data.total,
      topTriggerValues: Array.from(data.valueCounts.entries())
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
    }));

    res.json({ entries: safeRows, metrics });
  } catch (err) {
    console.error('[skip-audit GET]', err);
    res.status(500).json({ error: 'Failed to fetch skip audit data' });
  }
}
