/**
 * POST /api/jobs/report/generate
 * Fetches all job data for the selected sections, builds a DocumentBuilder
 * builder_json block array, creates a document_template of type 'job_report',
 * and returns the new template id so the client can redirect to the builder.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';

// ── tiny id helper (no uuid dep needed) ──────────────────────────────────────
function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ── block factories ───────────────────────────────────────────────────────────

function heading(content: string, level: 1 | 2 | 3 = 2) {
  return { id: uid(), type: 'heading', content, level, align: 'left' };
}

function divider() {
  return { id: uid(), type: 'divider', style: 'solid', color: '#e2e8f0', thickness: 1 };
}

function spacer(height = 12) {
  return { id: uid(), type: 'spacer', height };
}

function textBlock(content: string) {
  return { id: uid(), type: 'text', content, align: 'left', fontSize: 'sm' };
}

function richText(html: string) {
  return { id: uid(), type: 'rich_text', html };
}

function staticTable(columns: { id: string; header: string }[], rows: { id: string; cells: Record<string, string> }[]) {
  return {
    id: uid(),
    type: 'table',
    mode: 'static',
    columns: columns.map(c => ({ ...c, cellType: 'text', width: 1 })),
    rows,
    stripedRows: true,
    headerBgColor: '#1e293b',
    headerTextColor: '#ffffff',
  };
}

function colId(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9]/g, '_');
}

function makeRow(cols: string[], values: string[]) {
  const cells: Record<string, string> = {};
  cols.forEach((c, i) => { cells[colId(c)] = values[i] ?? '—'; });
  return { id: uid(), cells };
}

// ── date helpers ──────────────────────────────────────────────────────────────

function fmtDate(d: unknown): string {
  if (!d) return '—';
  const s = String(d);
  if (!s || s === 'null') return '—';
  try {
    return new Date(s).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return s; }
}

// ── main handler ──────────────────────────────────────────────────────────────

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

    const body = req.body as {
      jobId: number;
      sections: {
        jobInfo?: boolean;
        progress?: boolean;
        delays?: boolean;
        incidents?: boolean;
        variations?: boolean;
        notes?: boolean;
        photosLink?: boolean;
      };
      notesOverride?: string;
    };

    const { jobId, sections = {}, notesOverride } = body;
    if (!jobId || isNaN(Number(jobId))) return res.status(400).json({ error: 'jobId is required' });

    const companyId = profile.companyId;

    // ── 1. Fetch job ──────────────────────────────────────────────────────────
    const [jobRows] = await db.execute(
      sql`SELECT id, job_number, name, client, address, status, notes,
               scheduled_start_date, expected_completion_date,
               actual_start_date, actual_completion_date,
               assigned_team_label
          FROM jobs
          WHERE id = ${jobId} AND company_id = ${companyId}
          LIMIT 1`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    if (!jobRows?.length) return res.status(404).json({ error: 'Job not found' });
    const job = jobRows[0];

    // ── 2. Parallel data fetches ──────────────────────────────────────────────
    const [progressRows, delayRows, incidentRows, estimateRows] = await Promise.all([
      sections.progress
        ? db.execute(sql`SELECT description, quantity, unit, rate, percent_complete, progress_note
                         FROM job_progress_lines
                         WHERE job_id = ${jobId} AND company_id = ${companyId}
                         ORDER BY id ASC`)
            .then(([r]) => (r as Array<Record<string, unknown>>) ?? [])
        : Promise.resolve([]),

      sections.delays
        ? db.execute(sql`SELECT delay_date, reason, days, notes, created_by_name
                         FROM job_delays
                         WHERE job_id = ${jobId} AND company_id = ${companyId}
                         ORDER BY delay_date DESC`)
            .then(([r]) => (r as Array<Record<string, unknown>>) ?? [])
        : Promise.resolve([]),

      sections.incidents
        ? db.execute(sql`SELECT incident_date, incident_type, severity, status, description, location
                         FROM incidents
                         WHERE job_id = ${jobId} AND company_id = ${companyId}
                         ORDER BY incident_date DESC`)
            .then(([r]) => (r as Array<Record<string, unknown>>) ?? [])
        : Promise.resolve([]),

      sections.variations
        ? db.execute(sql`SELECT e.title, e.status, e.notes,
                                COALESCE(SUM(el.quantity * el.rate), 0) AS total
                         FROM estimates e
                         LEFT JOIN estimate_lines el ON el.estimate_id = e.id
                         WHERE e.job_id = ${jobId} AND e.company_id = ${companyId}
                         GROUP BY e.id
                         ORDER BY e.created_at DESC`)
            .then(([r]) => (r as Array<Record<string, unknown>>) ?? [])
        : Promise.resolve([]),
    ]);

    // ── 3. Build blocks ───────────────────────────────────────────────────────
    const blocks: unknown[] = [];

    // Report title
    const jobLabel = job.job_number ? `Job #${String(job.job_number)} — ${String(job.name)}` : String(job.name);
    blocks.push(heading(`Job Report: ${jobLabel}`, 1));
    blocks.push(textBlock(`Generated ${new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}`));
    blocks.push(spacer(8));
    blocks.push(divider());
    blocks.push(spacer(8));

    // ── Job Info ──────────────────────────────────────────────────────────────
    if (sections.jobInfo !== false) {
      blocks.push(heading('Job Information'));
      const infoRows = [
        ['Job Number', String(job.job_number ?? '—')],
        ['Job Name', String(job.name ?? '—')],
        ['Client', String(job.client ?? '—')],
        ['Address', String(job.address ?? '—')],
        ['Status', String(job.status ?? '—')],
        ['Scheduled Start', fmtDate(job.scheduled_start_date)],
        ['Expected Completion', fmtDate(job.expected_completion_date)],
        ['Actual Start', fmtDate(job.actual_start_date)],
        ['Actual Completion', fmtDate(job.actual_completion_date)],
        ['Team', String(job.assigned_team_label ?? '—')],
      ];
      const infoCols = ['Field', 'Value'];
      blocks.push(staticTable(
        infoCols.map(h => ({ id: colId(h), header: h })),
        infoRows.map(([f, v]) => makeRow(infoCols, [f, v]))
      ));
      blocks.push(spacer(16));
    }

    // ── Progress ──────────────────────────────────────────────────────────────
    if (sections.progress) {
      blocks.push(heading('Progress Summary'));
      if ((progressRows as Array<Record<string, unknown>>).length === 0) {
        blocks.push(textBlock('No progress lines recorded for this job.'));
      } else {
        const pCols = ['Description', 'Qty', 'Unit', '% Complete', 'Note'];
        blocks.push(staticTable(
          pCols.map(h => ({ id: colId(h), header: h })),
          (progressRows as Array<Record<string, unknown>>).map(p =>
            makeRow(pCols, [
              String(p.description ?? ''),
              String(p.quantity ?? '1'),
              String(p.unit ?? ''),
              `${String(p.percent_complete ?? 0)}%`,
              String(p.progress_note ?? ''),
            ])
          )
        ));
      }
      blocks.push(spacer(16));
    }

    // ── Delays ────────────────────────────────────────────────────────────────
    if (sections.delays) {
      blocks.push(heading('Delays'));
      if ((delayRows as Array<Record<string, unknown>>).length === 0) {
        blocks.push(textBlock('No delays recorded for this job.'));
      } else {
        const dCols = ['Date', 'Reason', 'Days', 'Notes', 'Recorded By'];
        blocks.push(staticTable(
          dCols.map(h => ({ id: colId(h), header: h })),
          (delayRows as Array<Record<string, unknown>>).map(d =>
            makeRow(dCols, [
              fmtDate(d.delay_date),
              String(d.reason ?? ''),
              String(d.days ?? '0'),
              String(d.notes ?? ''),
              String(d.created_by_name ?? ''),
            ])
          )
        ));
        const totalDays = (delayRows as Array<Record<string, unknown>>)
          .reduce((s, d) => s + parseFloat(String(d.days ?? 0)), 0);
        blocks.push(textBlock(`Total delay: ${Math.round(totalDays * 100) / 100} day(s)`));
      }
      blocks.push(spacer(16));
    }

    // ── Incidents ─────────────────────────────────────────────────────────────
    if (sections.incidents) {
      blocks.push(heading('Incidents'));
      if ((incidentRows as Array<Record<string, unknown>>).length === 0) {
        blocks.push(textBlock('No incidents recorded for this job.'));
      } else {
        const iCols = ['Date', 'Type', 'Severity', 'Status', 'Location', 'Description'];
        blocks.push(staticTable(
          iCols.map(h => ({ id: colId(h), header: h })),
          (incidentRows as Array<Record<string, unknown>>).map(i =>
            makeRow(iCols, [
              fmtDate(i.incident_date),
              String(i.incident_type ?? ''),
              String(i.severity ?? ''),
              String(i.status ?? ''),
              String(i.location ?? ''),
              String(i.description ?? ''),
            ])
          )
        ));
      }
      blocks.push(spacer(16));
    }

    // ── Variations / Quotes ───────────────────────────────────────────────────
    if (sections.variations) {
      blocks.push(heading('Variations & Quotes'));
      if ((estimateRows as Array<Record<string, unknown>>).length === 0) {
        blocks.push(textBlock('No estimates or variations recorded for this job.'));
      } else {
        const vCols = ['Title', 'Status', 'Total (ex GST)', 'Notes'];
        blocks.push(staticTable(
          vCols.map(h => ({ id: colId(h), header: h })),
          (estimateRows as Array<Record<string, unknown>>).map(e =>
            makeRow(vCols, [
              String(e.title ?? ''),
              String(e.status ?? ''),
              `$${parseFloat(String(e.total ?? 0)).toFixed(2)}`,
              String(e.notes ?? ''),
            ])
          )
        ));
      }
      blocks.push(spacer(16));
    }

    // ── Notes ─────────────────────────────────────────────────────────────────
    if (sections.notes) {
      blocks.push(heading('Notes'));
      const notesContent = notesOverride?.trim() || String(job.notes ?? '');
      blocks.push(richText(
        notesContent
          ? `<p>${notesContent.replace(/\n/g, '</p><p>')}</p>`
          : '<p><em>No notes recorded.</em></p>'
      ));
      blocks.push(spacer(16));
    }

    // ── Site Photos Link ──────────────────────────────────────────────────────
    if (sections.photosLink) {
      blocks.push(heading('Site Photos'));
      blocks.push(richText(
        `<p>View all site photos for this job in the <strong>Camera / Photos</strong> section of the app.</p>`
      ));
      blocks.push(spacer(16));
    }

    // ── 4. Create document template ───────────────────────────────────────────
    const builderJson = JSON.stringify({ blocks, systemFields: [], sourceAttachments: [] });
    const reportName = `Job Report — ${jobLabel}`;

    const [result] = await db.execute(
      sql`INSERT INTO document_templates
            (company_id, name, template_type, builder_json, page_layout_json, theme_json,
             is_active, created_by_user_id)
          VALUES
            (${companyId}, ${reportName}, ${'job_report'}, ${builderJson}, ${'{}'},  ${'{}'},
             ${1}, ${session.user.id})`
    ) as unknown as [{ insertId?: number | bigint }, unknown];

    const insertId = Number((result as { insertId?: number | bigint }).insertId ?? 0);
    if (!insertId) return res.status(500).json({ error: 'Failed to create report document' });

    return res.status(201).json({ id: insertId, name: reportName });
  } catch (err) {
    console.error('POST /api/jobs/report/generate error:', err);
    return res.status(500).json({ error: 'Failed to generate report' });
  }
}
