/**
 * timesheet-service.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * CRUD + status transitions for employee timesheets.
 *
 * Table: timesheets
 *   id, company_id, profile_id, job_id (nullable), week_ending (DATE),
 *   status (draft|submitted|approved|rejected), notes, submitted_at,
 *   approved_by_profile_id, approved_at, rejection_reason,
 *   created_at, updated_at
 *
 * Table: timesheet_entries
 *   id, timesheet_id, company_id, work_date (DATE), job_id (nullable),
 *   description, hours, created_at
 *
 * Migration is handled at server startup via ensureTimesheetSchema().
 */

import { db } from '../db/client.js';
import { sql } from 'drizzle-orm';

// ── Schema migration ──────────────────────────────────────────────────────────

export async function ensureTimesheetSchema(): Promise<void> {
  // Create timesheets table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS timesheets (
      id              INT AUTO_INCREMENT PRIMARY KEY,
      company_id      INT NOT NULL,
      profile_id      INT NOT NULL,
      job_id          INT NULL,
      week_ending     DATE NOT NULL,
      status          VARCHAR(20) NOT NULL DEFAULT 'draft',
      notes           TEXT NULL,
      submitted_at    DATETIME NULL,
      approved_by_profile_id INT NULL,
      approved_at     DATETIME NULL,
      rejection_reason TEXT NULL,
      created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_ts_company (company_id),
      INDEX idx_ts_profile (profile_id),
      INDEX idx_ts_status  (status),
      INDEX idx_ts_week    (week_ending)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // Create timesheet_entries table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS timesheet_entries (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      timesheet_id  INT NOT NULL,
      company_id    INT NOT NULL,
      work_date     DATE NOT NULL,
      job_id        INT NULL,
      description   VARCHAR(500) NOT NULL DEFAULT '',
      hours         DECIMAL(5,2) NOT NULL DEFAULT 0,
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_te_timesheet (timesheet_id),
      INDEX idx_te_company   (company_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // Ensure any columns added after initial release exist
  const colsToEnsure: Array<{ table: string; column: string; definition: string }> = [
    // FairWork V1 fields
    { table: 'timesheet_entries', column: 'start_time',        definition: "VARCHAR(5) NULL COMMENT 'HH:MM 24h'" },
    { table: 'timesheet_entries', column: 'finish_time',       definition: "VARCHAR(5) NULL COMMENT 'HH:MM 24h'" },
    { table: 'timesheet_entries', column: 'unpaid_break_mins', definition: 'SMALLINT NULL DEFAULT 0' },
    { table: 'timesheet_entries', column: 'day_type',          definition: "VARCHAR(20) NOT NULL DEFAULT 'work'" },
    // FairWork V2 fields — lunch split, per-entry employee, sort order
    { table: 'timesheet_entries', column: 'lunch_start',       definition: "VARCHAR(5) NULL COMMENT 'HH:MM 24h'" },
    { table: 'timesheet_entries', column: 'lunch_finish',      definition: "VARCHAR(5) NULL COMMENT 'HH:MM 24h'" },
    { table: 'timesheet_entries', column: 'sort_order',        definition: 'SMALLINT NOT NULL DEFAULT 0' },
    // Employee on the timesheet header (profile_id of the employee being recorded)
    { table: 'timesheets', column: 'employee_profile_id',      definition: 'INT NULL' },
    // Submission confirmation
    { table: 'timesheets', column: 'confirmed_by_employee',    definition: 'TINYINT(1) NOT NULL DEFAULT 0' },
    { table: 'timesheets', column: 'confirmed_at',             definition: 'DATETIME NULL' },
  ];

  for (const col of colsToEnsure) {
    const [rows] = await db.execute(sql`
      SELECT COUNT(*) AS cnt
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = ${col.table}
        AND COLUMN_NAME  = ${col.column}
    `);
    const cnt = (rows as Array<{ cnt: number }>)[0]?.cnt ?? 0;
    if (cnt === 0) {
      await db.execute(
        sql.raw(`ALTER TABLE \`${col.table}\` ADD COLUMN \`${col.column}\` ${col.definition}`)
      );
    }
  }

  // Unique index: one timesheet per employee per week per company
  // Wrapped in try/catch — may fail if column not yet added (will succeed on next call)
  try {
    const [idxRows] = await db.execute(sql`
      SELECT COUNT(*) AS cnt
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = 'timesheets'
        AND INDEX_NAME   = 'idx_ts_employee_week'
    `);
    const idxCnt = (idxRows as Array<{ cnt: number }>)[0]?.cnt ?? 0;
    if (idxCnt === 0) {
      await db.execute(sql.raw(
        'ALTER TABLE `timesheets` ADD INDEX `idx_ts_employee_week` (`company_id`, `employee_profile_id`, `week_ending`)'
      ));
    }
  } catch {
    // Index creation deferred — column may not exist yet on first migration pass
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type TimesheetStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

export interface TimesheetEntry {
  id?: number;
  work_date: string;        // YYYY-MM-DD
  job_id?: number | null;
  description: string;
  hours: number;
  sort_order?: number;
  // FairWork fields
  start_time?: string | null;        // HH:MM 24h
  finish_time?: string | null;       // HH:MM 24h
  lunch_start?: string | null;       // HH:MM 24h
  lunch_finish?: string | null;      // HH:MM 24h
  unpaid_break_mins?: number | null; // minutes (derived from lunch window)
  day_type?: string;                 // 'work' | 'leave' | 'sick' | 'public-holiday' | 'unpaid-leave'
}

export interface Timesheet {
  id: number;
  company_id: number;
  profile_id: number;
  employee_profile_id: number | null;
  job_id: number | null;
  week_ending: string;
  status: TimesheetStatus;
  notes: string | null;
  confirmed_by_employee: boolean;
  confirmed_at: string | null;
  submitted_at: string | null;
  approved_by_profile_id: number | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  employee_name?: string;
  employee_email?: string;
  submitter_name?: string;
  job_number?: string | null;
  job_name?: string | null;
  total_hours?: number;
  entries?: TimesheetEntry[];
}

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: number; message: string } };

// ── Status transitions ────────────────────────────────────────────────────────

const ALLOWED_TRANSITIONS: Record<TimesheetStatus, Set<TimesheetStatus>> = {
  draft:     new Set(['submitted']),
  submitted: new Set(['approved', 'rejected', 'draft']),
  approved:  new Set([]),
  rejected:  new Set(['draft']),
};

export function validateTimesheetTransition(
  current: TimesheetStatus,
  next: TimesheetStatus,
): { code: 409 | 422; message: string } | null {
  const valid: TimesheetStatus[] = ['draft', 'submitted', 'approved', 'rejected'];
  if (!valid.includes(next)) return { code: 422, message: `Invalid status: ${next}` };
  if (next === current) return null;
  const allowed = ALLOWED_TRANSITIONS[current] ?? new Set();
  if (!allowed.has(next)) {
    return { code: 409, message: `Cannot transition from '${current}' to '${next}'` };
  }
  return null;
}

// ── List timesheets ───────────────────────────────────────────────────────────

export interface ListTimesheetsParams {
  companyId: number;
  profileId?: number;       // if set, filter to this employee only
  status?: string;
  weekEnding?: string;
  search?: string;
  cursor?: number;
  limit?: number;
  isAdmin: boolean;
}

export async function listTimesheets(params: ListTimesheetsParams): Promise<{
  timesheets: Timesheet[];
  hasMore: boolean;
  nextCursor: number | null;
  counts: Record<string, number>;
}> {
  const limit = Math.min(params.limit ?? 25, 100);

  // Status counts
  const [countRows] = await db.execute(sql`
    SELECT status, COUNT(*) AS cnt
    FROM timesheets
    WHERE company_id = ${params.companyId}
      ${params.profileId && !params.isAdmin ? sql`AND profile_id = ${params.profileId}` : sql``}
    GROUP BY status
  `);
  const counts: Record<string, number> = { all: 0, draft: 0, submitted: 0, approved: 0, rejected: 0 };
  for (const row of countRows as Array<{ status: string; cnt: number }>) {
    counts[row.status] = Number(row.cnt);
    counts.all += Number(row.cnt);
  }

  // Build list query
  const [rows] = await db.execute(sql`
    SELECT
      t.id, t.company_id, t.profile_id, t.employee_profile_id, t.job_id, t.week_ending,
      t.status, t.notes, t.confirmed_by_employee, t.confirmed_at,
      t.submitted_at, t.approved_by_profile_id,
      t.approved_at, t.rejection_reason, t.created_at, t.updated_at,
      COALESCE(eu.name, u.name) AS employee_name,
      COALESCE(eu.email, u.email) AS employee_email,
      u.name AS submitter_name,
      j.job_number, j.name AS job_name,
      (SELECT COALESCE(SUM(te.hours), 0) FROM timesheet_entries te WHERE te.timesheet_id = t.id) AS total_hours
    FROM timesheets t
    INNER JOIN profiles p ON p.id = t.profile_id
    INNER JOIN user u ON u.id = p.user_id
    LEFT JOIN profiles ep ON ep.id = t.employee_profile_id
    LEFT JOIN user eu ON eu.id = ep.user_id
    LEFT JOIN jobs j ON j.id = t.job_id AND j.company_id = ${params.companyId}
    WHERE t.company_id = ${params.companyId}
      ${params.profileId && !params.isAdmin ? sql`AND (t.profile_id = ${params.profileId} OR t.employee_profile_id = ${params.profileId})` : sql``}
      ${params.status && params.status !== 'all' ? sql`AND t.status = ${params.status}` : sql``}
      ${params.weekEnding ? sql`AND t.week_ending = ${params.weekEnding}` : sql``}
      ${params.search ? sql`AND (COALESCE(eu.name, u.name) LIKE ${`%${params.search}%`} OR j.job_number LIKE ${`%${params.search}%`} OR j.name LIKE ${`%${params.search}%`})` : sql``}
      ${params.cursor ? sql`AND t.id < ${params.cursor}` : sql``}
    ORDER BY t.id DESC
    LIMIT ${limit + 1}
  `);

  const all = rows as Timesheet[];
  const hasMore = all.length > limit;
  const page = hasMore ? all.slice(0, limit) : all;
  const nextCursor = hasMore ? page[page.length - 1].id : null;

  return { timesheets: page, hasMore, nextCursor, counts };
}

// ── Get single timesheet with entries ────────────────────────────────────────

export async function getTimesheet(
  id: number,
  companyId: number,
  profileId: number,
  isAdmin: boolean,
): Promise<Timesheet | null> {
  const [rows] = await db.execute(sql`
    SELECT
      t.id, t.company_id, t.profile_id, t.employee_profile_id, t.job_id, t.week_ending,
      t.status, t.notes, t.confirmed_by_employee, t.confirmed_at,
      t.submitted_at, t.approved_by_profile_id,
      t.approved_at, t.rejection_reason, t.created_at, t.updated_at,
      COALESCE(eu.name, u.name) AS employee_name,
      COALESCE(eu.email, u.email) AS employee_email,
      u.name AS submitter_name,
      j.job_number, j.name AS job_name
    FROM timesheets t
    INNER JOIN profiles p ON p.id = t.profile_id
    INNER JOIN user u ON u.id = p.user_id
    LEFT JOIN profiles ep ON ep.id = t.employee_profile_id
    LEFT JOIN user eu ON eu.id = ep.user_id
    LEFT JOIN jobs j ON j.id = t.job_id AND j.company_id = ${companyId}
    WHERE t.id = ${id} AND t.company_id = ${companyId}
      ${!isAdmin ? sql`AND (t.profile_id = ${profileId} OR t.employee_profile_id = ${profileId})` : sql``}
    LIMIT 1
  `);

  const ts = (rows as Timesheet[])[0];
  if (!ts) return null;

  const [entryRows] = await db.execute(sql`
    SELECT te.id, te.work_date, te.job_id, te.description, te.hours,
           te.start_time, te.finish_time, te.lunch_start, te.lunch_finish,
           te.unpaid_break_mins, te.day_type, te.sort_order,
           j.job_number AS entry_job_number, j.name AS entry_job_name
    FROM timesheet_entries te
    LEFT JOIN jobs j ON j.id = te.job_id AND j.company_id = ${companyId}
    WHERE te.timesheet_id = ${id}
    ORDER BY te.work_date ASC, te.sort_order ASC, te.id ASC
  `);

  ts.entries = entryRows as TimesheetEntry[];
  return ts;
}

// ── Create timesheet ──────────────────────────────────────────────────────────

export async function createTimesheet(params: {
  companyId: number;
  profileId: number;
  employeeProfileId?: number | null;
  weekEnding: string;
  jobId?: number | null;
  notes?: string | null;
  entries: TimesheetEntry[];
}): Promise<ServiceResult<{ id: number }>> {
  if (!params.weekEnding) {
    return { ok: false, error: { code: 400, message: 'week_ending is required' } };
  }
  if (!params.entries || params.entries.length === 0) {
    return { ok: false, error: { code: 400, message: 'At least one time entry is required' } };
  }
  if (params.entries.length > 200) {
    return { ok: false, error: { code: 400, message: 'Maximum 200 entries per timesheet' } };
  }

  // Duplicate prevention: one timesheet per employee per week
  const empId = params.employeeProfileId ?? params.profileId;
  const [dupRows] = await db.execute(sql`
    SELECT id FROM timesheets
    WHERE company_id = ${params.companyId}
      AND employee_profile_id = ${empId}
      AND week_ending = ${params.weekEnding}
    LIMIT 1
  `);
  if ((dupRows as unknown[]).length > 0) {
    return { ok: false, error: { code: 409, message: 'A timesheet already exists for this employee and week' } };
  }

  // Validate entries — skip time validation for non-work day types
  for (let i = 0; i < params.entries.length; i++) {
    const e = params.entries[i];
    if (!e.work_date) return { ok: false, error: { code: 400, message: `Entry ${i + 1}: work_date is required` } };
    const dayType = e.day_type ?? 'work';
    if (dayType === 'work') {
      const h = Number(e.hours);
      if (!isFinite(h) || h <= 0 || h > 24) return { ok: false, error: { code: 400, message: `Entry ${i + 1}: hours must be between 0.1 and 24` } };
    }
  }

  const [result] = await db.execute(sql`
    INSERT INTO timesheets (company_id, profile_id, employee_profile_id, job_id, week_ending, status, notes)
    VALUES (${params.companyId}, ${params.profileId}, ${empId}, ${params.jobId ?? null}, ${params.weekEnding}, 'draft', ${params.notes ?? null})
  `);
  const insertId = (result as { insertId: number }).insertId;

  for (let i = 0; i < params.entries.length; i++) {
    const e = params.entries[i];
    await db.execute(sql`
      INSERT INTO timesheet_entries
        (timesheet_id, company_id, work_date, job_id, description, hours,
         start_time, finish_time, lunch_start, lunch_finish, unpaid_break_mins, day_type, sort_order)
      VALUES
        (${insertId}, ${params.companyId}, ${e.work_date}, ${e.job_id ?? null},
         ${(e.description ?? '').trim()}, ${Number(e.hours)},
         ${e.start_time ?? null}, ${e.finish_time ?? null},
         ${e.lunch_start ?? null}, ${e.lunch_finish ?? null},
         ${e.unpaid_break_mins ?? 0}, ${e.day_type ?? 'work'}, ${e.sort_order ?? i})
    `);
  }

  return { ok: true, data: { id: insertId } };
}

// ── Update timesheet (draft only) ─────────────────────────────────────────────

export async function updateTimesheet(params: {
  id: number;
  companyId: number;
  profileId: number;
  isAdmin: boolean;
  weekEnding?: string;
  employeeProfileId?: number | null;
  jobId?: number | null;
  notes?: string | null;
  entries?: TimesheetEntry[];
}): Promise<ServiceResult<{ id: number }>> {
  const [rows] = await db.execute(sql`
    SELECT id, status, profile_id, employee_profile_id FROM timesheets
    WHERE id = ${params.id} AND company_id = ${params.companyId}
    LIMIT 1
  `);
  const ts = (rows as Array<{ id: number; status: string; profile_id: number; employee_profile_id: number | null }>)[0];
  if (!ts) return { ok: false, error: { code: 404, message: 'Timesheet not found' } };
  if (!params.isAdmin && ts.profile_id !== params.profileId && ts.employee_profile_id !== params.profileId) {
    return { ok: false, error: { code: 403, message: 'Not your timesheet' } };
  }
  if (ts.status !== 'draft' && ts.status !== 'rejected') {
    return { ok: false, error: { code: 409, message: 'Only draft or rejected timesheets can be edited' } };
  }

  if (params.weekEnding !== undefined || params.jobId !== undefined || params.notes !== undefined || params.employeeProfileId !== undefined) {
    await db.execute(sql`
      UPDATE timesheets SET
        week_ending          = COALESCE(${params.weekEnding ?? null}, week_ending),
        employee_profile_id  = ${params.employeeProfileId !== undefined ? (params.employeeProfileId ?? null) : sql`employee_profile_id`},
        job_id               = ${params.jobId !== undefined ? (params.jobId ?? null) : sql`job_id`},
        notes                = ${params.notes !== undefined ? (params.notes ?? null) : sql`notes`},
        updated_at           = NOW()
      WHERE id = ${params.id}
    `);
  }

  if (params.entries !== undefined) {
    await db.execute(sql`DELETE FROM timesheet_entries WHERE timesheet_id = ${params.id}`);
    for (let i = 0; i < params.entries.length; i++) {
      const e = params.entries[i];
      await db.execute(sql`
        INSERT INTO timesheet_entries
          (timesheet_id, company_id, work_date, job_id, description, hours,
           start_time, finish_time, lunch_start, lunch_finish, unpaid_break_mins, day_type, sort_order)
        VALUES
          (${params.id}, ${params.companyId}, ${e.work_date}, ${e.job_id ?? null},
           ${(e.description ?? '').trim()}, ${Number(e.hours)},
           ${e.start_time ?? null}, ${e.finish_time ?? null},
           ${e.lunch_start ?? null}, ${e.lunch_finish ?? null},
           ${e.unpaid_break_mins ?? 0}, ${e.day_type ?? 'work'}, ${e.sort_order ?? i})
      `);
    }
  }

  return { ok: true, data: { id: params.id } };
}

// ── Transition status ─────────────────────────────────────────────────────────

export async function transitionTimesheet(params: {
  id: number;
  companyId: number;
  profileId: number;
  isAdmin: boolean;
  newStatus: TimesheetStatus;
  rejectionReason?: string | null;
}): Promise<ServiceResult<{ id: number; status: TimesheetStatus }>> {
  const [rows] = await db.execute(sql`
    SELECT id, status, profile_id FROM timesheets
    WHERE id = ${params.id} AND company_id = ${params.companyId}
    LIMIT 1
  `);
  const ts = (rows as Array<{ id: number; status: TimesheetStatus; profile_id: number }>)[0];
  if (!ts) return { ok: false, error: { code: 404, message: 'Timesheet not found' } };

  // Only owner can submit their own; only admin can approve/reject
  if (params.newStatus === 'submitted' && !params.isAdmin && ts.profile_id !== params.profileId) {
    return { ok: false, error: { code: 403, message: 'Not your timesheet' } };
  }
  if ((params.newStatus === 'approved' || params.newStatus === 'rejected') && !params.isAdmin) {
    return { ok: false, error: { code: 403, message: 'Admin permission required to approve/reject' } };
  }

  const err = validateTimesheetTransition(ts.status, params.newStatus);
  if (err) return { ok: false, error: err };

  await db.execute(sql`
    UPDATE timesheets SET
      status                 = ${params.newStatus},
      submitted_at           = ${params.newStatus === 'submitted' ? sql`NOW()` : sql`submitted_at`},
      confirmed_by_employee  = ${params.newStatus === 'submitted' ? 1 : sql`confirmed_by_employee`},
      confirmed_at           = ${params.newStatus === 'submitted' ? sql`NOW()` : sql`confirmed_at`},
      approved_by_profile_id = ${params.newStatus === 'approved' ? params.profileId : sql`approved_by_profile_id`},
      approved_at            = ${params.newStatus === 'approved' ? sql`NOW()` : sql`approved_at`},
      rejection_reason       = ${params.newStatus === 'rejected' ? (params.rejectionReason ?? null) : sql`rejection_reason`},
      updated_at             = NOW()
    WHERE id = ${params.id}
  `);

  return { ok: true, data: { id: params.id, status: params.newStatus } };
}

// ── Delete timesheet (draft only) ─────────────────────────────────────────────

export async function deleteTimesheet(params: {
  id: number;
  companyId: number;
  profileId: number;
  isAdmin: boolean;
}): Promise<ServiceResult<{ id: number }>> {
  const [rows] = await db.execute(sql`
    SELECT id, status, profile_id FROM timesheets
    WHERE id = ${params.id} AND company_id = ${params.companyId}
    LIMIT 1
  `);
  const ts = (rows as Array<{ id: number; status: string; profile_id: number }>)[0];
  if (!ts) return { ok: false, error: { code: 404, message: 'Timesheet not found' } };
  if (!params.isAdmin && ts.profile_id !== params.profileId) {
    return { ok: false, error: { code: 403, message: 'Not your timesheet' } };
  }
  if (ts.status !== 'draft') {
    return { ok: false, error: { code: 409, message: 'Only draft timesheets can be deleted' } };
  }

  await db.execute(sql`DELETE FROM timesheet_entries WHERE timesheet_id = ${params.id}`);
  await db.execute(sql`DELETE FROM timesheets WHERE id = ${params.id}`);

  return { ok: true, data: { id: params.id } };
}
