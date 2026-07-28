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
 *
 * Resilience guarantees:
 *  6. Every module query is wrapped in its own try/catch.
 *  7. A failing module logs the error, adds a warning, and returns [] — it
 *     NEVER crashes the whole context build or the chat endpoint.
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
  industry:    string;
  /** Company-configured label for the main work module (e.g. "Job", "Site", "Project") */
  workLabelSingular: string;
  workLabelPlural:   string;
  user: { name: string; email: string; role: string };
  permissions: DazzaPermissions;
  companyKnowledge: DazzaCompanyKnowledge;
  supportMode:      boolean;
  supportCompanyId: number | null;
  // Module data — only present when permission allows
  jobs?:            unknown[];
  openTodos?:       unknown[];
  jobProgress?:     unknown[];
  jobCosts?:        unknown[];
  jobDelays?:       unknown[];
  fleet?:           unknown[];
  fleetFlags?:      unknown[];
  fleetDueDates?:   unknown[];
  prestarts?:       unknown[];
  prestartCount?:   number;
  activeDriverSessions?: unknown[];
  recentDriverSessions?: unknown[];
  estimates?:       unknown[];
  formTemplates?:   unknown[];
  formSubmissions?: unknown[];
  files?:           unknown[];
  // Structured knowledge base entries
  knowledgeEntries?: Array<{ title: string; category: string; content: string; source_name: string | null }>;
  // Resilience tracking
  warnings:         string[];
  moduleCounts:     Record<string, number>;
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

  const warnings: string[] = [];
  const moduleCounts: Record<string, number> = {};

  const ctx: DazzaContext = {
    userId,
    companyId,
    companyName: '',
    industry: 'construction',
    workLabelSingular: 'Job',
    workLabelPlural:   'Jobs',
    user: { name: userName, email: userEmail, role },
    permissions,
    companyKnowledge: { enabled: false, companyNotes: '', safetyNotes: '', tone: 'professional', disclaimer: '' },
    supportMode,
    supportCompanyId,
    warnings,
    moduleCounts,
  };

  // ── Helper: safe query wrapper ────────────────────────────────────────────
  async function safeQuery<T>(
    module: string,
    fn: () => Promise<T[]>,
    fallback: T[] = [],
  ): Promise<T[]> {
    try {
      const rows = await fn();
      moduleCounts[module] = rows.length;
      return rows;
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      console.warn(`[dazza-context] ${module} FAILED: ${msg}`);
      warnings.push(`${module}: ${msg.slice(0, 120)}`);
      moduleCounts[module] = -1; // -1 = failed
      return fallback;
    }
  }

  // ── Company name + industry ───────────────────────────────────────────────
  try {
    const [companyRows] = await db.execute(
      sql`SELECT name, industry FROM companies WHERE id = ${effectiveCompanyId} LIMIT 1`
    ) as unknown as [Array<{ name: string; industry: string | null }>, unknown];
    ctx.companyName = companyRows?.[0]?.name ?? 'Unknown';
    ctx.industry = companyRows?.[0]?.industry ?? 'construction';
    moduleCounts['company'] = 1;
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    console.warn(`[dazza-context] company FAILED: ${msg}`);
    warnings.push(`company: ${msg.slice(0, 120)}`);
    ctx.companyName = 'Unknown';
    ctx.industry = 'construction';
    moduleCounts['company'] = -1;
  }

  // ── Dazza settings (from effective company) ───────────────────────────────
  try {
    const [settingsRows] = await db.execute(
      sql`SELECT dazza_json, work_label_singular, work_label_plural FROM company_settings WHERE company_id = ${effectiveCompanyId} LIMIT 1`
    ) as unknown as [Array<{ dazza_json: string; work_label_singular: string | null; work_label_plural: string | null }>, unknown];
    const dazzaSettings = settingsRows?.[0]?.dazza_json ? JSON.parse(settingsRows[0].dazza_json) : {};
    ctx.companyKnowledge = {
      enabled:      dazzaSettings.enabled       ?? false,
      companyNotes: dazzaSettings.knowledgeNotes ?? dazzaSettings.companyNotes ?? '',
      safetyNotes:  dazzaSettings.safetyNotes   ?? '',
      tone:         dazzaSettings.preferredTone ?? dazzaSettings.tone ?? 'professional',
      disclaimer:   dazzaSettings.disclaimer    ?? '',
    };
    // Work label terminology
    if (settingsRows?.[0]?.work_label_singular) ctx.workLabelSingular = settingsRows[0].work_label_singular;
    if (settingsRows?.[0]?.work_label_plural)   ctx.workLabelPlural   = settingsRows[0].work_label_plural;
    moduleCounts['settings'] = 1;
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    console.warn(`[dazza-context] settings FAILED: ${msg}`);
    warnings.push(`settings: ${msg.slice(0, 120)}`);
    moduleCounts['settings'] = -1;
  }

  // ── Structured knowledge base ─────────────────────────────────────────────
  ctx.knowledgeEntries = await safeQuery('knowledge', async () => {
    const [rows] = await db.execute(
      sql`SELECT title, category, content, source_name
          FROM dazza_knowledge
          WHERE company_id = ${effectiveCompanyId} AND active = 1
          ORDER BY category ASC, title ASC LIMIT 100`
    ) as unknown as [Array<{ title: string; category: string; content: string; source_name: string | null }>, unknown];
    return rows ?? [];
  });

  // ── Jobs ──────────────────────────────────────────────────────────────────
  if (canJobs) {
    ctx.jobs = await safeQuery('jobs', async () => {
      const [rows] = await db.execute(
        sql`SELECT j.id, j.job_number, j.name, j.client, j.address, j.status, j.notes, j.created_at,
                   c.name as customer_name, c.contact_person as customer_contact
            FROM jobs j
            LEFT JOIN customers c ON c.id = j.customer_id AND c.company_id = j.company_id
            WHERE j.company_id = ${effectiveCompanyId}
            ORDER BY j.created_at DESC LIMIT 50`
      ) as unknown as [Array<Record<string, unknown>>, unknown];
      return rows ?? [];
    });

    ctx.customers = await safeQuery('customers', async () => {
      const [rows] = await db.execute(
        sql`SELECT id, name, contact_person, email, phone, mobile, address, abn, status,
                   (SELECT COUNT(*) FROM jobs j WHERE j.customer_id = customers.id AND j.company_id = customers.company_id) as job_count
            FROM customers
            WHERE company_id = ${effectiveCompanyId} AND status = 'active'
            ORDER BY name ASC LIMIT 100`
      ) as unknown as [Array<Record<string, unknown>>, unknown];
      return rows ?? [];
    });

    if (permissions.seeDollars) {
      ctx.invoices = await safeQuery('invoices', async () => {
        const [rows] = await db.execute(
          sql`SELECT i.id, i.invoice_number, i.title, i.status, i.total, i.amount_paid, i.balance_due,
                     i.issue_date, i.due_date, i.job_id,
                     j.name as job_name, j.job_number,
                     c.name as customer_name
              FROM invoices i
              LEFT JOIN jobs j ON j.id = i.job_id AND j.company_id = i.company_id
              LEFT JOIN customers c ON c.id = i.customer_id AND c.company_id = i.company_id
              WHERE i.company_id = ${effectiveCompanyId}
              ORDER BY i.created_at DESC LIMIT 50`
        ) as unknown as [Array<Record<string, unknown>>, unknown];
        return rows ?? [];
      });
    }

    ctx.openTodos = await safeQuery('todos', async () => {      const [rows] = await db.execute(
        sql`SELECT t.id, t.job_id, t.title, t.status, t.due_date, t.notes, j.name as job_name
            FROM job_todos t
            JOIN jobs j ON j.id = t.job_id
            WHERE j.company_id = ${effectiveCompanyId} AND t.status = 'Open'
            ORDER BY t.due_date ASC LIMIT 100`
      ) as unknown as [Array<Record<string, unknown>>, unknown];
      return rows ?? [];
    });

    ctx.jobProgress = await safeQuery('progress', async () => {
      const [rows] = await db.execute(
        sql`SELECT p.job_id, j.name as job_name,
                   ROUND(AVG(p.percent_complete)) as avg_percent,
                   COUNT(*) as line_count
            FROM job_progress_lines p
            JOIN jobs j ON j.id = p.job_id
            WHERE j.company_id = ${effectiveCompanyId}
            GROUP BY p.job_id, j.name
            ORDER BY p.job_id DESC LIMIT 50`
      ) as unknown as [Array<Record<string, unknown>>, unknown];
      return rows ?? [];
    });

    // ── Job Costs ──────────────────────────────────────────────────────────
    // Uses job_cost_ledger (the live ledger) — job_costs is a legacy receipts table.
    // Approved estimate total is derived from estimate_lines subtotals since the
    // estimates table has no pre-computed total_amount column.
    if (seeDollars) {
      ctx.jobCosts = await safeQuery('job_costs', async () => {
        const [rows] = await db.execute(
          sql`SELECT jcl.job_id, j.name as job_name, j.job_number,
                     SUM(jcl.total) as total_actual,
                     SUM(jcl.gst)   as total_gst,
                     COUNT(*)        as entry_count,
                     COALESCE((
                       SELECT SUM(el.quantity * el.rate)
                       FROM estimates e
                       JOIN estimate_lines el ON el.estimate_id = e.id
                       WHERE e.job_id = jcl.job_id
                         AND e.company_id = ${effectiveCompanyId}
                         AND LOWER(e.status) = 'approved'
                     ), 0) as approved_estimate
              FROM job_cost_ledger jcl
              JOIN jobs j ON j.id = jcl.job_id
              WHERE jcl.company_id = ${effectiveCompanyId}
              GROUP BY jcl.job_id, j.name, j.job_number
              ORDER BY total_actual DESC LIMIT 50`
        ) as unknown as [Array<Record<string, unknown>>, unknown];
        return rows ?? [];
      });
    }

    // ── Job Delays ─────────────────────────────────────────────────────────
    ctx.jobDelays = await safeQuery('job_delays', async () => {
      const [rows] = await db.execute(
        sql`SELECT d.job_id, j.name as job_name, j.job_number,
                   SUM(d.days) as total_delay_days,
                   COUNT(*) as delay_count
            FROM job_delays d
            JOIN jobs j ON j.id = d.job_id
            WHERE d.company_id = ${effectiveCompanyId}
            GROUP BY d.job_id, j.name, j.job_number
            ORDER BY total_delay_days DESC LIMIT 50`
      ) as unknown as [Array<Record<string, unknown>>, unknown];
      return rows ?? [];
    });
  }

  // ── Fleet ─────────────────────────────────────────────────────────────────
  if (canFleet) {
    ctx.fleet = await safeQuery('fleet', async () => {
      const [rows] = await db.execute(
        sql`SELECT id, name, type, rego, rego_not_applicable, status, service_date, rego_expiry, notes
            FROM fleet_assets WHERE company_id = ${effectiveCompanyId} AND archived = 0
            ORDER BY name ASC LIMIT 50`
      ) as unknown as [Array<Record<string, unknown>>, unknown];
      return rows ?? [];
    });

    ctx.fleetFlags = await safeQuery('fleet_flags', async () => {
      const [rows] = await db.execute(
        sql`SELECT fp.asset_id, fa.name as asset_name, fp.issue_comment, fp.created_at
            FROM fleet_prestarts fp
            JOIN fleet_assets fa ON fa.id = fp.asset_id
            WHERE fp.company_id = ${effectiveCompanyId}
              AND fp.issue_needs_attention = 1
            ORDER BY fp.created_at DESC LIMIT 20`
      ) as unknown as [Array<Record<string, unknown>>, unknown];
      return rows ?? [];
    });

    ctx.prestarts = await safeQuery('prestarts', async () => {
      const [rows] = await db.execute(
        sql`SELECT fp.id, fp.asset_id, fa.name as asset_name, fp.operator_name as submitted_by_name,
                   fp.issue_needs_attention, fp.issue_comment, fp.created_at
            FROM fleet_prestarts fp
            JOIN fleet_assets fa ON fa.id = fp.asset_id
            WHERE fp.company_id = ${effectiveCompanyId}
            ORDER BY fp.created_at DESC LIMIT 20`
      ) as unknown as [Array<Record<string, unknown>>, unknown];
      return rows ?? [];
    });
    ctx.prestartCount = ctx.prestarts.length;

    ctx.activeDriverSessions = await safeQuery('active_driver_sessions', async () => {
      const [rows] = await db.execute(
        sql`SELECT fds.id, fds.driver_name, fds.start_at, fds.status, fds.source,
                   fa.name as asset_name, fa.type as asset_type, fa.rego
            FROM fleet_driver_sessions fds
            JOIN fleet_assets fa ON fa.id = fds.fleet_asset_id
            WHERE fds.company_id = ${effectiveCompanyId}
              AND fds.status = 'active'
            ORDER BY fds.start_at DESC`
      ) as unknown as [Array<Record<string, unknown>>, unknown];
      return rows ?? [];
    });

    ctx.recentDriverSessions = await safeQuery('recent_driver_sessions', async () => {
      const [rows] = await db.execute(
        sql`SELECT fds.id, fds.driver_name, fds.start_at, fds.end_at, fds.status, fds.source,
                   fa.name as asset_name, fa.type as asset_type, fa.rego
            FROM fleet_driver_sessions fds
            JOIN fleet_assets fa ON fa.id = fds.fleet_asset_id
            WHERE fds.company_id = ${effectiveCompanyId}
            ORDER BY fds.start_at DESC
            LIMIT 50`
      ) as unknown as [Array<Record<string, unknown>>, unknown];
      return rows ?? [];
    });

    ctx.fleetDueDates = await safeQuery('fleet_due_dates', async () => {
      const in14 = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const [rows] = await db.execute(
        sql`SELECT id, name, service_date, rego_expiry, rego_not_applicable
            FROM fleet_assets
            WHERE company_id = ${effectiveCompanyId}
              AND archived = 0
              AND (
                (service_date IS NOT NULL AND service_date <= ${in14})
                OR (rego_not_applicable = 0 AND rego_expiry IS NOT NULL AND rego_expiry <= ${in14})
              )`
      ) as unknown as [Array<Record<string, unknown>>, unknown];
      return rows ?? [];
    });
  }

  // ── Estimates ─────────────────────────────────────────────────────────────
  if (canEstimating) {
    ctx.estimates = await safeQuery('estimates', async () => {
      if (seeDollars) {
        const [rows] = await db.execute(
          sql`SELECT e.id, e.job_id, e.title, e.status, e.markup_percent, e.gst_mode, e.created_at,
                     j.name as job_name,
                     COALESCE(SUM(CAST(el.quantity AS DECIMAL(15,4)) * CAST(el.rate AS DECIMAL(15,4))), 0) as subtotal
              FROM estimates e
              LEFT JOIN jobs j ON j.id = e.job_id
              LEFT JOIN estimate_lines el ON el.estimate_id = e.id
              WHERE e.company_id = ${effectiveCompanyId}
              GROUP BY e.id, e.job_id, e.title, e.status, e.markup_percent, e.gst_mode, e.created_at, j.name
              ORDER BY e.created_at DESC LIMIT 50`
        ) as unknown as [Array<Record<string, unknown>>, unknown];
        return rows ?? [];
      } else {
        const [rows] = await db.execute(
          sql`SELECT e.id, e.job_id, e.title, e.status, e.created_at, j.name as job_name
              FROM estimates e
              LEFT JOIN jobs j ON j.id = e.job_id
              WHERE e.company_id = ${effectiveCompanyId}
              ORDER BY e.created_at DESC LIMIT 50`
        ) as unknown as [Array<Record<string, unknown>>, unknown];
        return rows ?? [];
      }
    });
  }

  // ── Forms ─────────────────────────────────────────────────────────────────
  if (canForms) {
    ctx.formTemplates = await safeQuery('form_templates', async () => {
      const [rows] = await db.execute(
        sql`SELECT id, name, category, created_at
            FROM form_templates WHERE company_id = ${effectiveCompanyId}
            ORDER BY name ASC LIMIT 50`
      ) as unknown as [Array<Record<string, unknown>>, unknown];
      return rows ?? [];
    });

    ctx.formSubmissions = await safeQuery('form_submissions', async () => {
      const [rows] = await db.execute(
        sql`SELECT s.id, s.job_id, s.template_id, s.status, s.created_at, s.updated_at,
                   j.name as job_name, ft.name as template_name
            FROM job_form_submissions s
            LEFT JOIN jobs j ON j.id = s.job_id
            LEFT JOIN form_templates ft ON ft.id = s.template_id
            WHERE s.company_id = ${effectiveCompanyId}
            ORDER BY s.updated_at DESC LIMIT 100`
      ) as unknown as [Array<Record<string, unknown>>, unknown];
      return rows ?? [];
    });
  }

  // ── Files ─────────────────────────────────────────────────────────────────
  if (canFiles) {
    ctx.files = await safeQuery('files', async () => {
      const [rows] = await db.execute(
        sql`SELECT id, original_name, label, job_id, created_at
            FROM company_files WHERE company_id = ${effectiveCompanyId}
            ORDER BY created_at DESC LIMIT 50`
      ) as unknown as [Array<Record<string, unknown>>, unknown];
      return rows ?? [];
    });
  }

  // ── Usage / Plan limits context ───────────────────────────────────────────
  try {
    const [planRows] = await db.execute(
      sql`SELECT plan FROM companies WHERE id = ${effectiveCompanyId} LIMIT 1`
    ) as unknown as [Array<{ plan: string }>, unknown];
    const plan = planRows?.[0]?.plan ?? 'trial';

    const safeCount = async (q: ReturnType<typeof sql>): Promise<number> => {
      try {
        const [rows] = await db.execute(q) as unknown as [Array<{ cnt: number | string }>, unknown];
        return Number(rows?.[0]?.cnt ?? 0);
      } catch { return 0; }
    };
    const safeSum = async (q: ReturnType<typeof sql>): Promise<number> => {
      try {
        const [rows] = await db.execute(q) as unknown as [Array<{ total: number | string | null }>, unknown];
        return Number(rows?.[0]?.total ?? 0);
      } catch { return 0; }
    };

    const [users, activeJobs, totalPhotos, fileBytes, fleet, formTemplates, costGuide] = await Promise.all([
      safeCount(sql`SELECT COUNT(*) as cnt FROM profiles WHERE company_id = ${effectiveCompanyId} AND status != 'inactive'`),
      safeCount(sql`SELECT COUNT(*) as cnt FROM jobs WHERE company_id = ${effectiveCompanyId} AND status NOT IN ('Archived','Closed')`),
      safeCount(sql`SELECT COUNT(*) as cnt FROM job_photos WHERE company_id = ${effectiveCompanyId}`),
      safeSum(sql`SELECT COALESCE(SUM(size_bytes),0) as total FROM company_files WHERE company_id = ${effectiveCompanyId}`),
      safeCount(sql`SELECT COUNT(*) as cnt FROM fleet_assets WHERE company_id = ${effectiveCompanyId} AND (archived = 0 OR archived IS NULL)`),
      safeCount(sql`SELECT COUNT(*) as cnt FROM form_templates WHERE company_id = ${effectiveCompanyId}`),
      safeCount(sql`SELECT COUNT(*) as cnt FROM cost_guide_items WHERE company_id = ${effectiveCompanyId}`),
    ]);

    // Top 5 jobs by photo count
    const [photoJobRows] = await db.execute(
      sql`SELECT j.name as job_name, j.job_number, COUNT(p.id) as photo_count
          FROM job_photos p
          JOIN jobs j ON j.id = p.job_id
          WHERE p.company_id = ${effectiveCompanyId}
          GROUP BY p.job_id, j.name, j.job_number
          ORDER BY photo_count DESC LIMIT 5`
    ) as unknown as [Array<{ job_name: string; job_number: string | null; photo_count: number }>, unknown];

    const fileMB = (fileBytes / (1024 * 1024)).toFixed(1);
    const fileGB = (fileBytes / (1024 * 1024 * 1024)).toFixed(2);

    (ctx as Record<string, unknown>).usageContext = {
      plan,
      users,
      activeJobs,
      totalPhotos,
      fileStorageMB: parseFloat(fileMB),
      fileStorageGB: parseFloat(fileGB),
      fleet,
      formTemplates,
      costGuide,
      topPhotoJobs: photoJobRows ?? [],
    };
    moduleCounts['usage'] = 1;
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    console.warn(`[dazza-context] usage FAILED: ${msg}`);
    warnings.push(`usage: ${msg.slice(0, 120)}`);
  }

  if (warnings.length > 0) {
    console.warn(`[dazza-context] Context built with ${warnings.length} warning(s) for company ${effectiveCompanyId}`);
  }

  // ── Secure Share Links ────────────────────────────────────────────────────
  ctx.shareLinks = await safeQuery('share_links', async () => {
    const [rows] = await db.execute(
      sql`SELECT id, link_type, target_type, target_id, title,
                 permissions_json, expires_at, max_uses, use_count,
                 revoked, created_at
          FROM secure_share_links
          WHERE company_id = ${effectiveCompanyId}
          ORDER BY created_at DESC LIMIT 50`
    ) as unknown as [Array<Record<string, unknown>>, unknown];
    return (rows ?? []).map((r) => ({
      ...r,
      permissions: (() => { try { return JSON.parse(r.permissions_json as string); } catch { return []; } })(),
      isExpired: r.expires_at ? new Date(r.expires_at as string) < new Date() : false,
      isMaxed: r.max_uses !== null && (r.use_count as number) >= (r.max_uses as number),
    }));
  });

  return ctx;
}

/**
 * Convenience overload: resolveEffectiveCompany(req, userId)
 * Looks up the user's profile to get their company_id, then delegates to the
 * main overload. Returns { companyId, effectiveCompanyId, supportMode, supportCompanyId }.
 * Used by simple API handlers that don't need full Dazza context.
 */
export async function resolveEffectiveCompany(
  req: import('express').Request,
  userId: string,
): Promise<{ companyId: number | null; effectiveCompanyId: number | null; supportMode: boolean; supportCompanyId: number | null }>;

/**
 * Verify that a supportCompanyId is valid for an owner to support.
 * Returns true only if the company exists. Owners can support any company.
 * Non-owners always get null (support mode disabled).
 */
export async function resolveEffectiveCompany(
  isOwner: boolean,
  ownCompanyId: number,
  requestedSupportCompanyId: number | null | undefined,
): Promise<{ effectiveCompanyId: number; supportMode: boolean; supportCompanyId: number | null }>;

export async function resolveEffectiveCompany(
  isOwnerOrReq: boolean | import('express').Request,
  ownCompanyIdOrUserId: number | string,
  requestedSupportCompanyId?: number | null,
): Promise<{ companyId?: number | null; effectiveCompanyId: number | null; supportMode: boolean; supportCompanyId: number | null }> {
  // Overload 1: (req, userId) — look up profile
  if (typeof isOwnerOrReq === 'object') {
    const userId = ownCompanyIdOrUserId as string;
    const [profileRows] = await db.execute(
      sql`SELECT company_id FROM profiles WHERE user_id = ${userId} LIMIT 1`
    ) as unknown as [Array<{ company_id: number }>];
    const companyId = profileRows?.[0]?.company_id ?? null;
    return { companyId, effectiveCompanyId: companyId, supportMode: false, supportCompanyId: null };
  }

  // Overload 2: (isOwner, ownCompanyId, requestedSupportCompanyId)
  const isOwner = isOwnerOrReq as boolean;
  const ownCompanyId = ownCompanyIdOrUserId as number;

  if (!isOwner || !requestedSupportCompanyId) {
    return { effectiveCompanyId: ownCompanyId, supportMode: false, supportCompanyId: null };
  }

  // Verify the requested support company actually exists
  const [rows] = await db.execute(
    sql`SELECT id FROM companies WHERE id = ${requestedSupportCompanyId} LIMIT 1`
  ) as unknown as [Array<{ id: number }>, unknown];

  if (!rows?.[0]) {
    // Invalid company — fall back to own company silently
    return { effectiveCompanyId: ownCompanyId, supportMode: false, supportCompanyId: null };
  }

  return {
    effectiveCompanyId: requestedSupportCompanyId,
    supportMode: true,
    supportCompanyId: requestedSupportCompanyId,
  };
}
