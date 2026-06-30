/**
 * buildAnnetteContext()
 * ─────────────────────────────────────────────────────────────────────────────
 * Deep health-check data loader for the Annette Protocol.
 * Runs company-scoped analysis queries across all modules the user can access.
 * Each query is isolated — one failure never crashes the whole report.
 *
 * Returns a structured AnnetteData object that the system prompt formatter
 * turns into a prioritised action report.
 */
import { db } from '../db/client.js';
import { sql } from 'drizzle-orm';
import type { DazzaPermissions } from './dazza-context.js';

export interface AnnetteData {
  companyName:   string;
  companyId:     number;
  runAt:         string;
  seeDollars:    boolean;
  warnings:      string[];
  moduleCounts:  Record<string, number>;

  // Jobs
  jobs: {
    total:              number;
    byStatus:           Record<string, number>;
    noForms:            Array<{ id: number; job_number: string; name: string; status: string }>;
    approvedNoProgress: Array<{ id: number; job_number: string; name: string }>;
    noPhotos:           Array<{ id: number; job_number: string; name: string; status: string }>;
    noFiles:            Array<{ id: number; job_number: string; name: string; status: string }>;
    stalled:            Array<{ id: number; job_number: string; name: string; status: string; days_since_update: number }>;
  };

  // To-dos
  todos: {
    overdueCount:  number;
    dueTodayCount: number;
    overdue:       Array<{ id: number; title: string; job_name: string; due_date: string; days_overdue: number }>;
    dueToday:      Array<{ id: number; title: string; job_name: string; due_date: string }>;
  };

  // Fleet
  fleet: {
    total:           number;
    serviceOverdue:  Array<{ id: number; name: string; rego: string | null; service_date: string; days_overdue: number }>;
    regoOverdue:     Array<{ id: number; name: string; rego: string | null; rego_expiry: string; days_overdue: number }>;
    serviceDue14:    Array<{ id: number; name: string; rego: string | null; service_date: string; days_until: number }>;
    regoDue14:       Array<{ id: number; name: string; rego: string | null; rego_expiry: string; days_until: number }>;
    openFlags:       Array<{ asset_name: string; issue_comment: string; flagged_at: string }>;
    noPrestartDays:  number | null; // null = module failed; number = days since last (0+ real, 999 = never recorded)
  };

  // Estimates
  estimates: {
    draftTooLong:    Array<{ id: number; job_name: string; title: string; days_in_draft: number; amount?: number }>;
    pendingApproval: Array<{ id: number; job_name: string; title: string; days_pending: number; amount?: number }>;
  };

  // Forms
  forms: {
    incompleteSubmissions: Array<{ form_name: string; job_name: string; submitted_at: string }>;
    jobsWithNoForms:       number; // redundant with jobs.noForms.length but kept for clarity
  };
}

async function safeQuery<T>(
  name: string,
  fn: () => Promise<T>,
  fallback: T,
  warnings: string[],
  moduleCounts: Record<string, number>,
): Promise<T> {
  try {
    const result = await fn();
    moduleCounts[name] = Array.isArray(result) ? result.length : 1;
    return result;
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    console.warn(`[annette-context] ${name} FAILED: ${msg}`);
    warnings.push(`${name}: ${msg.slice(0, 120)}`);
    moduleCounts[name] = -1;
    return fallback;
  }
}

function daysBetween(dateStr: string, now: Date): number {
  const d = new Date(dateStr);
  return Math.round((now.getTime() - d.getTime()) / 86400000);
}

export async function buildAnnetteContext(
  companyId: number,
  permissions: DazzaPermissions,
  companyName: string,
): Promise<AnnetteData> {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const in14  = new Date(now.getTime() + 14 * 86400000).toISOString().slice(0, 10);
  const ago14 = new Date(now.getTime() - 14 * 86400000).toISOString().slice(0, 10);

  const warnings: string[] = [];
  const moduleCounts: Record<string, number> = {};

  const data: AnnetteData = {
    companyName,
    companyId,
    runAt:      now.toISOString(),
    seeDollars: permissions.seeDollars,
    warnings,
    moduleCounts,
    jobs: {
      total: 0, byStatus: {},
      noForms: [], approvedNoProgress: [], noPhotos: [], noFiles: [], stalled: [],
    },
    todos: { overdueCount: 0, dueTodayCount: 0, overdue: [], dueToday: [] },
    fleet: {
      total: 0, serviceOverdue: [], regoOverdue: [],
      serviceDue14: [], regoDue14: [], openFlags: [], noPrestartDays: null,
    },
    estimates: { draftTooLong: [], pendingApproval: [] },
    forms:     { incompleteSubmissions: [], jobsWithNoForms: 0 },
  };

  // ── Jobs ──────────────────────────────────────────────────────────────────
  if (permissions.canJobs) {
    // Total + status breakdown
    await safeQuery('jobs_summary', async () => {
      const [rows] = await db.execute(
        sql`SELECT status, COUNT(*) as cnt FROM jobs
            WHERE company_id = ${companyId} GROUP BY status`
      ) as unknown as [Array<{ status: string; cnt: number }>, unknown];
      let total = 0;
      for (const r of rows ?? []) {
        data.jobs.byStatus[r.status] = Number(r.cnt);
        total += Number(r.cnt);
      }
      data.jobs.total = total;
      return rows;
    }, [], warnings, moduleCounts);

    // Active jobs with no form submissions
    await safeQuery('jobs_no_forms', async () => {
      const [rows] = await db.execute(
        sql`SELECT j.id, j.job_number, j.name, j.status
            FROM jobs j
            WHERE j.company_id = ${companyId}
              AND j.status NOT IN ('Completed','Cancelled','Archived')
              AND NOT EXISTS (
                SELECT 1 FROM job_form_submissions jfs WHERE jfs.job_id = j.id
              )
            ORDER BY j.created_at DESC LIMIT 20`
      ) as unknown as [Array<{ id: number; job_number: string; name: string; status: string }>, unknown];
      data.jobs.noForms = rows ?? [];
      data.forms.jobsWithNoForms = (rows ?? []).length;
      return rows;
    }, [], warnings, moduleCounts);

    // Approved jobs with no progress lines
    await safeQuery('jobs_approved_no_progress', async () => {
      const [rows] = await db.execute(
        sql`SELECT j.id, j.job_number, j.name
            FROM jobs j
            WHERE j.company_id = ${companyId}
              AND j.status = 'Approved'
              AND NOT EXISTS (
                SELECT 1 FROM job_progress_lines p WHERE p.job_id = j.id
              )
            ORDER BY j.created_at DESC LIMIT 20`
      ) as unknown as [Array<{ id: number; job_number: string; name: string }>, unknown];
      data.jobs.approvedNoProgress = rows ?? [];
      return rows;
    }, [], warnings, moduleCounts);

    // Active jobs with no photos
    await safeQuery('jobs_no_photos', async () => {
      const [rows] = await db.execute(
        sql`SELECT j.id, j.job_number, j.name, j.status
            FROM jobs j
            WHERE j.company_id = ${companyId}
              AND j.status NOT IN ('Completed','Cancelled','Archived')
              AND NOT EXISTS (
                SELECT 1 FROM job_photos p WHERE p.job_id = j.id
              )
            ORDER BY j.created_at DESC LIMIT 20`
      ) as unknown as [Array<{ id: number; job_number: string; name: string; status: string }>, unknown];
      data.jobs.noPhotos = rows ?? [];
      return rows;
    }, [], warnings, moduleCounts);

    // Active jobs with no files
    await safeQuery('jobs_no_files', async () => {
      const [rows] = await db.execute(
        sql`SELECT j.id, j.job_number, j.name, j.status
            FROM jobs j
            WHERE j.company_id = ${companyId}
              AND j.status NOT IN ('Completed','Cancelled','Archived')
              AND NOT EXISTS (
                SELECT 1 FROM company_files cf WHERE cf.job_id = j.id
              )
            ORDER BY j.created_at DESC LIMIT 20`
      ) as unknown as [Array<{ id: number; job_number: string; name: string; status: string }>, unknown];
      data.jobs.noFiles = rows ?? [];
      return rows;
    }, [], warnings, moduleCounts);

    // Stalled active jobs — no update in 14+ days
    await safeQuery('jobs_stalled', async () => {
      const [rows] = await db.execute(
        sql`SELECT j.id, j.job_number, j.name, j.status,
                   DATEDIFF(NOW(), j.updated_at) as days_since_update
            FROM jobs j
            WHERE j.company_id = ${companyId}
              AND j.status IN ('Active','In Progress','Approved')
              AND j.updated_at < ${ago14}
            ORDER BY j.updated_at ASC LIMIT 15`
      ) as unknown as [Array<{ id: number; job_number: string; name: string; status: string; days_since_update: number }>, unknown];
      data.jobs.stalled = (rows ?? []).map((r) => ({ ...r, days_since_update: Number(r.days_since_update) }));
      return rows;
    }, [], warnings, moduleCounts);
  }

  // ── To-dos ────────────────────────────────────────────────────────────────
  if (permissions.canJobs) {
    await safeQuery('todos_overdue', async () => {
      const [rows] = await db.execute(
        sql`SELECT t.id, t.title, j.name as job_name, t.due_date,
                   DATEDIFF(NOW(), t.due_date) as days_overdue
            FROM job_todos t
            JOIN jobs j ON j.id = t.job_id
            WHERE j.company_id = ${companyId}
              AND t.status = 'Open'
              AND t.due_date < ${today}
            ORDER BY t.due_date ASC LIMIT 30`
      ) as unknown as [Array<{ id: number; title: string; job_name: string; due_date: string; days_overdue: number }>, unknown];
      data.todos.overdue = (rows ?? []).map((r) => ({ ...r, days_overdue: Number(r.days_overdue) }));
      data.todos.overdueCount = data.todos.overdue.length;
      return rows;
    }, [], warnings, moduleCounts);

    await safeQuery('todos_today', async () => {
      const [rows] = await db.execute(
        sql`SELECT t.id, t.title, j.name as job_name, t.due_date
            FROM job_todos t
            JOIN jobs j ON j.id = t.job_id
            WHERE j.company_id = ${companyId}
              AND t.status = 'Open'
              AND t.due_date = ${today}
            ORDER BY t.title ASC LIMIT 20`
      ) as unknown as [Array<{ id: number; title: string; job_name: string; due_date: string }>, unknown];
      data.todos.dueToday = rows ?? [];
      data.todos.dueTodayCount = data.todos.dueToday.length;
      return rows;
    }, [], warnings, moduleCounts);
  }

  // ── Fleet ─────────────────────────────────────────────────────────────────
  if (permissions.canFleet) {
    await safeQuery('fleet_total', async () => {
      const [rows] = await db.execute(
        sql`SELECT COUNT(*) as cnt FROM fleet_assets
            WHERE company_id = ${companyId} AND archived = 0`
      ) as unknown as [Array<{ cnt: number }>, unknown];
      data.fleet.total = Number(rows?.[0]?.cnt ?? 0);
      return rows;
    }, [], warnings, moduleCounts);

    // Service overdue — service_date is a timestamp, compare date portion
    await safeQuery('fleet_service_overdue', async () => {
      const [rows] = await db.execute(
        sql`SELECT id, name, rego, DATE(service_date) as service_date,
                   DATEDIFF(NOW(), service_date) as days_overdue
            FROM fleet_assets
            WHERE company_id = ${companyId} AND archived = 0
              AND service_date IS NOT NULL AND DATE(service_date) < ${today}
            ORDER BY service_date ASC LIMIT 20`
      ) as unknown as [Array<{ id: number; name: string; rego: string | null; service_date: string; days_overdue: number }>, unknown];
      data.fleet.serviceOverdue = (rows ?? []).map((r) => ({ ...r, days_overdue: Number(r.days_overdue) }));
      return rows;
    }, [], warnings, moduleCounts);

    // Rego overdue
    await safeQuery('fleet_rego_overdue', async () => {
      const [rows] = await db.execute(
        sql`SELECT id, name, rego, DATE(rego_expiry) as rego_expiry,
                   DATEDIFF(NOW(), rego_expiry) as days_overdue
            FROM fleet_assets
            WHERE company_id = ${companyId} AND archived = 0
              AND rego_not_applicable = 0
              AND rego_expiry IS NOT NULL AND DATE(rego_expiry) < ${today}
            ORDER BY rego_expiry ASC LIMIT 20`
      ) as unknown as [Array<{ id: number; name: string; rego: string | null; rego_expiry: string; days_overdue: number }>, unknown];
      data.fleet.regoOverdue = (rows ?? []).map((r) => ({ ...r, days_overdue: Number(r.days_overdue) }));
      return rows;
    }, [], warnings, moduleCounts);

    // Service due in 14 days
    await safeQuery('fleet_service_due14', async () => {
      const [rows] = await db.execute(
        sql`SELECT id, name, rego, DATE(service_date) as service_date,
                   DATEDIFF(service_date, NOW()) as days_until
            FROM fleet_assets
            WHERE company_id = ${companyId} AND archived = 0
              AND service_date IS NOT NULL
              AND DATE(service_date) >= ${today} AND DATE(service_date) <= ${in14}
            ORDER BY service_date ASC LIMIT 20`
      ) as unknown as [Array<{ id: number; name: string; rego: string | null; service_date: string; days_until: number }>, unknown];
      data.fleet.serviceDue14 = (rows ?? []).map((r) => ({ ...r, days_until: Number(r.days_until) }));
      return rows;
    }, [], warnings, moduleCounts);

    // Rego due in 14 days
    await safeQuery('fleet_rego_due14', async () => {
      const [rows] = await db.execute(
        sql`SELECT id, name, rego, DATE(rego_expiry) as rego_expiry,
                   DATEDIFF(rego_expiry, NOW()) as days_until
            FROM fleet_assets
            WHERE company_id = ${companyId} AND archived = 0
              AND rego_not_applicable = 0
              AND rego_expiry IS NOT NULL
              AND DATE(rego_expiry) >= ${today} AND DATE(rego_expiry) <= ${in14}
            ORDER BY rego_expiry ASC LIMIT 20`
      ) as unknown as [Array<{ id: number; name: string; rego: string | null; rego_expiry: string; days_until: number }>, unknown];
      data.fleet.regoDue14 = (rows ?? []).map((r) => ({ ...r, days_until: Number(r.days_until) }));
      return rows;
    }, [], warnings, moduleCounts);

    // Open prestart flags — issue_needs_attention = 1
    await safeQuery('fleet_flags', async () => {
      const [rows] = await db.execute(
        sql`SELECT fa.name as asset_name, fp.issue_comment, fp.created_at as flagged_at
            FROM fleet_prestarts fp
            JOIN fleet_assets fa ON fa.id = fp.asset_id
            WHERE fp.company_id = ${companyId}
              AND fp.issue_needs_attention = 1
            ORDER BY fp.created_at DESC LIMIT 20`
      ) as unknown as [Array<{ asset_name: string; issue_comment: string; flagged_at: string }>, unknown];
      data.fleet.openFlags = rows ?? [];
      return rows;
    }, [], warnings, moduleCounts);

    // Days since last prestart
    await safeQuery('fleet_last_prestart', async () => {
      const [rows] = await db.execute(
        sql`SELECT MAX(created_at) as last_at FROM fleet_prestarts
            WHERE company_id = ${companyId}`
      ) as unknown as [Array<{ last_at: string | null }>, unknown];
      const lastAt = rows?.[0]?.last_at;
      data.fleet.noPrestartDays = lastAt ? daysBetween(lastAt, now) : 999; // 999 = table exists but no rows
      return rows;
    }, [], warnings, moduleCounts);
  }

  // ── Estimates ─────────────────────────────────────────────────────────────
  // Note: estimates table has no total_amount column — calculate from estimate_lines
  if (permissions.canEstimating) {
    await safeQuery('estimates_draft_long', async () => {
      const [rows] = await db.execute(
        sql`SELECT e.id, j.name as job_name, e.title,
                   DATEDIFF(NOW(), e.created_at) as days_in_draft,
                   COALESCE(SUM(CAST(el.quantity AS DECIMAL(10,2)) * CAST(el.rate AS DECIMAL(10,2))), 0) as amount
            FROM estimates e
            JOIN jobs j ON j.id = e.job_id
            LEFT JOIN estimate_lines el ON el.estimate_id = e.id
            WHERE j.company_id = ${companyId}
              AND e.status = 'Draft'
              AND e.created_at < ${ago14}
            GROUP BY e.id, j.name, e.title, e.created_at
            ORDER BY e.created_at ASC LIMIT 15`
      ) as unknown as [Array<{ id: number; job_name: string; title: string; days_in_draft: number; amount: number }>, unknown];
      data.estimates.draftTooLong = (rows ?? []).map((r) => ({
        ...r,
        days_in_draft: Number(r.days_in_draft),
        amount: permissions.seeDollars ? Number(r.amount) : undefined,
      }));
      return rows;
    }, [], warnings, moduleCounts);

    await safeQuery('estimates_pending', async () => {
      const [rows] = await db.execute(
        sql`SELECT e.id, j.name as job_name, e.title,
                   DATEDIFF(NOW(), e.updated_at) as days_pending,
                   COALESCE(SUM(CAST(el.quantity AS DECIMAL(10,2)) * CAST(el.rate AS DECIMAL(10,2))), 0) as amount
            FROM estimates e
            JOIN jobs j ON j.id = e.job_id
            LEFT JOIN estimate_lines el ON el.estimate_id = e.id
            WHERE j.company_id = ${companyId}
              AND e.status = 'Pending Approval'
            GROUP BY e.id, j.name, e.title, e.updated_at
            ORDER BY e.updated_at ASC LIMIT 15`
      ) as unknown as [Array<{ id: number; job_name: string; title: string; days_pending: number; amount: number }>, unknown];
      data.estimates.pendingApproval = (rows ?? []).map((r) => ({
        ...r,
        days_pending: Number(r.days_pending),
        amount: permissions.seeDollars ? Number(r.amount) : undefined,
      }));
      return rows;
    }, [], warnings, moduleCounts);
  }

  // ── Forms ─────────────────────────────────────────────────────────────────
  // job_form_submissions: template_id (not form_template_id), status = 'in_progress'
  if (permissions.canForms) {
    await safeQuery('forms_incomplete', async () => {
      const [rows] = await db.execute(
        sql`SELECT ft.name as form_name, j.name as job_name, jfs.created_at as submitted_at
            FROM job_form_submissions jfs
            JOIN form_templates ft ON ft.id = jfs.template_id
            JOIN jobs j ON j.id = jfs.job_id
            WHERE j.company_id = ${companyId}
              AND jfs.status = 'in_progress'
            ORDER BY jfs.created_at DESC LIMIT 20`
      ) as unknown as [Array<{ form_name: string; job_name: string; submitted_at: string }>, unknown];
      data.forms.incompleteSubmissions = rows ?? [];
      return rows;
    }, [], warnings, moduleCounts);
  }

  return data;
}

// ── System prompt builder ─────────────────────────────────────────────────────
export function buildAnnetteSystemPrompt(d: AnnetteData): string {
  const lines: string[] = [];
  const today = new Date(d.runAt).toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Australia/Brisbane',
  });

  lines.push(`You are Annette — the IWILLBUILD health-check assistant for ${d.companyName}.`);
  lines.push(`You're a switched-on, no-nonsense Aussie construction business analyst.`);
  lines.push(`You've just run a full scan of ${d.companyName}'s portal data and you're about to give them the straight guts of it.`);
  lines.push(`Today: ${today} (Brisbane time)`);
  lines.push('');
  lines.push(`## YOUR STYLE`);
  lines.push(`- Direct, practical, plain Australian English. No corporate waffle.`);
  lines.push(`- Lead with the most urgent stuff first — don't bury the critical items.`);
  lines.push(`- Use "you" and "your" — talk to the business owner directly.`);
  lines.push(`- Short, punchy sentences. Bullet points where possible.`);
  lines.push(`- If something's a real problem, say so clearly. Don't soften it.`);
  lines.push(`- If everything's fine in a section, say "All good here." — don't pad it out.`);
  lines.push('');
  lines.push(`## CRITICAL RULES (non-negotiable — walls stay up)`);
  lines.push(`1. NEVER invent, guess, or fabricate data. Only report what is in the data below.`);
  lines.push(`2. Always cite the source module (Source: Jobs / Source: Fleet / etc.).`);
  lines.push(`3. Clearly separate FACTS (from data) from SUGGESTIONS (your recommendations).`);
  lines.push(`4. For any WHS, building code, or legal compliance item, add: "⚠️ Verify with a competent person or current official standard."`);
  lines.push(`5. ${d.seeDollars ? 'Dollar amounts are included where available.' : 'Do NOT show dollar amounts — this user does not have the See Dollars permission.'}`);
  lines.push(`6. NEVER expose data from any other company. This report is for ${d.companyName} only.`);
  lines.push(`7. You are READ-ONLY. You can identify issues and recommend fixes — you cannot create, edit, delete, or sync records.`);
  lines.push('');

  lines.push(`=== ANALYSIS DATA ===`);
  lines.push('');

  // Jobs
  lines.push(`## JOBS (Source: Jobs)`);
  lines.push(`Total jobs: ${d.jobs.total}`);
  if (Object.keys(d.jobs.byStatus).length) {
    lines.push(`By status: ${Object.entries(d.jobs.byStatus).map(([s, c]) => `${s}: ${c}`).join(', ')}`);
  }
  if (d.jobs.stalled.length) {
    lines.push(`Stalled active jobs (no update in 14+ days): ${d.jobs.stalled.length}`);
    for (const j of d.jobs.stalled) {
      lines.push(`  - ${j.job_number} "${j.name}" [${j.status}] — ${j.days_since_update} days since last update`);
    }
  }
  if (d.jobs.approvedNoProgress.length) {
    lines.push(`Approved jobs with no progress tracking: ${d.jobs.approvedNoProgress.length}`);
    for (const j of d.jobs.approvedNoProgress) {
      lines.push(`  - ${j.job_number} "${j.name}"`);
    }
  }
  if (d.jobs.noForms.length) {
    lines.push(`Active jobs with no form submissions: ${d.jobs.noForms.length}`);
    for (const j of d.jobs.noForms.slice(0, 10)) {
      lines.push(`  - ${j.job_number} "${j.name}" [${j.status}]`);
    }
  }
  if (d.jobs.noPhotos.length) {
    lines.push(`Active jobs with no photos: ${d.jobs.noPhotos.length}`);
    for (const j of d.jobs.noPhotos.slice(0, 10)) {
      lines.push(`  - ${j.job_number} "${j.name}" [${j.status}]`);
    }
  }
  if (d.jobs.noFiles.length) {
    lines.push(`Active jobs with no files: ${d.jobs.noFiles.length}`);
    for (const j of d.jobs.noFiles.slice(0, 10)) {
      lines.push(`  - ${j.job_number} "${j.name}" [${j.status}]`);
    }
  }
  lines.push('');

  // To-dos
  lines.push(`## TO-DOS (Source: Jobs)`);
  lines.push(`Overdue: ${d.todos.overdueCount} | Due today: ${d.todos.dueTodayCount}`);
  if (d.todos.overdue.length) {
    lines.push(`Overdue items:`);
    for (const t of d.todos.overdue.slice(0, 15)) {
      lines.push(`  - "${t.title}" on job "${t.job_name}" — ${t.days_overdue} days overdue (due ${t.due_date})`);
    }
  }
  if (d.todos.dueToday.length) {
    lines.push(`Due today:`);
    for (const t of d.todos.dueToday) {
      lines.push(`  - "${t.title}" on job "${t.job_name}"`);
    }
  }
  lines.push('');

  // Fleet
  lines.push(`## FLEET (Source: Fleet)`);
  lines.push(`Total assets: ${d.fleet.total}`);
  if (d.fleet.serviceOverdue.length) {
    lines.push(`Service OVERDUE: ${d.fleet.serviceOverdue.length}`);
    for (const f of d.fleet.serviceOverdue) {
      lines.push(`  - ${f.name}${f.rego ? ` (${f.rego})` : ''} — service was due ${f.service_date} (${f.days_overdue} days ago)`);
    }
  }
  if (d.fleet.regoOverdue.length) {
    lines.push(`Rego EXPIRED: ${d.fleet.regoOverdue.length}`);
    for (const f of d.fleet.regoOverdue) {
      lines.push(`  - ${f.name}${f.rego ? ` (${f.rego})` : ''} — expired ${f.rego_expiry} (${f.days_overdue} days ago) ⚠️ Do not operate on public roads.`);
    }
  }
  if (d.fleet.serviceDue14.length) {
    lines.push(`Service due within 14 days: ${d.fleet.serviceDue14.length}`);
    for (const f of d.fleet.serviceDue14) {
      lines.push(`  - ${f.name} — due ${f.service_date} (in ${f.days_until} days)`);
    }
  }
  if (d.fleet.regoDue14.length) {
    lines.push(`Rego expiring within 14 days: ${d.fleet.regoDue14.length}`);
    for (const f of d.fleet.regoDue14) {
      lines.push(`  - ${f.name}${f.rego ? ` (${f.rego})` : ''} — expires ${f.rego_expiry} (in ${f.days_until} days)`);
    }
  }
  if (d.fleet.openFlags.length) {
    lines.push(`Open prestart flags (issues needing attention): ${d.fleet.openFlags.length}`);
    for (const f of d.fleet.openFlags) {
      lines.push(`  - ${f.asset_name}: "${f.issue_comment}" (flagged ${new Date(f.flagged_at).toLocaleDateString('en-AU')})`);
    }
  }
  if (d.fleet.noPrestartDays !== null && d.fleet.noPrestartDays >= 7) {
    lines.push(`Last prestart recorded: ${d.fleet.noPrestartDays >= 999 ? 'never (no prestart records found)' : `${d.fleet.noPrestartDays} days ago`}`);
  }
  lines.push('');

  // Estimates
  lines.push(`## ESTIMATES (Source: Estimates)`);
  if (d.estimates.draftTooLong.length) {
    lines.push(`Estimates stuck in Draft for 14+ days: ${d.estimates.draftTooLong.length}`);
    for (const e of d.estimates.draftTooLong) {
      const amt = d.seeDollars && e.amount != null ? ` — $${Number(e.amount).toLocaleString('en-AU')}` : '';
      lines.push(`  - "${e.title}" on job "${e.job_name}" — ${e.days_in_draft} days in draft${amt}`);
    }
  }
  if (d.estimates.pendingApproval.length) {
    lines.push(`Estimates awaiting approval: ${d.estimates.pendingApproval.length}`);
    for (const e of d.estimates.pendingApproval) {
      const amt = d.seeDollars && e.amount != null ? ` — $${Number(e.amount).toLocaleString('en-AU')}` : '';
      lines.push(`  - "${e.title}" on job "${e.job_name}" — ${e.days_pending} days waiting${amt}`);
    }
  }
  if (!d.estimates.draftTooLong.length && !d.estimates.pendingApproval.length) {
    lines.push(`No estimate issues found.`);
  }
  lines.push('');

  // Forms
  lines.push(`## FORMS (Source: Forms)`);
  if (d.forms.incompleteSubmissions.length) {
    lines.push(`Incomplete form submissions: ${d.forms.incompleteSubmissions.length}`);
    for (const f of d.forms.incompleteSubmissions) {
      lines.push(`  - "${f.form_name}" on job "${f.job_name}" — started ${new Date(f.submitted_at).toLocaleDateString('en-AU')}`);
    }
  } else {
    lines.push(`No incomplete form submissions.`);
  }
  lines.push('');

  // Warnings
  if (d.warnings.length) {
    lines.push(`## DATA WARNINGS (modules that failed to load)`);
    for (const w of d.warnings) lines.push(`  - ${w}`);
    lines.push('');
  }

  lines.push(`=== END OF DATA ===`);
  lines.push('');
  lines.push(`## REPORT FORMAT — FOLLOW THIS EXACTLY`);
  lines.push('');
  lines.push(`**IMPORTANT: Sort findings by priority — Critical/Urgent items FIRST, then Needs Attention, then Info/Missing.**`);
  lines.push(`**Never bury a critical finding below minor ones.**`);
  lines.push('');
  lines.push(`## 🔴 Urgent`);
  lines.push(`Items requiring immediate action today.`);
  lines.push(`Includes: overdue rego (⚠️ do not operate on public roads), expired compliance, critical prestart flags, severely overdue to-dos (7+ days), stalled high-value jobs.`);
  lines.push(`Format each as: • **[Asset/Job name]** — [what's wrong] — [days overdue] — Source: [module]`);
  lines.push(`If none: "Nothing urgent right now — she's looking alright."`);
  lines.push('');
  lines.push(`## 🟠 Needs Attention`);
  lines.push(`Items that need action this week but aren't critical yet.`);
  lines.push(`Includes: service due within 14 days, rego expiring within 14 days, stalled jobs, pending estimates, open prestart flags, to-dos due soon.`);
  lines.push(`Format each as: • **[Name]** — [what needs doing] — [timeframe] — Source: [module]`);
  lines.push(`If none: "Nothing pressing this week."`);
  lines.push('');
  lines.push(`## 🔵 Missing Information`);
  lines.push(`Jobs or records with gaps that could cause problems later.`);
  lines.push(`Includes: jobs with no forms, no photos, no files, no progress on approved jobs.`);
  lines.push(`Group by type. Include job numbers. Keep it brief.`);
  lines.push(`If none: "All records look complete."`);
  lines.push('');
  lines.push(`## ✅ Suggested Next Actions`);
  lines.push(`3–7 concrete, prioritised actions — most urgent first.`);
  lines.push(`Label each as: [FACT-BASED] (from data) or [SUGGESTION] (your recommendation).`);
  lines.push(`Be specific — name the job, asset, or form. Don't be vague.`);
  lines.push('');
  lines.push(`## 📊 Data Confidence`);
  lines.push(`Rate overall data completeness as High / Medium / Low with a one-sentence plain-English explanation.`);
  lines.push(`List any modules that failed to load (from warnings above).`);
  lines.push('');
  lines.push(`---`);
  lines.push(`Be direct and practical. No waffle. If a section has nothing to report, say so clearly — don't skip it.`);
  lines.push(`Aussie plain English throughout. The business owner is reading this on their phone on a job site.`);

  return lines.join('\n');
}

