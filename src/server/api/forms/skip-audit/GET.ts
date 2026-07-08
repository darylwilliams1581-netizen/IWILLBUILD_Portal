/**
 * GET /api/forms/skip-audit?templateId=&submissionId=
 * Returns skip audit entries for analytics.
 * Also returns aggregated skip metrics per source field.
 */
import type { Request, Response } from 'express';
import { getDb } from '@/server/db/config.js';

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
    const db = getDb();

    // Ensure table exists
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

    const templateId = req.query.templateId ? Number(req.query.templateId) : null;
    const submissionId = req.query.submissionId ? Number(req.query.submissionId) : null;

    // Build query
    const conditions: string[] = [];
    const params: (number | null)[] = [];

    if (templateId) { conditions.push('template_id = ?'); params.push(templateId); }
    if (submissionId) { conditions.push('submission_id = ?'); params.push(submissionId); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = await db.all<SkipAuditRow[]>(
      `SELECT * FROM form_skip_audit_log ${where} ORDER BY triggered_at DESC LIMIT 500`,
      params,
    );

    // Build metrics: total skips per source field + top trigger values
    const metricsMap = new Map<number, {
      label: string;
      total: number;
      valueCounts: Map<string, number>;
    }>();

    for (const row of rows) {
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

    res.json({ entries: rows, metrics });
  } catch (err) {
    console.error('[skip-audit GET]', err);
    res.status(500).json({ error: 'Failed to fetch skip audit data' });
  }
}
