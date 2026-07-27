/**
 * GET /api/lists/:listType
 *
 * Unified Lists API — returns paginated, filterable, sortable records for
 * the office Lists view. Supports CSV export via ?format=csv.
 *
 * listType values: jobs | tasks | notes | incidents | attendance | costs | driver-logs
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
      default:
        return res.status(400).json({ error: `Unknown list type: ${listType}` });
    }
  } catch (err) {
    console.error('GET /api/lists error:', err);
    res.status(500).json({ error: 'Failed to fetch list data' });
  }
}
