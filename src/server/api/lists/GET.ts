/**
 * GET /api/lists/:listType
 *
 * Unified Lists API — returns paginated, filterable, sortable records for
 * the office Lists view. Supports CSV export via ?format=csv.
 *
 * listType values:
 *   Core: jobs | tasks | notes | incidents | attendance | costs | driver-logs
 *         invoices | estimates | purchase-orders | customers | time-entries
 *         fleet-assets | swms | form-submissions | files | team-shifts
 *   Wave2: drawings | job-delays | guest-checkins | fleet-prestarts
 *          fleet-service-logs | site-prestarts | swms-signoffs | milestones
 *          asset-bookings
 *
 * Common query params:
 *   q          — full-text search string
 *   dateFrom   — YYYY-MM-DD
 *   dateTo     — YYYY-MM-DD
 *   status     — filter by status field (where applicable)
 *   jobId      — filter by job (where applicable)
 *   page       — 1-based page number (default 1)
 *   pageSize   — rows per page (default 50, max 200)
 *   sortBy     — column name to sort by
 *   sortDir    — asc | desc (default desc)
 *   format     — json (default) | csv
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../lib/auth-middleware.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(v: string): string {
  return v.replace(/'/g, "''").replace(/\\/g, '\\\\');
}

function safeInt(v: unknown, fallback: number): number {
  const n = parseInt(String(v ?? ''), 10);
  return isNaN(n) ? fallback : n;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

function csvRow(cells: (string | number | null | undefined)[]): string {
  return cells
    .map((c) => {
      const s = c == null ? '' : String(c);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    })
    .join(',');
}

function sendCsv(res: Response, filename: string, headers: string[], rows: (string | number | null | undefined)[][]): void {
  const lines = [csvRow(headers), ...rows.map(csvRow)].join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('\uFEFF' + lines); // BOM for Excel
}

// ── List handlers ─────────────────────────────────────────────────────────────

async function listJobs(companyId: number, params: Record<string, string>) {
  const { q, dateFrom, dateTo, status, page, pageSize, sortBy, sortDir } = params;
  const ps = clamp(safeInt(pageSize, 50), 1, 200);
  const pg = clamp(safeInt(page, 1), 1, 9999);
  const offset = (pg - 1) * ps;

  const allowed = new Set(['job_number', 'name', 'status', 'start_date', 'expected_completion', 'created_at']);
  const col = allowed.has(sortBy) ? sortBy : 'created_at';
  const dir = sortDir === 'asc' ? 'ASC' : 'DESC';

  const wheres: string[] = [`j.company_id = ${companyId}`];
  if (status) wheres.push(`j.status = '${esc(status)}'`);
  if (dateFrom) wheres.push(`j.start_date >= '${esc(dateFrom)}'`);
  if (dateTo) wheres.push(`j.start_date <= '${esc(dateTo)}'`);
  if (q) {
    const s = esc(q);
    wheres.push(`(j.name LIKE '%${s}%' OR j.job_number LIKE '%${s}%' OR j.site_address LIKE '%${s}%' OR c.name LIKE '%${s}%')`);
  }
  const where = wheres.join(' AND ');

  const [rows] = await db.execute(sql.raw(`
    SELECT
      j.id,
      j.job_number,
      j.name,
      c.name AS customer_name,
      j.site_address,
      j.status,
      j.start_date,
      j.expected_completion,
      j.supervisor_name,
      j.progress_percent,
      j.created_at
    FROM jobs j
    LEFT JOIN customers c ON c.id = j.customer_id
    WHERE ${where}
    ORDER BY j.${col} ${dir}
    LIMIT ${ps} OFFSET ${offset}
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  const [countRows] = await db.execute(sql.raw(`
    SELECT COUNT(*) AS total
    FROM jobs j
    LEFT JOIN customers c ON c.id = j.customer_id
    WHERE ${where}
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  return { rows: rows ?? [], total: safeInt(countRows?.[0]?.total, 0) };
}

async function listTasks(companyId: number, params: Record<string, string>) {
  const { q, dateFrom, dateTo, status, jobId, page, pageSize, sortBy, sortDir } = params;
  const ps = clamp(safeInt(pageSize, 50), 1, 200);
  const pg = clamp(safeInt(page, 1), 1, 9999);
  const offset = (pg - 1) * ps;

  const allowed = new Set(['title', 'status', 'start_date', 'due_date', 'assigned_name', 'created_at']);
  const col = allowed.has(sortBy) ? sortBy : 'created_at';
  const dir = sortDir === 'asc' ? 'ASC' : 'DESC';

  const wheres: string[] = [`t.company_id = ${companyId}`];
  if (status) wheres.push(`t.status = '${esc(status)}'`);
  if (jobId) wheres.push(`t.job_id = ${safeInt(jobId, 0)}`);
  if (dateFrom) wheres.push(`t.due_date >= '${esc(dateFrom)}'`);
  if (dateTo) wheres.push(`t.due_date <= '${esc(dateTo)}'`);
  if (q) {
    const s = esc(q);
    wheres.push(`(t.title LIKE '%${s}%' OR t.assigned_name LIKE '%${s}%' OR j.name LIKE '%${s}%')`);
  }
  const where = wheres.join(' AND ');

  const [rows] = await db.execute(sql.raw(`
    SELECT
      t.id,
      t.title,
      t.description,
      j.name AS job_name,
      j.job_number,
      t.assigned_name,
      t.status,
      t.start_date,
      t.due_date,
      t.notes,
      t.created_at
    FROM job_todos t
    LEFT JOIN jobs j ON j.id = t.job_id
    WHERE ${where}
    ORDER BY t.${col} ${dir}
    LIMIT ${ps} OFFSET ${offset}
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  const [countRows] = await db.execute(sql.raw(`
    SELECT COUNT(*) AS total
    FROM job_todos t
    LEFT JOIN jobs j ON j.id = t.job_id
    WHERE ${where}
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  return { rows: rows ?? [], total: safeInt(countRows?.[0]?.total, 0) };
}

async function listNotes(companyId: number, params: Record<string, string>) {
  const { q, dateFrom, dateTo, jobId, page, pageSize, sortBy, sortDir } = params;
  const ps = clamp(safeInt(pageSize, 50), 1, 200);
  const pg = clamp(safeInt(page, 1), 1, 9999);
  const offset = (pg - 1) * ps;

  const allowed = new Set(['body', 'author_name', 'created_at', 'entity_label']);
  const col = allowed.has(sortBy) ? sortBy : 'created_at';
  const dir = sortDir === 'asc' ? 'ASC' : 'DESC';

  const wheres: string[] = [`n.company_id = ${companyId}`, `n.entity_type = 'job'`];
  if (jobId) wheres.push(`n.entity_id = ${safeInt(jobId, 0)}`);
  if (dateFrom) wheres.push(`DATE(n.created_at) >= '${esc(dateFrom)}'`);
  if (dateTo) wheres.push(`DATE(n.created_at) <= '${esc(dateTo)}'`);
  if (q) {
    const s = esc(q);
    wheres.push(`(n.body LIKE '%${s}%' OR n.author_name LIKE '%${s}%' OR n.entity_label LIKE '%${s}%')`);
  }
  const where = wheres.join(' AND ');

  const [rows] = await db.execute(sql.raw(`
    SELECT
      n.id,
      n.body,
      n.entity_label AS job_name,
      n.entity_id AS job_id,
      n.author_name,
      n.note_type,
      n.created_at
    FROM entity_notes n
    WHERE ${where}
    ORDER BY n.${col} ${dir}
    LIMIT ${ps} OFFSET ${offset}
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  const [countRows] = await db.execute(sql.raw(`
    SELECT COUNT(*) AS total FROM entity_notes n WHERE ${where}
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  return { rows: rows ?? [], total: safeInt(countRows?.[0]?.total, 0) };
}

async function listIncidents(companyId: number, params: Record<string, string>) {
  const { q, dateFrom, dateTo, status, severity, page, pageSize, sortBy, sortDir } = params;
  const ps = clamp(safeInt(pageSize, 50), 1, 200);
  const pg = clamp(safeInt(page, 1), 1, 9999);
  const offset = (pg - 1) * ps;

  const allowed = new Set(['incident_number', 'incident_type', 'severity', 'status', 'incident_date', 'created_at']);
  const col = allowed.has(sortBy) ? sortBy : 'incident_date';
  const dir = sortDir === 'asc' ? 'ASC' : 'DESC';

  const wheres: string[] = [`i.company_id = ${companyId}`];
  if (status) wheres.push(`i.status = '${esc(status)}'`);
  if (severity) wheres.push(`i.severity = '${esc(severity)}'`);
  if (dateFrom) wheres.push(`i.incident_date >= '${esc(dateFrom)}'`);
  if (dateTo) wheres.push(`i.incident_date <= '${esc(dateTo)}'`);
  if (q) {
    const s = esc(q);
    wheres.push(`(i.incident_number LIKE '%${s}%' OR i.incident_type LIKE '%${s}%' OR i.description LIKE '%${s}%' OR i.reported_by_name LIKE '%${s}%')`);
  }
  const where = wheres.join(' AND ');

  const [rows] = await db.execute(sql.raw(`
    SELECT
      i.id,
      i.incident_number,
      j.name AS job_name,
      j.job_number,
      i.incident_type,
      i.severity,
      i.status,
      i.incident_date,
      i.reported_by_name,
      i.description,
      (SELECT COUNT(*) FROM incident_corrective_actions ca WHERE ca.incident_id = i.id) AS corrective_action_count,
      i.created_at
    FROM incidents i
    LEFT JOIN jobs j ON j.id = i.job_id
    WHERE ${where}
    ORDER BY i.${col} ${dir}
    LIMIT ${ps} OFFSET ${offset}
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  const [countRows] = await db.execute(sql.raw(`
    SELECT COUNT(*) AS total FROM incidents i WHERE ${where}
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  return { rows: rows ?? [], total: safeInt(countRows?.[0]?.total, 0) };
}

async function listAttendance(companyId: number, params: Record<string, string>) {
  const { q, dateFrom, dateTo, jobId, userId, page, pageSize, sortBy, sortDir } = params;
  const ps = clamp(safeInt(pageSize, 50), 1, 200);
  const pg = clamp(safeInt(page, 1), 1, 9999);
  const offset = (pg - 1) * ps;

  // Sort on the sign-in CTE columns
  const allowed = new Set(['user_name', 'job_name', 'signed_in_at', 'signed_out_at', 'duration_hours']);
  const col = allowed.has(sortBy) ? sortBy : 'signed_in_at';
  const dir = sortDir === 'asc' ? 'ASC' : 'DESC';

  // Build WHERE on the sign-in rows (action = 'sign_in')
  const wheres: string[] = [`si.company_id = ${companyId}`, `si.action = 'sign_in'`];
  if (jobId) wheres.push(`si.job_id = ${safeInt(jobId, 0)}`);
  if (userId) wheres.push(`si.user_id = '${esc(userId)}'`);  if (dateFrom) wheres.push(`DATE(si.created_at) >= '${esc(dateFrom)}'`);
  if (dateTo)   wheres.push(`DATE(si.created_at) <= '${esc(dateTo)}'`);
  if (q) {
    const s = esc(q);
    wheres.push(`(u.name LIKE '%${s}%' OR u.email LIKE '%${s}%' OR j.name LIKE '%${s}%' OR j.job_number LIKE '%${s}%')`);
  }
  const where = wheres.join(' AND ');

  // Each sign-in row is paired with the next sign-out for same user+job
  const [rows] = await db.execute(sql.raw(`
    SELECT
      si.id,
      u.name                                                        AS user_name,
      u.email                                                       AS user_email,
      j.name                                                        AS job_name,
      j.job_number,
      si.created_at                                                 AS signed_in_at,
      so.created_at                                                 AS signed_out_at,
      CASE
        WHEN so.created_at IS NOT NULL
        THEN ROUND(TIMESTAMPDIFF(MINUTE, si.created_at, so.created_at) / 60.0, 2)
        ELSE NULL
      END                                                           AS duration_hours,
      si.source,
      si.actor_type
    FROM job_attendance si
    LEFT JOIN users u ON u.id = si.user_id
    LEFT JOIN jobs  j ON j.id = si.job_id
    LEFT JOIN job_attendance so
      ON  so.job_id    = si.job_id
      AND so.user_id   = si.user_id
      AND so.action    = 'sign_out'
      AND so.created_at = (
        SELECT MIN(x.created_at)
        FROM job_attendance x
        WHERE x.job_id   = si.job_id
          AND x.user_id  = si.user_id
          AND x.action   = 'sign_out'
          AND x.created_at > si.created_at
      )
    WHERE ${where}
    ORDER BY ${col} ${dir}
    LIMIT ${ps} OFFSET ${offset}
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  const [countRows] = await db.execute(sql.raw(`
    SELECT COUNT(*) AS total
    FROM job_attendance si
    LEFT JOIN users u ON u.id = si.user_id
    LEFT JOIN jobs  j ON j.id = si.job_id
    WHERE ${where}
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  return { rows: rows ?? [], total: safeInt(countRows?.[0]?.total, 0) };
}

async function listCosts(companyId: number, params: Record<string, string>) {
  const { q, dateFrom, dateTo, jobId, page, pageSize, sortBy, sortDir } = params;
  const ps = clamp(safeInt(pageSize, 50), 1, 200);
  const pg = clamp(safeInt(page, 1), 1, 9999);
  const offset = (pg - 1) * ps;

  const allowed = new Set(['description', 'category', 'amount', 'purchase_date', 'created_at']);
  const col = allowed.has(sortBy) ? sortBy : 'purchase_date';
  const dir = sortDir === 'asc' ? 'ASC' : 'DESC';

  const wheres: string[] = [`jc.company_id = ${companyId}`];
  if (jobId) wheres.push(`jc.job_id = ${safeInt(jobId, 0)}`);
  if (dateFrom) wheres.push(`jc.purchase_date >= '${esc(dateFrom)}'`);
  if (dateTo) wheres.push(`jc.purchase_date <= '${esc(dateTo)}'`);
  if (q) {
    const s = esc(q);
    wheres.push(`(jc.description LIKE '%${s}%' OR jc.category LIKE '%${s}%' OR j.name LIKE '%${s}%' OR j.job_number LIKE '%${s}%')`);
  }
  const where = wheres.join(' AND ');

  const [rows] = await db.execute(sql.raw(`
    SELECT
      jc.id,
      j.name AS job_name,
      j.job_number,
      jc.description,
      jc.category,
      jc.amount,
      jc.gst_amount,
      jc.purchase_date,
      jc.supplier,
      jc.cost_type,
      jc.created_at
    FROM job_costs jc
    LEFT JOIN jobs j ON j.id = jc.job_id
    WHERE ${where}
    ORDER BY jc.${col} ${dir}
    LIMIT ${ps} OFFSET ${offset}
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  const [countRows] = await db.execute(sql.raw(`
    SELECT COUNT(*) AS total
    FROM job_costs jc
    LEFT JOIN jobs j ON j.id = jc.job_id
    WHERE ${where}
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  return { rows: rows ?? [], total: safeInt(countRows?.[0]?.total, 0) };
}

async function listDriverLogs(companyId: number, params: Record<string, string>) {
  const { q, dateFrom, dateTo, fleetId, page, pageSize, sortBy, sortDir } = params;
  const ps = clamp(safeInt(pageSize, 50), 1, 200);
  const pg = clamp(safeInt(page, 1), 1, 9999);
  const offset = (pg - 1) * ps;

  const allowed = new Set(['user_name', 'fleet_name', 'job_name', 'started_at', 'ended_at', 'duration_minutes', 'meter_start', 'meter_end']);
  const col = allowed.has(sortBy) ? sortBy : 'started_at';
  const dir = sortDir === 'asc' ? 'ASC' : 'DESC';

  const wheres: string[] = [`ful.company_id = ${companyId}`];
  if (fleetId) wheres.push(`ful.fleet_id = ${safeInt(fleetId, 0)}`);
  if (dateFrom) wheres.push(`DATE(ful.started_at) >= '${esc(dateFrom)}'`);
  if (dateTo)   wheres.push(`DATE(ful.started_at) <= '${esc(dateTo)}'`);
  if (q) {
    const s = esc(q);
    wheres.push(`(u.name LIKE '%${s}%' OR u.email LIKE '%${s}%' OR fa.name LIKE '%${s}%' OR j.name LIKE '%${s}%' OR ful.note LIKE '%${s}%')`);
  }
  const where = wheres.join(' AND ');

  const [rows] = await db.execute(sql.raw(`
    SELECT
      ful.id,
      u.name                AS user_name,
      u.email               AS user_email,
      ful.actor_type,
      fa.name               AS fleet_name,
      fa.registration       AS fleet_registration,
      j.name                AS job_name,
      j.job_number,
      ful.started_at,
      ful.ended_at,
      ful.duration_minutes,
      ful.meter_start,
      ful.meter_end,
      ful.note,
      ful.source
    FROM fleet_usage_logs ful
    LEFT JOIN users u         ON u.id  = ful.user_id
    LEFT JOIN fleet_assets fa ON fa.id = ful.fleet_id
    LEFT JOIN jobs j          ON j.id  = ful.job_id
    WHERE ${where}
    ORDER BY ful.${col} ${dir}
    LIMIT ${ps} OFFSET ${offset}
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  const [countRows] = await db.execute(sql.raw(`
    SELECT COUNT(*) AS total
    FROM fleet_usage_logs ful
    LEFT JOIN users u         ON u.id  = ful.user_id
    LEFT JOIN fleet_assets fa ON fa.id = ful.fleet_id
    LEFT JOIN jobs j          ON j.id  = ful.job_id
    WHERE ${where}
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  return { rows: rows ?? [], total: safeInt(countRows?.[0]?.total, 0) };
}

// ── Wave-2 list handlers ──────────────────────────────────────────────────────

async function listDrawings(companyId: number, params: Record<string, string>) {
  const { q, dateFrom, dateTo, jobId, status, page, pageSize, sortBy, sortDir } = params;
  const ps = clamp(safeInt(pageSize, 50), 1, 200);
  const pg = clamp(safeInt(page, 1), 1, 9999);
  const offset = (pg - 1) * ps;

  const allowed = new Set(['drawing_number', 'title', 'discipline', 'status', 'revision', 'created_at']);
  const col = allowed.has(sortBy) ? sortBy : 'created_at';
  const dir = sortDir === 'asc' ? 'ASC' : 'DESC';

  const wheres: string[] = [`dr.company_id = ${companyId}`];
  if (jobId)   wheres.push(`dr.job_id = ${safeInt(jobId, 0)}`);
  if (status)  wheres.push(`dr.status = '${esc(status)}'`);
  if (dateFrom) wheres.push(`DATE(dr.created_at) >= '${esc(dateFrom)}'`);
  if (dateTo)   wheres.push(`DATE(dr.created_at) <= '${esc(dateTo)}'`);
  if (q) {
    const s = esc(q);
    wheres.push(`(dr.drawing_number LIKE '%${s}%' OR dr.title LIKE '%${s}%' OR dr.discipline LIKE '%${s}%' OR j.name LIKE '%${s}%')`);
  }
  const where = wheres.join(' AND ');

  const [rows] = await db.execute(sql.raw(`
    SELECT
      dr.id,
      dr.drawing_number,
      dr.title,
      dr.revision,
      dr.discipline,
      dr.status,
      j.name       AS job_name,
      j.job_number,
      u.name       AS uploaded_by_name,
      dr.created_at
    FROM drawing_records dr
    LEFT JOIN jobs j ON j.id = dr.job_id
    LEFT JOIN \`user\` u ON u.id = dr.uploaded_by_user_id
    WHERE ${where}
    ORDER BY dr.${col} ${dir}
    LIMIT ${ps} OFFSET ${offset}
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  const [countRows] = await db.execute(sql.raw(`
    SELECT COUNT(*) AS total
    FROM drawing_records dr
    LEFT JOIN jobs j ON j.id = dr.job_id
    WHERE ${where}
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  return { rows: rows ?? [], total: safeInt(countRows?.[0]?.total, 0) };
}

async function listJobDelays(companyId: number, params: Record<string, string>) {
  const { q, dateFrom, dateTo, jobId, page, pageSize, sortBy, sortDir } = params;
  const ps = clamp(safeInt(pageSize, 50), 1, 200);
  const pg = clamp(safeInt(page, 1), 1, 9999);
  const offset = (pg - 1) * ps;

  const allowed = new Set(['delay_date', 'days', 'reason', 'created_at']);
  const col = allowed.has(sortBy) ? sortBy : 'delay_date';
  const dir = sortDir === 'asc' ? 'ASC' : 'DESC';

  const wheres: string[] = [`d.company_id = ${companyId}`];
  if (jobId)   wheres.push(`d.job_id = ${safeInt(jobId, 0)}`);
  if (dateFrom) wheres.push(`d.delay_date >= '${esc(dateFrom)}'`);
  if (dateTo)   wheres.push(`d.delay_date <= '${esc(dateTo)}'`);
  if (q) {
    const s = esc(q);
    wheres.push(`(d.reason LIKE '%${s}%' OR d.notes LIKE '%${s}%' OR j.name LIKE '%${s}%' OR j.job_number LIKE '%${s}%')`);
  }
  const where = wheres.join(' AND ');

  const [rows] = await db.execute(sql.raw(`
    SELECT
      d.id,
      j.name       AS job_name,
      j.job_number,
      d.reason,
      d.days,
      d.delay_date,
      d.notes,
      d.created_by_name,
      d.created_at
    FROM job_delays d
    LEFT JOIN jobs j ON j.id = d.job_id
    WHERE ${where}
    ORDER BY d.${col} ${dir}
    LIMIT ${ps} OFFSET ${offset}
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  const [countRows] = await db.execute(sql.raw(`
    SELECT COUNT(*) AS total
    FROM job_delays d
    LEFT JOIN jobs j ON j.id = d.job_id
    WHERE ${where}
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  return { rows: rows ?? [], total: safeInt(countRows?.[0]?.total, 0) };
}

async function listGuestCheckins(companyId: number, params: Record<string, string>) {
  const { q, dateFrom, dateTo, jobId, page, pageSize, sortBy, sortDir } = params;
  const ps = clamp(safeInt(pageSize, 50), 1, 200);
  const pg = clamp(safeInt(page, 1), 1, 9999);
  const offset = (pg - 1) * ps;

  const allowed = new Set(['full_name', 'created_at', 'action']);
  const col = allowed.has(sortBy) ? sortBy : 'created_at';
  const dir = sortDir === 'asc' ? 'ASC' : 'DESC';

  // Pair sign-in rows with their matching sign-out via session_id
  const wheres: string[] = [`gc.company_id = ${companyId}`, `gc.action = 'sign_in'`];
  if (jobId)   wheres.push(`gc.job_id = ${safeInt(jobId, 0)}`);
  if (dateFrom) wheres.push(`DATE(gc.created_at) >= '${esc(dateFrom)}'`);
  if (dateTo)   wheres.push(`DATE(gc.created_at) <= '${esc(dateTo)}'`);
  if (q) {
    const s = esc(q);
    wheres.push(`(gc.full_name LIKE '%${s}%' OR gc.phone_number LIKE '%${s}%' OR gc.email LIKE '%${s}%' OR j.name LIKE '%${s}%' OR j.job_number LIKE '%${s}%')`);
  }
  const where = wheres.join(' AND ');

  const [rows] = await db.execute(sql.raw(`
    SELECT
      gc.id,
      gc.full_name,
      gc.phone_number,
      gc.email,
      gc.reason_for_visit,
      gc.white_card_number,
      j.name       AS job_name,
      j.job_number,
      gc.created_at AS signed_in_at,
      so.created_at AS signed_out_at,
      gc.source,
      gc.actor_type
    FROM guest_checkins gc
    LEFT JOIN jobs j ON j.id = gc.job_id
    LEFT JOIN guest_checkins so
      ON  so.session_id = gc.session_id
      AND so.action     = 'sign_out'
      AND so.created_at = (
        SELECT MIN(x.created_at)
        FROM guest_checkins x
        WHERE x.session_id = gc.session_id
          AND x.action     = 'sign_out'
          AND x.created_at > gc.created_at
      )
    WHERE ${where}
    ORDER BY gc.${col} ${dir}
    LIMIT ${ps} OFFSET ${offset}
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  const [countRows] = await db.execute(sql.raw(`
    SELECT COUNT(*) AS total
    FROM guest_checkins gc
    LEFT JOIN jobs j ON j.id = gc.job_id
    WHERE ${where}
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  return { rows: rows ?? [], total: safeInt(countRows?.[0]?.total, 0) };
}

async function listFleetPrestarts(companyId: number, params: Record<string, string>) {
  const { q, dateFrom, dateTo, jobId, userId, page, pageSize, sortBy, sortDir } = params;
  const ps = clamp(safeInt(pageSize, 50), 1, 200);
  const pg = clamp(safeInt(page, 1), 1, 9999);
  const offset = (pg - 1) * ps;

  const allowed = new Set(['created_at', 'operator_name', 'safe_to_operate']);
  const col = allowed.has(sortBy) ? sortBy : 'created_at';
  const dir = sortDir === 'asc' ? 'ASC' : 'DESC';

  const wheres: string[] = [`fp.company_id = ${companyId}`];
  if (userId)  wheres.push(`fp.user_id = '${esc(userId)}'`);
  if (dateFrom) wheres.push(`DATE(fp.created_at) >= '${esc(dateFrom)}'`);
  if (dateTo)   wheres.push(`DATE(fp.created_at) <= '${esc(dateTo)}'`);
  // jobId not applicable for fleet prestarts — ignore silently
  if (q) {
    const s = esc(q);
    wheres.push(`(fp.operator_name LIKE '%${s}%' OR fa.name LIKE '%${s}%' OR fa.registration LIKE '%${s}%' OR fp.issue_comment LIKE '%${s}%')`);
  }
  const where = wheres.join(' AND ');

  const [rows] = await db.execute(sql.raw(`
    SELECT
      fp.id,
      fa.name          AS asset_name,
      fa.registration  AS asset_rego,
      fa.type          AS asset_type,
      fp.operator_name,
      fp.km_hours,
      fp.safe_to_operate,
      fp.issue_needs_attention,
      fp.issue_comment,
      fp.notes,
      fp.created_at
    FROM fleet_prestarts fp
    LEFT JOIN fleet_assets fa ON fa.id = fp.asset_id
    WHERE ${where}
    ORDER BY fp.${col} ${dir}
    LIMIT ${ps} OFFSET ${offset}
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  const [countRows] = await db.execute(sql.raw(`
    SELECT COUNT(*) AS total
    FROM fleet_prestarts fp
    LEFT JOIN fleet_assets fa ON fa.id = fp.asset_id
    WHERE ${where}
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  return { rows: rows ?? [], total: safeInt(countRows?.[0]?.total, 0) };
}

async function listFleetServiceLogs(companyId: number, params: Record<string, string>) {
  const { q, dateFrom, dateTo, page, pageSize, sortBy, sortDir } = params;
  const ps = clamp(safeInt(pageSize, 50), 1, 200);
  const pg = clamp(safeInt(page, 1), 1, 9999);
  const offset = (pg - 1) * ps;

  const allowed = new Set(['service_date', 'service_type', 'cost', 'created_at']);
  const col = allowed.has(sortBy) ? sortBy : 'service_date';
  const dir = sortDir === 'asc' ? 'ASC' : 'DESC';

  const wheres: string[] = [`sl.company_id = ${companyId}`];
  if (dateFrom) wheres.push(`sl.service_date >= '${esc(dateFrom)}'`);
  if (dateTo)   wheres.push(`sl.service_date <= '${esc(dateTo)}'`);
  if (q) {
    const s = esc(q);
    wheres.push(`(fa.name LIKE '%${s}%' OR fa.registration LIKE '%${s}%' OR sl.service_type LIKE '%${s}%' OR sl.provider LIKE '%${s}%' OR sl.notes LIKE '%${s}%')`);
  }
  const where = wheres.join(' AND ');

  const [rows] = await db.execute(sql.raw(`
    SELECT
      sl.id,
      fa.name          AS asset_name,
      fa.registration  AS asset_rego,
      fa.type          AS asset_type,
      sl.service_type,
      sl.service_date,
      sl.odometer,
      sl.provider,
      sl.cost,
      sl.next_service_date,
      sl.next_service_km,
      sl.notes,
      sl.created_at
    FROM fleet_service_logs sl
    LEFT JOIN fleet_assets fa ON fa.id = sl.fleet_asset_id
    WHERE ${where}
    ORDER BY sl.${col} ${dir}
    LIMIT ${ps} OFFSET ${offset}
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  const [countRows] = await db.execute(sql.raw(`
    SELECT COUNT(*) AS total
    FROM fleet_service_logs sl
    LEFT JOIN fleet_assets fa ON fa.id = sl.fleet_asset_id
    WHERE ${where}
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  return { rows: rows ?? [], total: safeInt(countRows?.[0]?.total, 0) };
}

async function listSitePrestarts(companyId: number, params: Record<string, string>) {
  const { q, dateFrom, dateTo, jobId, status, page, pageSize, sortBy, sortDir } = params;
  const ps = clamp(safeInt(pageSize, 50), 1, 200);
  const pg = clamp(safeInt(page, 1), 1, 9999);
  const offset = (pg - 1) * ps;

  const allowed = new Set(['created_at', 'status', 'submitted_by']);
  const col = allowed.has(sortBy) ? sortBy : 'created_at';
  const dir = sortDir === 'asc' ? 'ASC' : 'DESC';

  const wheres: string[] = [`sp.company_id = ${companyId}`];
  if (jobId)   wheres.push(`sp.job_id = ${safeInt(jobId, 0)}`);
  if (status)  wheres.push(`sp.status = '${esc(status)}'`);
  if (dateFrom) wheres.push(`DATE(sp.created_at) >= '${esc(dateFrom)}'`);
  if (dateTo)   wheres.push(`DATE(sp.created_at) <= '${esc(dateTo)}'`);
  if (q) {
    const s = esc(q);
    wheres.push(`(j.name LIKE '%${s}%' OR j.job_number LIKE '%${s}%' OR sp.submitted_by LIKE '%${s}%')`);
  }
  const where = wheres.join(' AND ');

  const [rows] = await db.execute(sql.raw(`
    SELECT
      sp.id,
      j.name       AS job_name,
      j.job_number,
      sp.submitted_by,
      sp.status,
      sp.created_at,
      (SELECT COUNT(*) FROM site_prestart_workers spw WHERE spw.site_prestart_id = sp.id) AS worker_count
    FROM site_prestarts sp
    LEFT JOIN jobs j ON j.id = sp.job_id
    WHERE ${where}
    ORDER BY sp.${col} ${dir}
    LIMIT ${ps} OFFSET ${offset}
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  const [countRows] = await db.execute(sql.raw(`
    SELECT COUNT(*) AS total
    FROM site_prestarts sp
    LEFT JOIN jobs j ON j.id = sp.job_id
    WHERE ${where}
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  return { rows: rows ?? [], total: safeInt(countRows?.[0]?.total, 0) };
}

async function listSwmsSignoffs(companyId: number, params: Record<string, string>) {
  const { q, dateFrom, dateTo, jobId, page, pageSize, sortBy, sortDir } = params;
  const ps = clamp(safeInt(pageSize, 50), 1, 200);
  const pg = clamp(safeInt(page, 1), 1, 9999);
  const offset = (pg - 1) * ps;

  const allowed = new Set(['signed_at', 'worker_name', 'created_at']);
  const col = allowed.has(sortBy) ? sortBy : 'signed_at';
  const dir = sortDir === 'asc' ? 'ASC' : 'DESC';

  const wheres: string[] = [`ss.company_id = ${companyId}`];
  if (jobId)   wheres.push(`js.job_id = ${safeInt(jobId, 0)}`);
  if (dateFrom) wheres.push(`DATE(ss.signed_at) >= '${esc(dateFrom)}'`);
  if (dateTo)   wheres.push(`DATE(ss.signed_at) <= '${esc(dateTo)}'`);
  if (q) {
    const s = esc(q);
    wheres.push(`(ss.worker_name LIKE '%${s}%' OR ss.white_card_number LIKE '%${s}%' OR st.title LIKE '%${s}%' OR j.name LIKE '%${s}%')`);
  }
  const where = wheres.join(' AND ');

  const [rows] = await db.execute(sql.raw(`
    SELECT
      ss.id,
      ss.worker_name,
      ss.white_card_number,
      ss.company_name,
      ss.role,
      st.title     AS swms_title,
      j.name       AS job_name,
      j.job_number,
      ss.signed_at
    FROM swms_signoffs ss
    LEFT JOIN job_swms js ON js.id = ss.job_swms_id
    LEFT JOIN swms_templates st ON st.id = js.swms_template_id
    LEFT JOIN jobs j ON j.id = js.job_id
    WHERE ${where}
    ORDER BY ss.${col} ${dir}
    LIMIT ${ps} OFFSET ${offset}
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  const [countRows] = await db.execute(sql.raw(`
    SELECT COUNT(*) AS total
    FROM swms_signoffs ss
    LEFT JOIN job_swms js ON js.id = ss.job_swms_id
    WHERE ${where}
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  return { rows: rows ?? [], total: safeInt(countRows?.[0]?.total, 0) };
}

async function listMilestones(companyId: number, params: Record<string, string>) {
  const { q, dateFrom, dateTo, jobId, status, page, pageSize, sortBy, sortDir } = params;
  const ps = clamp(safeInt(pageSize, 50), 1, 200);
  const pg = clamp(safeInt(page, 1), 1, 9999);
  const offset = (pg - 1) * ps;

  const allowed = new Set(['due_date', 'title', 'status', 'created_at']);
  const col = allowed.has(sortBy) ? sortBy : 'due_date';
  const dir = sortDir === 'asc' ? 'ASC' : 'DESC';

  const wheres: string[] = [`m.company_id = ${companyId}`];
  if (jobId)   wheres.push(`m.job_id = ${safeInt(jobId, 0)}`);
  if (status)  wheres.push(`m.status = '${esc(status)}'`);
  if (dateFrom) wheres.push(`m.due_date >= '${esc(dateFrom)}'`);
  if (dateTo)   wheres.push(`m.due_date <= '${esc(dateTo)}'`);
  if (q) {
    const s = esc(q);
    wheres.push(`(m.title LIKE '%${s}%' OR m.assigned_to LIKE '%${s}%' OR j.name LIKE '%${s}%' OR j.job_number LIKE '%${s}%')`);
  }
  const where = wheres.join(' AND ');

  const [rows] = await db.execute(sql.raw(`
    SELECT
      m.id,
      m.title,
      j.name       AS job_name,
      j.job_number,
      m.due_date,
      m.start_date,
      m.assigned_to,
      m.status,
      m.description,
      m.created_at
    FROM job_milestones m
    LEFT JOIN jobs j ON j.id = m.job_id
    WHERE ${where}
    ORDER BY m.${col} ${dir}
    LIMIT ${ps} OFFSET ${offset}
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  const [countRows] = await db.execute(sql.raw(`
    SELECT COUNT(*) AS total
    FROM job_milestones m
    LEFT JOIN jobs j ON j.id = m.job_id
    WHERE ${where}
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  return { rows: rows ?? [], total: safeInt(countRows?.[0]?.total, 0) };
}

async function listAssetBookings(companyId: number, params: Record<string, string>) {
  const { q, dateFrom, dateTo, jobId, status, page, pageSize, sortBy, sortDir } = params;
  const ps = clamp(safeInt(pageSize, 50), 1, 200);
  const pg = clamp(safeInt(page, 1), 1, 9999);
  const offset = (pg - 1) * ps;

  const allowed = new Set(['start_date', 'end_date', 'status', 'created_at']);
  const col = allowed.has(sortBy) ? sortBy : 'start_date';
  const dir = sortDir === 'asc' ? 'ASC' : 'DESC';

  const wheres: string[] = [`ab.company_id = ${companyId}`];
  if (jobId)   wheres.push(`ab.job_id = ${safeInt(jobId, 0)}`);
  if (status)  wheres.push(`ab.status = '${esc(status)}'`);
  if (dateFrom) wheres.push(`ab.end_date >= '${esc(dateFrom)}'`);
  if (dateTo)   wheres.push(`ab.start_date <= '${esc(dateTo)}'`);
  if (q) {
    const s = esc(q);
    wheres.push(`(fa.name LIKE '%${s}%' OR fa.registration LIKE '%${s}%' OR j.name LIKE '%${s}%' OR ab.title LIKE '%${s}%')`);
  }
  const where = wheres.join(' AND ');

  const [rows] = await db.execute(sql.raw(`
    SELECT
      ab.id,
      fa.name          AS asset_name,
      fa.type          AS asset_type,
      fa.rego          AS asset_rego,
      j.name           AS job_name,
      j.job_number,
      ab.title,
      ab.start_date,
      ab.end_date,
      ab.start_time,
      ab.end_time,
      ab.status,
      ab.notes,
      ab.created_at
    FROM asset_bookings ab
    LEFT JOIN fleet_assets fa ON fa.id = ab.fleet_asset_id
    LEFT JOIN jobs j ON j.id = ab.job_id
    WHERE ${where}
    ORDER BY ab.${col} ${dir}
    LIMIT ${ps} OFFSET ${offset}
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  const [countRows] = await db.execute(sql.raw(`
    SELECT COUNT(*) AS total
    FROM asset_bookings ab
    LEFT JOIN fleet_assets fa ON fa.id = ab.fleet_asset_id
    LEFT JOIN jobs j ON j.id = ab.job_id
    WHERE ${where}
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  return { rows: rows ?? [], total: safeInt(countRows?.[0]?.total, 0) };
}

// ── CSV builders ──────────────────────────────────────────────────────────────

function jobsToCsv(rows: Record<string, unknown>[], res: Response, date: string) {
  const headers = ['Job Number', 'Job Name', 'Customer', 'Site Address', 'Status', 'Start Date', 'Expected Completion', 'Supervisor', 'Progress %'];
  sendCsv(res, `iwillbuild-jobs-${date}.csv`, headers, rows.map((r) => [
    r.job_number, r.name, r.customer_name, r.site_address, r.status,
    r.start_date, r.expected_completion, r.supervisor_name, r.progress_percent,
  ] as (string | number | null | undefined)[]));
}

function tasksToCsv(rows: Record<string, unknown>[], res: Response, date: string) {
  const headers = ['Task', 'Job', 'Job Number', 'Assigned To', 'Status', 'Start Date', 'Due Date', 'Notes'];
  sendCsv(res, `iwillbuild-tasks-${date}.csv`, headers, rows.map((r) => [
    r.title, r.job_name, r.job_number, r.assigned_name, r.status,
    r.start_date, r.due_date, r.notes,
  ] as (string | number | null | undefined)[]));
}

function notesToCsv(rows: Record<string, unknown>[], res: Response, date: string) {
  const headers = ['Note', 'Job', 'Type', 'Created By', 'Created At'];
  sendCsv(res, `iwillbuild-notes-${date}.csv`, headers, rows.map((r) => [
    r.body, r.job_name, r.note_type, r.author_name, r.created_at,
  ] as (string | number | null | undefined)[]));
}

function incidentsToCsv(rows: Record<string, unknown>[], res: Response, date: string) {
  const headers = ['Incident #', 'Job', 'Type', 'Severity', 'Status', 'Date', 'Reported By', 'Description', 'Corrective Actions'];
  sendCsv(res, `iwillbuild-incidents-${date}.csv`, headers, rows.map((r) => [
    r.incident_number, r.job_name, r.incident_type, r.severity, r.status,
    r.incident_date, r.reported_by_name, r.description, r.corrective_action_count,
  ] as (string | number | null | undefined)[]));
}

function attendanceToCsv(rows: Record<string, unknown>[], res: Response, date: string) {
  const headers = ['User', 'Email', 'Job', 'Job Number', 'Signed In', 'Signed Out', 'Duration (hrs)', 'Source'];
  sendCsv(res, `iwillbuild-attendance-${date}.csv`, headers, rows.map((r) => [
    r.user_name, r.user_email, r.job_name, r.job_number,
    r.signed_in_at, r.signed_out_at, r.duration_hours, r.source,
  ] as (string | number | null | undefined)[]));
}

function costsToCsv(rows: Record<string, unknown>[], res: Response, date: string) {
  const headers = ['Job', 'Job Number', 'Description', 'Category', 'Amount', 'GST', 'Purchase Date', 'Supplier', 'Type'];
  sendCsv(res, `iwillbuild-costs-${date}.csv`, headers, rows.map((r) => [
    r.job_name, r.job_number, r.description, r.category,
    r.amount, r.gst_amount, r.purchase_date, r.supplier, r.cost_type,
  ] as (string | number | null | undefined)[]));
}

function driverLogsToCsv(rows: Record<string, unknown>[], res: Response, date: string) {
  const headers = ['Driver', 'Email', 'Vehicle', 'Job', 'Started', 'Ended', 'Duration (min)', 'Meter Start', 'Meter End', 'Note', 'Source'];
  sendCsv(res, `iwillbuild-driver-logs-${date}.csv`, headers, rows.map((r) => [
    r.user_name, r.user_email, r.fleet_name, r.job_name,
    r.started_at, r.ended_at, r.duration_minutes,
    r.meter_start, r.meter_end, r.note, r.source,
  ] as (string | number | null | undefined)[]));
}

function drawingsToCsv(rows: Record<string, unknown>[], res: Response, date: string) {
  const headers = ['Drawing #', 'Title', 'Revision', 'Discipline', 'Status', 'Job', 'Job #', 'Uploaded By', 'Created'];
  sendCsv(res, `iwillbuild-drawings-${date}.csv`, headers, rows.map((r) => [
    r.drawing_number, r.title, r.revision, r.discipline, r.status,
    r.job_name, r.job_number, r.uploaded_by_name, r.created_at,
  ] as (string | number | null | undefined)[]));
}

function jobDelaysToCsv(rows: Record<string, unknown>[], res: Response, date: string) {
  const headers = ['Job', 'Job #', 'Reason', 'Days', 'Delay Date', 'Notes', 'Created By', 'Created'];
  sendCsv(res, `iwillbuild-job-delays-${date}.csv`, headers, rows.map((r) => [
    r.job_name, r.job_number, r.reason, r.days, r.delay_date,
    r.notes, r.created_by_name, r.created_at,
  ] as (string | number | null | undefined)[]));
}

function guestCheckinsToCsv(rows: Record<string, unknown>[], res: Response, date: string) {
  const headers = ['Visitor Name', 'Phone', 'Email', 'Reason', 'White Card', 'Job', 'Job #', 'Signed In', 'Signed Out', 'Source'];
  sendCsv(res, `iwillbuild-guest-checkins-${date}.csv`, headers, rows.map((r) => [
    r.full_name, r.phone_number, r.email, r.reason_for_visit, r.white_card_number,
    r.job_name, r.job_number, r.signed_in_at, r.signed_out_at, r.source,
  ] as (string | number | null | undefined)[]));
}

function fleetPrestartsToCsv(rows: Record<string, unknown>[], res: Response, date: string) {
  const headers = ['Asset', 'Rego', 'Type', 'Operator', 'KM/Hours', 'Safe to Operate', 'Issue', 'Issue Comment', 'Notes', 'Date'];
  sendCsv(res, `iwillbuild-fleet-prestarts-${date}.csv`, headers, rows.map((r) => [
    r.asset_name, r.asset_rego, r.asset_type, r.operator_name, r.km_hours,
    r.safe_to_operate ? 'Yes' : 'No',
    r.issue_needs_attention ? 'Yes' : 'No',
    r.issue_comment, r.notes, r.created_at,
  ] as (string | number | null | undefined)[]));
}

function fleetServiceLogsToCsv(rows: Record<string, unknown>[], res: Response, date: string) {
  const headers = ['Asset', 'Rego', 'Type', 'Service Type', 'Service Date', 'Odometer', 'Provider', 'Cost', 'Next Service Date', 'Next Service KM', 'Notes'];
  sendCsv(res, `iwillbuild-fleet-service-logs-${date}.csv`, headers, rows.map((r) => [
    r.asset_name, r.asset_rego, r.asset_type, r.service_type, r.service_date,
    r.odometer, r.provider, r.cost, r.next_service_date, r.next_service_km, r.notes,
  ] as (string | number | null | undefined)[]));
}

function sitePreStartsToCsv(rows: Record<string, unknown>[], res: Response, date: string) {
  const headers = ['Job', 'Job #', 'Submitted By', 'Status', 'Workers', 'Date'];
  sendCsv(res, `iwillbuild-site-prestarts-${date}.csv`, headers, rows.map((r) => [
    r.job_name, r.job_number, r.submitted_by, r.status, r.worker_count, r.created_at,
  ] as (string | number | null | undefined)[]));
}

function swmsSignoffsToCsv(rows: Record<string, unknown>[], res: Response, date: string) {
  const headers = ['Worker', 'White Card', 'Company', 'Role', 'SWMS', 'Job', 'Job #', 'Signed At'];
  sendCsv(res, `iwillbuild-swms-signoffs-${date}.csv`, headers, rows.map((r) => [
    r.worker_name, r.white_card_number, r.company_name, r.role,
    r.swms_title, r.job_name, r.job_number, r.signed_at,
  ] as (string | number | null | undefined)[]));
}

function milestonesToCsv(rows: Record<string, unknown>[], res: Response, date: string) {
  const headers = ['Milestone', 'Job', 'Job #', 'Due Date', 'Start Date', 'Assigned To', 'Status', 'Description'];
  sendCsv(res, `iwillbuild-milestones-${date}.csv`, headers, rows.map((r) => [
    r.title, r.job_name, r.job_number, r.due_date, r.start_date,
    r.assigned_to, r.status, r.description,
  ] as (string | number | null | undefined)[]));
}

function assetBookingsToCsv(rows: Record<string, unknown>[], res: Response, date: string) {
  const headers = ['Asset', 'Type', 'Rego', 'Job', 'Job #', 'Title', 'Start Date', 'End Date', 'Start Time', 'End Time', 'Status', 'Notes'];
  sendCsv(res, `iwillbuild-asset-bookings-${date}.csv`, headers, rows.map((r) => [
    r.asset_name, r.asset_type, r.asset_rego, r.job_name, r.job_number,
    r.title, r.start_date, r.end_date, r.start_time, r.end_time, r.status, r.notes,
  ] as (string | number | null | undefined)[]));
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default async function handler(req: Request, res: Response) {
  try {
    const result = await getSessionAndProfile(req, res);
    if (!result) return;
    const { profile } = result;
    const companyId = profile.companyId;

    const listType = req.params.listType as string;
    const params = req.query as Record<string, string>;
    const isCsv = params.format === 'csv';
    const today = new Date().toISOString().slice(0, 10);

    // For CSV we fetch up to 5000 rows (no pagination)
    const csvParams = isCsv ? { ...params, page: '1', pageSize: '5000' } : params;

    switch (listType) {
      case 'jobs': {
        const data = await listJobs(companyId, csvParams);
        if (isCsv) return jobsToCsv(data.rows as Record<string, unknown>[], res, today);
        return res.json(data);
      }
      case 'tasks': {
        const data = await listTasks(companyId, csvParams);
        if (isCsv) return tasksToCsv(data.rows as Record<string, unknown>[], res, today);
        return res.json(data);
      }
      case 'notes': {
        const data = await listNotes(companyId, csvParams);
        if (isCsv) return notesToCsv(data.rows as Record<string, unknown>[], res, today);
        return res.json(data);
      }
      case 'incidents': {
        const data = await listIncidents(companyId, csvParams);
        if (isCsv) return incidentsToCsv(data.rows as Record<string, unknown>[], res, today);
        return res.json(data);
      }
      case 'attendance': {
        const data = await listAttendance(companyId, csvParams);
        if (isCsv) return attendanceToCsv(data.rows as Record<string, unknown>[], res, today);
        return res.json(data);
      }
      case 'costs': {
        const data = await listCosts(companyId, csvParams);
        if (isCsv) return costsToCsv(data.rows as Record<string, unknown>[], res, today);
        return res.json(data);
      }
      case 'driver-logs': {
        const data = await listDriverLogs(companyId, csvParams);
        if (isCsv) return driverLogsToCsv(data.rows as Record<string, unknown>[], res, today);
        return res.json(data);
      }
      // ── Wave-2 ──────────────────────────────────────────────────────────────
      case 'drawings': {
        const data = await listDrawings(companyId, csvParams);
        if (isCsv) return drawingsToCsv(data.rows as Record<string, unknown>[], res, today);
        return res.json(data);
      }
      case 'job-delays': {
        const data = await listJobDelays(companyId, csvParams);
        if (isCsv) return jobDelaysToCsv(data.rows as Record<string, unknown>[], res, today);
        return res.json(data);
      }
      case 'guest-checkins': {
        const data = await listGuestCheckins(companyId, csvParams);
        if (isCsv) return guestCheckinsToCsv(data.rows as Record<string, unknown>[], res, today);
        return res.json(data);
      }
      case 'fleet-prestarts': {
        const data = await listFleetPrestarts(companyId, csvParams);
        if (isCsv) return fleetPrestartsToCsv(data.rows as Record<string, unknown>[], res, today);
        return res.json(data);
      }
      case 'fleet-service-logs': {
        const data = await listFleetServiceLogs(companyId, csvParams);
        if (isCsv) return fleetServiceLogsToCsv(data.rows as Record<string, unknown>[], res, today);
        return res.json(data);
      }
      case 'site-prestarts': {
        const data = await listSitePrestarts(companyId, csvParams);
        if (isCsv) return sitePreStartsToCsv(data.rows as Record<string, unknown>[], res, today);
        return res.json(data);
      }
      case 'swms-signoffs': {
        const data = await listSwmsSignoffs(companyId, csvParams);
        if (isCsv) return swmsSignoffsToCsv(data.rows as Record<string, unknown>[], res, today);
        return res.json(data);
      }
      case 'milestones': {
        const data = await listMilestones(companyId, csvParams);
        if (isCsv) return milestonesToCsv(data.rows as Record<string, unknown>[], res, today);
        return res.json(data);
      }
      case 'asset-bookings': {
        const data = await listAssetBookings(companyId, csvParams);
        if (isCsv) return assetBookingsToCsv(data.rows as Record<string, unknown>[], res, today);
        return res.json(data);
      }
      default:
        return res.status(400).json({ error: `Unknown list type: ${listType}` });
    }
  } catch (err) {
    console.error('GET /api/lists error:', err);
    res.status(500).json({ error: 'Failed to fetch list data' });
  }
}
