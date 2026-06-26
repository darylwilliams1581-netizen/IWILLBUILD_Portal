/**
 * buildDazzaContext()
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for all Dazza data loading.
 * Called server-side only — NEVER trusts client-supplied context.
 *
 * Security guarantees:
 *  1. Every query is scoped to companyId derived from the authenticated session.
 *  2. permDazzaAi is checked before this function is called (callers enforce it).
 *  3. seeDollars is enforced here — dollar data is never included when false.
 *  4. Each module is gated by its own permission flag.
 *  5. Support Mode is explicit — caller passes supportCompanyId only when the
 *     owner has explicitly selected a support company. Normal mode always uses
 *     the owner's own companyId.
 */
import { db } from '../db/client.js';
import { sql } from 'drizzle-orm';

export interface DazzaPermissions {
  canJobs:       boolean;
  canFleet:      boolean;
  canForms:      boolean;
  canEstimating: boolean;
  canFiles:      boolean;
  seeDollars:    boolean;
  isAdmin:       boolean;
  isOwner:       boolean;
  canDazzaAi:    boolean;
}

export interface DazzaCompanyKnowledge {
  enabled:      boolean;
  companyNotes: string;
  safetyNotes:  string;
  tone:         string;
  disclaimer:   string;
}

export interface DazzaContext {
  userId:      string;
  companyId:   number;
  companyName: string;
  user: { name: string; email: string; role: string };
  permissions: DazzaPermissions;
  companyKnowledge: DazzaCompanyKnowledge;
  supportMode:      boolean;
  supportCompanyId: number | null;
  // Module data — only present when permission allows
  jobs?:            unknown[];
  openTodos?:       unknown[];
  jobProgress?:     unknown[];
  fleet?:           unknown[];
  fleetFlags?:      unknown[];
  fleetDueDates?:   unknown[];
  estimates?:       unknown[];
  formTemplates?:   unknown[];
  formSubmissions?: unknown[];
  files?:           unknown[];
}

/**
 * Derive permissions from a profile row.
 * Owner always has everything. Admin (role or perm) always has everything.
 */
export function derivePermissions(profile: {
  role: string | null;
  permAdmin: boolean | null;
  permJobs: boolean | null;
  permFleet: boolean | null;
  permForms: boolean | null;
  permFiles: boolean | null;
  permEstimating: boolean | null;
  permDazzaAi: boolean | null;
  permSeeDollars: boolean | null;
}): DazzaPermissions {
  const role    = profile.role ?? 'worker';
  const isOwner = role === 'owner';
  const isAdmin = isOwner || role === 'admin' || profile.permAdmin === true;

  return {
    isOwner,
    isAdmin,
    canDazzaAi:    isAdmin || profile.permDazzaAi    !== false,
    canJobs:       isAdmin || profile.permJobs        !== false,
    canFleet:      isAdmin || profile.permFleet       !== false,
    canForms:      isAdmin || profile.permForms       !== false,
    canEstimating: isAdmin || profile.permEstimating  !== false,
    canFiles:      isAdmin || profile.permFiles       !== false,
    seeDollars:    isAdmin || profile.permSeeDollars  === true,
  };
}

/**
 * Load all Dazza context for a given companyId + permissions.
 * The companyId MUST come from the authenticated session — never from the client.
 *
 * @param userId          - authenticated user id (for audit)
 * @param userEmail       - authenticated user email
 * @param userName        - authenticated user name
 * @param role            - authenticated user role
 * @param companyId       - company from session profile (never from client)
 * @param permissions     - derived server-side from profile
 * @param supportCompanyId - only set when owner explicitly selected support company
 */
export async function buildDazzaContext(
  userId: string,
  userEmail: string,
  userName: string,
  role: string,
  companyId: number,
  permissions: DazzaPermissions,
  supportCompanyId: number | null = null,
): Promise<DazzaContext> {
  const { canJobs, canFleet, canForms, canEstimating, canFiles, seeDollars } = permissions;

  // The effective company for data queries:
  // - Normal mode: always the user's own companyId
  // - Support Mode: the explicitly selected support company (owner only)
  const effectiveCompanyId = supportCompanyId ?? companyId;
  const supportMode = supportCompanyId !== null;

  const ctx: DazzaContext = {
    userId,
    companyId,
    companyName: '',
    user: { name: userName, email: userEmail, role },
    permissions,
    companyKnowledge: { enabled: false, companyNotes: '', safetyNotes: '', tone: 'professional', disclaimer: '' },
    supportMode,
    supportCompanyId,
  };

  // ── Company name ──────────────────────────────────────────────────────────
  const companyRows = await db.execute(
    sql`SELECT name FROM companies WHERE id = ${effectiveCompanyId} LIMIT 1`
  ) as unknown as Array<{ name: string }>;
  ctx.companyName = companyRows[0]?.name ?? 'Unknown';

  // ── Dazza settings (from effective company) ───────────────────────────────
  const settingsRows = await db.execute(
    sql`SELECT dazza_json FROM company_settings WHERE company_id = ${effectiveCompanyId} LIMIT 1`
  ) as unknown as Array<{ dazza_json: string }>;
  const dazzaSettings = settingsRows[0]?.dazza_json ? JSON.parse(settingsRows[0].dazza_json) : {};
  ctx.companyKnowledge = {
    enabled:      dazzaSettings.enabled      ?? false,
    companyNotes: dazzaSettings.companyNotes ?? '',
    safetyNotes:  dazzaSettings.safetyNotes  ?? '',
    tone:         dazzaSettings.tone         ?? 'professional',
    disclaimer:   dazzaSettings.disclaimer   ?? '',
  };

  // ── Jobs ──────────────────────────────────────────────────────────────────
  if (canJobs) {
    const jobRows = await db.execute(
      sql`SELECT id, job_number, name, client, address, status, notes, created_at
          FROM jobs WHERE company_id = ${effectiveCompanyId}
          ORDER BY created_at DESC LIMIT 50`
    ) as unknown as Array<Record<string, unknown>>;
    ctx.jobs = jobRows;

    const todoRows = await db.execute(
      sql`SELECT t.id, t.job_id, t.title, t.status, t.due_date, t.notes, j.name as job_name
          FROM job_todos t
          JOIN jobs j ON j.id = t.job_id
          WHERE j.company_id = ${effectiveCompanyId} AND t.status = 'Open'
          ORDER BY t.due_date ASC LIMIT 100`
    ) as unknown as Array<Record<string, unknown>>;
    ctx.openTodos = todoRows;

    const progressRows = await db.execute(
      sql`SELECT p.job_id, j.name as job_name,
                 ROUND(AVG(p.percent_complete)) as avg_percent,
                 COUNT(*) as line_count
          FROM job_progress_lines p
          JOIN jobs j ON j.id = p.job_id
          WHERE j.company_id = ${effectiveCompanyId}
          GROUP BY p.job_id, j.name
          ORDER BY p.job_id DESC LIMIT 50`
    ) as unknown as Array<Record<string, unknown>>;
    ctx.jobProgress = progressRows;
  }

  // ── Fleet ─────────────────────────────────────────────────────────────────
  if (canFleet) {
    const fleetRows = await db.execute(
      sql`SELECT id, name, asset_type, rego, status, service_date, rego_expiry, rego_not_applicable, notes
          FROM fleet_assets WHERE company_id = ${effectiveCompanyId} AND archived = 0
          ORDER BY name ASC LIMIT 50`
    ) as unknown as Array<Record<string, unknown>>;
    ctx.fleet = fleetRows;

    const flagRows = await db.execute(
      sql`SELECT fp.asset_id, fa.name as asset_name, fp.issue_comment, fp.created_at
          FROM fleet_prestarts fp
          JOIN fleet_assets fa ON fa.id = fp.asset_id
          WHERE fa.company_id = ${effectiveCompanyId}
            AND fp.issue_needs_attention = 1
          ORDER BY fp.created_at DESC LIMIT 20`
    ) as unknown as Array<Record<string, unknown>>;
    ctx.fleetFlags = flagRows;

    const in14 = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const dueDateRows = await db.execute(
      sql`SELECT id, name, service_date, rego_expiry, rego_not_applicable
          FROM fleet_assets
          WHERE company_id = ${effectiveCompanyId}
            AND archived = 0
            AND (
              (service_date IS NOT NULL AND service_date <= ${in14})
              OR (rego_not_applicable = 0 AND rego_expiry IS NOT NULL AND rego_expiry <= ${in14})
            )`
    ) as unknown as Array<Record<string, unknown>>;
    ctx.fleetDueDates = dueDateRows;
  }

  // ── Estimates ─────────────────────────────────────────────────────────────
  // seeDollars is enforced here — subtotals are never included when false.
  if (canEstimating) {
    let estRows: Array<Record<string, unknown>>;
    if (seeDollars) {
      estRows = await db.execute(
        sql`SELECT e.id, e.job_id, e.title, e.status, e.markup_percent, e.gst_mode, e.created_at,
                   j.name as job_name,
                   COALESCE(SUM(CAST(el.quantity AS DECIMAL(15,4)) * CAST(el.rate AS DECIMAL(15,4))), 0) as subtotal
            FROM estimates e
            LEFT JOIN jobs j ON j.id = e.job_id
            LEFT JOIN estimate_lines el ON el.estimate_id = e.id
            WHERE e.company_id = ${effectiveCompanyId}
            GROUP BY e.id, e.job_id, e.title, e.status, e.markup_percent, e.gst_mode, e.created_at, j.name
            ORDER BY e.created_at DESC LIMIT 50`
      ) as unknown as Array<Record<string, unknown>>;
    } else {
      // No dollar fields at all — not even markup or gst_mode
      estRows = await db.execute(
        sql`SELECT e.id, e.job_id, e.title, e.status, e.created_at, j.name as job_name
            FROM estimates e
            LEFT JOIN jobs j ON j.id = e.job_id
            WHERE e.company_id = ${effectiveCompanyId}
            ORDER BY e.created_at DESC LIMIT 50`
      ) as unknown as Array<Record<string, unknown>>;
    }
    ctx.estimates = estRows;
  }

  // ── Forms ─────────────────────────────────────────────────────────────────
  if (canForms) {
    const templateRows = await db.execute(
      sql`SELECT id, name, category, created_at
          FROM form_templates WHERE company_id = ${effectiveCompanyId}
          ORDER BY name ASC LIMIT 50`
    ) as unknown as Array<Record<string, unknown>>;
    ctx.formTemplates = templateRows;

    const submissionRows = await db.execute(
      sql`SELECT s.id, s.job_id, s.template_id, s.status, s.created_at, s.updated_at,
                 j.name as job_name, ft.name as template_name
          FROM job_form_submissions s
          LEFT JOIN jobs j ON j.id = s.job_id
          LEFT JOIN form_templates ft ON ft.id = s.template_id
          WHERE s.company_id = ${effectiveCompanyId}
          ORDER BY s.updated_at DESC LIMIT 100`
    ) as unknown as Array<Record<string, unknown>>;
    ctx.formSubmissions = submissionRows;
  }

  // ── Files ─────────────────────────────────────────────────────────────────
  if (canFiles) {
    const fileRows = await db.execute(
      sql`SELECT id, original_name, label, job_id, created_at
          FROM company_files WHERE company_id = ${effectiveCompanyId}
          ORDER BY created_at DESC LIMIT 50`
    ) as unknown as Array<Record<string, unknown>>;
    ctx.files = fileRows;
  }

  return ctx;
}

/**
 * Verify that a supportCompanyId is valid for an owner to support.
 * Returns true only if the company exists. Owners can support any company.
 * Non-owners always get null (support mode disabled).
 */
export async function resolveEffectiveCompany(
  isOwner: boolean,
  ownCompanyId: number,
  requestedSupportCompanyId: number | null | undefined,
): Promise<{ effectiveCompanyId: number; supportMode: boolean; supportCompanyId: number | null }> {
  if (!isOwner || !requestedSupportCompanyId) {
    return { effectiveCompanyId: ownCompanyId, supportMode: false, supportCompanyId: null };
  }

  // Verify the requested support company actually exists
  const rows = await db.execute(
    sql`SELECT id FROM companies WHERE id = ${requestedSupportCompanyId} LIMIT 1`
  ) as unknown as Array<{ id: number }>;

  if (!rows[0]) {
    // Invalid company — fall back to own company silently
    return { effectiveCompanyId: ownCompanyId, supportMode: false, supportCompanyId: null };
  }

  return {
    effectiveCompanyId: requestedSupportCompanyId,
    supportMode: true,
    supportCompanyId: requestedSupportCompanyId,
  };
}
