/**
 * GET /api/signin-history
 *
 * Unified sign-in history across job_attendance and fleet_usage_logs.
 * Query params:
 *   - jobId        (number)
 *   - fleetId      (number)
 *   - userId       (string)
 *   - actorType    (string)
 *   - source       (string)
 *   - dateFrom     (YYYY-MM-DD)
 *   - dateTo       (YYYY-MM-DD)
 *   - page         (number, default 1)
 *   - pageSize     (number, default 50, max 200)
 *   - format       (json | csv)
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../lib/auth-middleware.js';

interface HistoryRow {
  id: string;
  record_type: string;
  action: string;
  source: string;
  actor_type: string;
  user_name: string | null;
  user_email: string | null;
  job_id: number | null;
  job_name: string | null;
  fleet_id: number | null;
  fleet_name: string | null;
  notes: string | null;
  created_at: string;
  signed_out_at: string | null;
  duration_minutes: number | null;
}

function buildWhere(
  companyId: number,
  params: {
    jobId?: number;
    fleetId?: number;
    userId?: string;
    actorType?: string;
    source?: string;
    dateFrom?: string;
    dateTo?: string;
  },
  tableAlias: 'ja' | 'ful',
): string {
  const clauses: string[] = [`${tableAlias}.company_id = ${companyId}`];

  if (tableAlias === 'ja') {
    if (params.jobId)    clauses.push(`ja.job_id = ${params.jobId}`);
    if (params.fleetId)  clauses.push('1=0'); // fleet rows not in job_attendance
    if (params.userId)   clauses.push(`ja.user_id = '${params.userId.replace(/'/g, '')}'`);
    if (params.actorType) clauses.push(`ja.actor_type = '${params.actorType.replace(/'/g, '')}'`);
    if (params.source)   clauses.push(`ja.source = '${params.source.replace(/'/g, '')}'`);
    if (params.dateFrom) clauses.push(`DATE(ja.created_at) >= '${params.dateFrom.replace(/'/g, '')}'`);
    if (params.dateTo)   clauses.push(`DATE(ja.created_at) <= '${params.dateTo.replace(/'/g, '')}'`);
  } else {
    if (params.fleetId)  clauses.push(`ful.fleet_id = ${params.fleetId}`);
    if (params.jobId)    clauses.push(`ful.job_id = ${params.jobId}`);
    if (params.userId)   clauses.push(`ful.user_id = '${params.userId.replace(/'/g, '')}'`);
    if (params.actorType) clauses.push(`ful.actor_type = '${params.actorType.replace(/'/g, '')}'`);
    if (params.dateFrom) clauses.push(`DATE(ful.started_at) >= '${params.dateFrom.replace(/'/g, '')}'`);
    if (params.dateTo)   clauses.push(`DATE(ful.started_at) <= '${params.dateTo.replace(/'/g, '')}'`);
  }

  return clauses.join(' AND ');
}

function toCsv(rows: HistoryRow[]): string {
  const headers = [
    'Type', 'Action', 'Source', 'Actor Type',
    'User Name', 'User Email',
    'Job ID', 'Job Name', 'Fleet ID', 'Fleet Name',
    'Notes', 'Date/Time', 'Signed Out At', 'Duration (min)',
  ];

  function esc(v: string | number | null | undefined): string {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push([
      esc(r.record_type),
      esc(r.action),
      esc(r.source),
      esc(r.actor_type),
      esc(r.user_name),
      esc(r.user_email),
      esc(r.job_id),
      esc(r.job_name),
      esc(r.fleet_id),
      esc(r.fleet_name),
      esc(r.notes),
      esc(r.created_at),
      esc(r.signed_out_at),
      esc(r.duration_minutes),
    ].join(','));
  }
  return lines.join('\r\n');
}

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  const companyId = auth.profile.companyId;
  const format    = (req.query.format as string) === 'csv' ? 'csv' : 'json';

  const jobId     = req.query.jobId    ? parseInt(req.query.jobId as string)    : undefined;
  const fleetId   = req.query.fleetId  ? parseInt(req.query.fleetId as string)  : undefined;
  const userId    = req.query.userId   as string | undefined;
  const actorType = req.query.actorType as string | undefined;
  const source    = req.query.source   as string | undefined;
  const dateFrom  = req.query.dateFrom as string | undefined;
  const dateTo    = req.query.dateTo   as string | undefined;
  const page      = Math.max(1, parseInt((req.query.page as string) || '1'));
  const pageSize  = Math.min(200, Math.max(1, parseInt((req.query.pageSize as string) || '50')));
  const offset    = (page - 1) * pageSize;

  const filterParams = { jobId, fleetId, userId, actorType, source, dateFrom, dateTo };

  try {
    // ── Job attendance rows ───────────────────────────────────────────────
    const jaWhere = buildWhere(companyId, filterParams, 'ja');
    const [jaRows] = await db.execute(sql.raw(`
      SELECT
        CONCAT('ja-', ja.id)  AS id,
        'job_attendance'       AS record_type,
        ja.action,
        ja.source,
        ja.actor_type,
        u.name                AS user_name,
        u.email               AS user_email,
        ja.job_id,
        j.name                AS job_name,
        NULL                  AS fleet_id,
        NULL                  AS fleet_name,
        ja.notes,
        ja.created_at,
        NULL                  AS signed_out_at,
        NULL                  AS duration_minutes
      FROM job_attendance ja
      LEFT JOIN user u ON u.id = ja.user_id
      LEFT JOIN jobs j  ON j.id = ja.job_id
      WHERE ${jaWhere}
    `)) as unknown as [HistoryRow[], unknown];

    // ── Fleet usage rows ──────────────────────────────────────────────────
    const fulWhere = buildWhere(companyId, filterParams, 'ful');
    const [fulRows] = await db.execute(sql.raw(`
      SELECT
        CONCAT('ful-', ful.id) AS id,
        'fleet_usage'          AS record_type,
        'signin'               AS action,
        COALESCE(ful.source, 'portal') AS source,
        COALESCE(ful.actor_type, 'employee') AS actor_type,
        u.name                 AS user_name,
        u.email                AS user_email,
        ful.job_id,
        j.name                 AS job_name,
        ful.fleet_id,
        fa.name                AS fleet_name,
        ful.note               AS notes,
        ful.started_at         AS created_at,
        ful.ended_at           AS signed_out_at,
        ful.duration_minutes
      FROM fleet_usage_logs ful
      LEFT JOIN user u       ON u.id  = ful.user_id
      LEFT JOIN jobs j        ON j.id  = ful.job_id
      LEFT JOIN fleet_assets fa ON fa.id = ful.fleet_id
      WHERE ${fulWhere}
    `)) as unknown as [HistoryRow[], unknown];

    // ── Merge, sort by created_at desc, paginate ──────────────────────────
    const all = [...(jaRows ?? []), ...(fulRows ?? [])].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    const total   = all.length;
    const paged   = format === 'csv' ? all : all.slice(offset, offset + pageSize);

    if (format === 'csv') {
      const csv = toCsv(paged);
      const filename = `signin-history-${new Date().toISOString().slice(0, 10)}.csv`;
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(csv);
    }

    return res.json({
      ok: true,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      rows: paged,
    });
  } catch (err) {
    console.error('GET /api/signin-history error:', err);
    return res.status(500).json({ error: 'Failed to fetch sign-in history' });
  }
}
