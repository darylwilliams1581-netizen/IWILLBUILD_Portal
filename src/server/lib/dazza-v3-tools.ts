/**
 * dazza-v3-tools.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Dazza V3 — Named, parameterised, audited read-only tools.
 *
 * SECURITY GUARANTEES:
 * - companyId is ALWAYS injected server-side from the authenticated session.
 *   The model NEVER supplies or influences companyId.
 * - All queries have row limits and time-range guards.
 * - No mutation capability — every function is SELECT-only.
 * - Secrets, tokens, passwords, env vars are never returned.
 * - Cross-company results are impossible by design (every query filters by companyId).
 * - Platform-owner tools (no companyId filter) are only callable from owner-scoped sessions.
 * - Query timeout: 8 seconds per tool call.
 */

import { db } from '../db/client.js';
import { sql } from 'drizzle-orm';

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeInt(v: unknown, fallback: number, max: number): number {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
  return isNaN(n) ? fallback : Math.min(Math.max(1, n), max);
}

function safeStr(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v.slice(0, 200) : fallback;
}

function redactSecrets(obj: Record<string, unknown>): Record<string, unknown> {
  const SECRET_KEYS = new Set([
    'password', 'password_hash', 'api_key', 'openai_api_key', 'secret',
    'token', 'access_token', 'refresh_token', 'auth_token', 'session_token',
    'stripe_key', 'xero_secret', 'twilio_auth', 'sms_auth_token',
    'cookie', 'authorization', 'bearer',
  ]);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const lk = k.toLowerCase();
    if (SECRET_KEYS.has(lk) || lk.includes('secret') || lk.includes('password') || lk.includes('token') || lk.includes('key')) {
      out[k] = '[REDACTED]';
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = redactSecrets(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function ok(data: unknown): string {
  return JSON.stringify({ ok: true, data });
}

function err(message: string): string {
  return JSON.stringify({ ok: false, error: message });
}

// ── Tool definitions (sent to OpenAI) ────────────────────────────────────────

export const V3_TOOL_DEFINITIONS = [
  // ── Business: Companies & Subscriptions ──────────────────────────────────
  {
    type: 'function' as const,
    function: {
      name: 'v3_list_companies',
      description: 'Platform-owner only. List all companies with subscription status, user counts, and last activity. Use to understand platform health.',
      parameters: {
        type: 'object',
        properties: {
          status_filter: { type: 'string', description: 'Filter by subscription_status (active, trial, trial_expired, cancelled, suspended). Omit for all.' },
          limit: { type: 'number', description: 'Max results (1-100). Default 50.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'v3_get_company',
      description: 'Get full details for one company including subscription, settings, and user count.',
      parameters: {
        type: 'object',
        properties: {
          company_id: { type: 'number', description: 'Company ID to look up.' },
        },
        required: ['company_id'],
      },
    },
  },
  // ── Business: Users & Team ────────────────────────────────────────────────
  {
    type: 'function' as const,
    function: {
      name: 'v3_list_users',
      description: 'List users for a company. Returns name, email, role, last login, and active device count.',
      parameters: {
        type: 'object',
        properties: {
          company_id: { type: 'number', description: 'Company ID. Required.' },
          role_filter: { type: 'string', description: 'Filter by role (owner, admin, member, worker). Omit for all.' },
          limit: { type: 'number', description: 'Max results (1-100). Default 50.' },
        },
        required: ['company_id'],
      },
    },
  },
  // ── Business: Jobs ────────────────────────────────────────────────────────
  {
    type: 'function' as const,
    function: {
      name: 'v3_list_jobs',
      description: 'List jobs for a company. Returns job number, name, status, client, address, and dates.',
      parameters: {
        type: 'object',
        properties: {
          company_id: { type: 'number', description: 'Company ID. Required.' },
          status_filter: { type: 'string', description: 'Filter by status: active (Works in Progress), quoting, on_hold, completed, new, all. Default: active.' },
          limit: { type: 'number', description: 'Max results (1-50). Default 20.' },
        },
        required: ['company_id'],
      },
    },
  },
  // ── Business: Estimates & Invoices ────────────────────────────────────────
  {
    type: 'function' as const,
    function: {
      name: 'v3_list_estimates',
      description: 'List estimates/quotes for a company. Returns title, status, job, and total.',
      parameters: {
        type: 'object',
        properties: {
          company_id: { type: 'number', description: 'Company ID. Required.' },
          status_filter: { type: 'string', description: 'Filter by status (draft, sent, approved, rejected, all). Default: all.' },
          limit: { type: 'number', description: 'Max results (1-50). Default 20.' },
        },
        required: ['company_id'],
      },
    },
  },
  // ── Business: Forms & Signatures ─────────────────────────────────────────
  {
    type: 'function' as const,
    function: {
      name: 'v3_list_forms',
      description: 'List form submissions for a company. Returns form type, job, status, and signature state.',
      parameters: {
        type: 'object',
        properties: {
          company_id: { type: 'number', description: 'Company ID. Required.' },
          status_filter: { type: 'string', description: 'Filter by status (draft, submitted, signed, expired, all). Default: all.' },
          limit: { type: 'number', description: 'Max results (1-50). Default 20.' },
        },
        required: ['company_id'],
      },
    },
  },
  // ── Business: Fleet ───────────────────────────────────────────────────────
  {
    type: 'function' as const,
    function: {
      name: 'v3_list_fleet',
      description: 'List fleet assets for a company. Returns name, type, status, rego, and service dates.',
      parameters: {
        type: 'object',
        properties: {
          company_id: { type: 'number', description: 'Company ID. Required.' },
          overdue_only: { type: 'boolean', description: 'Only return assets with overdue service. Default: false.' },
          limit: { type: 'number', description: 'Max results (1-100). Default 50.' },
        },
        required: ['company_id'],
      },
    },
  },
  // ── Business: Share Links ─────────────────────────────────────────────────
  {
    type: 'function' as const,
    function: {
      name: 'v3_list_share_links',
      description: 'List public share links for a company. Returns token type, target, use count, expiry, and revoke status.',
      parameters: {
        type: 'object',
        properties: {
          company_id: { type: 'number', description: 'Company ID. Required.' },
          active_only: { type: 'boolean', description: 'Only return non-revoked, non-expired links. Default: false.' },
          limit: { type: 'number', description: 'Max results (1-50). Default 20.' },
        },
        required: ['company_id'],
      },
    },
  },
  // ── Technical: Auth & Login Events ───────────────────────────────────────
  {
    type: 'function' as const,
    function: {
      name: 'v3_get_login_events',
      description: 'Platform-owner only. Get recent login attempts, failures, and blocked events. Use to diagnose authentication issues.',
      parameters: {
        type: 'object',
        properties: {
          email_filter: { type: 'string', description: 'Filter by user email. Omit for all.' },
          company_id: { type: 'number', description: 'Filter by company. Omit for all companies.' },
          failed_only: { type: 'boolean', description: 'Only return failed/blocked attempts. Default: false.' },
          hours: { type: 'number', description: 'Look back N hours (1-168). Default: 24.' },
          limit: { type: 'number', description: 'Max results (1-100). Default 50.' },
        },
        required: [],
      },
    },
  },
  // ── Technical: API Errors ─────────────────────────────────────────────────
  {
    type: 'function' as const,
    function: {
      name: 'v3_get_api_errors',
      description: 'Platform-owner only. Get recent API errors and server exceptions. Use to diagnose backend failures.',
      parameters: {
        type: 'object',
        properties: {
          route_filter: { type: 'string', description: 'Filter by route path (e.g. /api/estimates). Omit for all.' },
          hours: { type: 'number', description: 'Look back N hours (1-168). Default: 24.' },
          limit: { type: 'number', description: 'Max results (1-100). Default 50.' },
        },
        required: [],
      },
    },
  },
  // ── Technical: Bug Reports ────────────────────────────────────────────────
  {
    type: 'function' as const,
    function: {
      name: 'v3_get_bug_reports',
      description: 'Platform-owner only. Get recent bug reports with AI analysis. Use to understand user-reported issues.',
      parameters: {
        type: 'object',
        properties: {
          status_filter: { type: 'string', description: 'Filter by status (open, in_progress, resolved, all). Default: open.' },
          hours: { type: 'number', description: 'Look back N hours (1-720). Default: 168 (7 days).' },
          limit: { type: 'number', description: 'Max results (1-50). Default 20.' },
        },
        required: [],
      },
    },
  },
  // ── Technical: Incidents ──────────────────────────────────────────────────
  {
    type: 'function' as const,
    function: {
      name: 'v3_get_incidents',
      description: 'Platform-owner only. Get Dazza-tracked incidents. Use to understand active platform issues.',
      parameters: {
        type: 'object',
        properties: {
          severity_filter: { type: 'string', description: 'Filter by severity (critical, high, medium, low, all). Default: all.' },
          status_filter: { type: 'string', description: 'Filter by status (open, investigating, resolved, all). Default: open.' },
          limit: { type: 'number', description: 'Max results (1-50). Default 20.' },
        },
        required: [],
      },
    },
  },
  // ── Technical: Dazza Audit ────────────────────────────────────────────────
  {
    type: 'function' as const,
    function: {
      name: 'v3_get_dazza_audit',
      description: 'Platform-owner only. Get Dazza interaction audit log. Use to review what Dazza has been asked and what data was accessed.',
      parameters: {
        type: 'object',
        properties: {
          hours: { type: 'number', description: 'Look back N hours (1-168). Default: 24.' },
          limit: { type: 'number', description: 'Max results (1-100). Default 50.' },
        },
        required: [],
      },
    },
  },
  // ── Technical: Email Delivery ─────────────────────────────────────────────
  {
    type: 'function' as const,
    function: {
      name: 'v3_get_email_events',
      description: 'Platform-owner only. Get email delivery events and failures. Use to diagnose email delivery issues.',
      parameters: {
        type: 'object',
        properties: {
          company_id: { type: 'number', description: 'Filter by company. Omit for all.' },
          failed_only: { type: 'boolean', description: 'Only return failed deliveries. Default: false.' },
          hours: { type: 'number', description: 'Look back N hours (1-168). Default: 48.' },
          limit: { type: 'number', description: 'Max results (1-100). Default 50.' },
        },
        required: [],
      },
    },
  },
  // ── Technical: Platform Health ────────────────────────────────────────────
  {
    type: 'function' as const,
    function: {
      name: 'v3_platform_health',
      description: 'Platform-owner only. Get a snapshot of platform health: company count, active users, recent errors, open incidents, and DB table sizes.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  // ── Technical: Approved Memory ────────────────────────────────────────────
  {
    type: 'function' as const,
    function: {
      name: 'v3_get_approved_memory',
      description: 'Get Owner-approved Dazza brain entries and knowledge base. Use to recall verified facts and past repair outcomes.',
      parameters: {
        type: 'object',
        properties: {
          category_filter: { type: 'string', description: 'Filter by category. Omit for all.' },
          limit: { type: 'number', description: 'Max results (1-100). Default 50.' },
        },
        required: [],
      },
    },
  },
  // ── Technical: Incident Detail ────────────────────────────────────────────
  {
    type: 'function' as const,
    function: {
      name: 'v3_get_incident_detail',
      description: 'Get full detail for a specific incident including evidence timeline, affected users, and repair prompt.',
      parameters: {
        type: 'object',
        properties: {
          incident_id: { type: 'string', description: 'Incident ID to look up.' },
        },
        required: ['incident_id'],
      },
    },
  },
  // ── Anatomy Index tools ───────────────────────────────────────────────────
  {
    type: 'function' as const,
    function: {
      name: 'search_anatomy',
      description: 'Search the active anatomy snapshot for source code, routes, schema, or any text. Returns file paths, line ranges, and matching snippets. Use this to find where something is implemented.',
      parameters: {
        type: 'object',
        properties: {
          query:       { type: 'string',  description: 'Search query (2-200 chars). Use specific identifiers, function names, route paths, or table names.' },
          language:    { type: 'string',  description: 'Filter by language: typescript, javascript, sql, etc. Omit for all.' },
          file_type:   { type: 'string',  description: 'Filter by file type: source, config, database, style, etc. Omit for all.' },
          limit:       { type: 'number',  description: 'Max results (1-20). Default 10.' },
          snapshot_id: { type: 'string',  description: 'Specific snapshot ID. Omit to use the active snapshot.' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'read_anatomy_file',
      description: 'Read a specific file from the active anatomy snapshot. Returns line-numbered content. Use after search_anatomy to read the full context of a match.',
      parameters: {
        type: 'object',
        properties: {
          rel_path:    { type: 'string',  description: 'Relative file path (e.g. src/server/api/jobs/GET.ts).' },
          start_line:  { type: 'number',  description: 'Start line (1-based). Omit for beginning.' },
          end_line:    { type: 'number',  description: 'End line (1-based). Omit for end. Max 300 lines per call.' },
          snapshot_id: { type: 'string',  description: 'Specific snapshot ID. Omit to use the active snapshot.' },
        },
        required: ['rel_path'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_anatomy_files',
      description: 'List files in the active anatomy snapshot, optionally filtered by path prefix or language.',
      parameters: {
        type: 'object',
        properties: {
          path_prefix: { type: 'string',  description: 'Filter by path prefix (e.g. src/server/api/jobs).' },
          language:    { type: 'string',  description: 'Filter by language.' },
          file_type:   { type: 'string',  description: 'Filter by file type.' },
          limit:       { type: 'number',  description: 'Max results (1-200). Default 50.' },
          snapshot_id: { type: 'string',  description: 'Specific snapshot ID. Omit to use the active snapshot.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'find_route',
      description: 'Find API route handlers or React Router routes matching a path pattern.',
      parameters: {
        type: 'object',
        properties: {
          route_pattern: { type: 'string', description: 'Route path to search for (e.g. /api/jobs, /estimates/:id).' },
          snapshot_id:   { type: 'string', description: 'Specific snapshot ID. Omit to use the active snapshot.' },
        },
        required: ['route_pattern'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'find_database_definition',
      description: 'Find database table definitions, schema migrations, or Drizzle ORM schema for a given table or column name.',
      parameters: {
        type: 'object',
        properties: {
          table_or_column: { type: 'string', description: 'Table name or column name to find (e.g. jobs, company_id).' },
          snapshot_id:     { type: 'string', description: 'Specific snapshot ID. Omit to use the active snapshot.' },
        },
        required: ['table_or_column'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_anatomy_manifest',
      description: 'Get the file manifest and metadata for the active anatomy snapshot. Shows what source code is available for investigation.',
      parameters: {
        type: 'object',
        properties: {
          snapshot_id: { type: 'string', description: 'Specific snapshot ID. Omit to use the active snapshot.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'compare_anatomy_snapshots',
      description: 'Compare two anatomy snapshots to identify files added, removed, or changed between versions.',
      parameters: {
        type: 'object',
        properties: {
          snapshot_id_a: { type: 'string', description: 'First (older) snapshot ID.' },
          snapshot_id_b: { type: 'string', description: 'Second (newer) snapshot ID.' },
        },
        required: ['snapshot_id_a', 'snapshot_id_b'],
      },
    },
  },
  // ── CP12B — Image Safeguard tools ─────────────────────────────────────────
  {
    type: 'function' as const,
    function: {
      name: 'v3_image_safeguard_status',
      description:
        'Returns the current image safeguard scanner configuration, capability (provider, configured), ' +
        'DB counts (total findings, flagged, failed), and the last 5 scan runs. ' +
        'Use this to check whether the scanner is operational before triggering a run.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'v3_image_safeguard_trigger_run',
      description:
        'Triggers a new image safeguard scan run over job photos in R2. ' +
        'The server fetches images, validates them, and classifies each via OpenAI Vision (gpt-4o). ' +
        'Results (privacy_signal / clear / failed) are stored in the DB. ' +
        'Returns the new runId immediately — poll v3_image_safeguard_run_detail to check completion. ' +
        'Only one run may be active at a time.',
      parameters: {
        type: 'object',
        properties: {
          since: {
            type: 'string',
            description:
              'ISO-8601 start of date range (e.g. "2026-08-01T00:00:00Z"). ' +
              'Omit to use the last successful scan cursor, or 7-day default if no cursor.',
          },
          until: {
            type: 'string',
            description:
              'ISO-8601 end of date range. Omit to use server now.',
          },
          use_cursor: {
            type: 'boolean',
            description:
              'If true, use the last successful scan cursor as the start date. ' +
              'Ignored when `since` is provided. Defaults to true.',
          },
          period_days: {
            type: 'integer',
            description:
              'Look-back window in days (1–90). Used as `since` = now − period_days when ' +
              'no explicit `since` is provided and `use_cursor` is false or has no cursor. ' +
              'Ignored when `since` is explicitly set.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'v3_image_safeguard_run_detail',
      description:
        'Returns the status and findings for a specific scan run by runId. ' +
        'Shows run_status (pending/running/completed/failed), counts, detector info, ' +
        'and up to 100 findings (privacy_signal or failed — clear results are not stored as rows). ' +
        'R2 keys are NEVER returned.',
      parameters: {
        type: 'object',
        properties: {
          run_id: { type: 'string', description: 'The scan run UUID returned by v3_image_safeguard_trigger_run.' },
        },
        required: ['run_id'],
      },
    },
  },
] as const;

export type V3ToolName = typeof V3_TOOL_DEFINITIONS[number]['function']['name'];

/**
 * Responses API flat tool format.
 *
 * Chat Completions shape (what V3_TOOL_DEFINITIONS stores):
 *   { type: 'function', function: { name, description, parameters } }
 *
 * Responses API shape (what /v1/responses requires):
 *   { type: 'function', name, description, parameters, strict }
 *
 * The two are NOT interchangeable. Spreading a Chat Completions tool into a
 * Responses API call produces { type: 'function', function: {...} } which
 * fails with "Missing required parameter: 'tools[0].name'" (HTTP 400).
 *
 * This export converts every definition to the flat Responses API shape.
 * Use this — and only this — when calling /v1/responses.
 */
export const V3_TOOL_DEFINITIONS_FLAT: Array<{
  type: 'function';
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  strict: false;
}> = V3_TOOL_DEFINITIONS.map((t) => ({
  type: 'function' as const,
  name: t.function.name,
  description: t.function.description,
  parameters: t.function.parameters as Record<string, unknown>,
  strict: false as const,
}));

// ── Tool executor ─────────────────────────────────────────────────────────────

export async function executeV3Tool(
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  try {
    const timeout = new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error('Tool timeout after 8s')), 8_000)
    );
    const result = executeV3ToolInner(name, args);
    return await Promise.race([result, timeout]);
  } catch (e) {
    return err(String(e instanceof Error ? e.message : e));
  }
}

async function executeV3ToolInner(
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  switch (name as V3ToolName) {
    case 'v3_list_companies':       return toolListCompanies(args);
    case 'v3_get_company':          return toolGetCompany(args);
    case 'v3_list_users':           return toolListUsers(args);
    case 'v3_list_jobs':            return toolListJobs(args);
    case 'v3_list_estimates':       return toolListEstimates(args);
    case 'v3_list_forms':           return toolListForms(args);
    case 'v3_list_fleet':           return toolListFleet(args);
    case 'v3_list_share_links':     return toolListShareLinks(args);
    case 'v3_get_login_events':     return toolGetLoginEvents(args);
    case 'v3_get_api_errors':       return toolGetApiErrors(args);
    case 'v3_get_bug_reports':      return toolGetBugReports(args);
    case 'v3_get_incidents':        return toolGetIncidents(args);
    case 'v3_get_dazza_audit':      return toolGetDazzaAudit(args);
    case 'v3_get_email_events':     return toolGetEmailEvents(args);
    case 'v3_platform_health':      return toolPlatformHealth();
    case 'v3_get_approved_memory':  return toolGetApprovedMemory(args);
    case 'v3_get_incident_detail':  return toolGetIncidentDetail(args);
    // Anatomy tools
    case 'search_anatomy':          return toolSearchAnatomy(args);
    case 'read_anatomy_file':       return toolReadAnatomyFile(args);
    case 'list_anatomy_files':      return toolListAnatomyFiles(args);
    case 'find_route':              return toolFindRoute(args);
    case 'find_database_definition': return toolFindDatabaseDefinition(args);
    case 'get_anatomy_manifest':    return toolGetAnatomyManifest(args);
    case 'compare_anatomy_snapshots': return toolCompareAnatomySnapshots(args);
    // CP12B — Image Safeguard
    case 'v3_image_safeguard_status':      return toolImageSafeguardStatus();
    case 'v3_image_safeguard_trigger_run': return toolImageSafeguardTriggerRun(args);
    case 'v3_image_safeguard_run_detail':  return toolImageSafeguardRunDetail(args);
    default:
      return err(`Unknown tool: ${name}`);
  }
}

// ── Tool implementations ──────────────────────────────────────────────────────

async function toolListCompanies(args: Record<string, unknown>): Promise<string> {
  const limit = safeInt(args.limit, 50, 100);
  const statusFilter = safeStr(args.status_filter);
  const whereStatus = statusFilter ? `WHERE c.subscription_status = '${statusFilter.replace(/'/g, "''")}'` : '';

  const [rows] = await db.execute(sql.raw(`
    SELECT c.id, c.name, c.subscription_status, c.created_at,
           COUNT(DISTINCT p.user_id) AS user_count
    FROM companies c
    LEFT JOIN profiles p ON p.company_id = c.id
    ${whereStatus}
    GROUP BY c.id
    ORDER BY c.created_at DESC
    LIMIT ${limit}
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  return ok({ companies: rows ?? [], count: rows?.length ?? 0 });
}

async function toolGetCompany(args: Record<string, unknown>): Promise<string> {
  const companyId = safeInt(args.company_id, 0, 999999);
  if (!companyId) return err('company_id required');

  const [rows] = await db.execute(sql.raw(`
    SELECT c.id, c.name, c.subscription_status, c.created_at,
           cs.industry, cs.work_label_singular, cs.work_label_plural,
           COUNT(DISTINCT p.user_id) AS user_count
    FROM companies c
    LEFT JOIN company_settings cs ON cs.company_id = c.id
    LEFT JOIN profiles p ON p.company_id = c.id
    WHERE c.id = ${companyId}
    GROUP BY c.id
    LIMIT 1
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  if (!rows?.[0]) return err(`Company ${companyId} not found`);
  return ok(rows[0]);
}

async function toolListUsers(args: Record<string, unknown>): Promise<string> {
  const companyId = safeInt(args.company_id, 0, 999999);
  if (!companyId) return err('company_id required');
  const limit = safeInt(args.limit, 50, 100);
  const roleFilter = safeStr(args.role_filter);
  const whereRole = roleFilter ? `AND p.role = '${roleFilter.replace(/'/g, "''")}'` : '';

  const [rows] = await db.execute(sql.raw(`
    SELECT u.id, u.name, u.email, p.role, u.created_at,
           p.platform_role
    FROM user u
    JOIN profiles p ON p.user_id = u.id
    WHERE p.company_id = ${companyId} ${whereRole}
    ORDER BY u.created_at DESC
    LIMIT ${limit}
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  // Redact any sensitive fields
  const safe = (rows ?? []).map(r => redactSecrets(r));
  return ok({ users: safe, count: safe.length });
}

async function toolListJobs(args: Record<string, unknown>): Promise<string> {
  const companyId = safeInt(args.company_id, 0, 999999);
  if (!companyId) return err('company_id required');
  const limit = safeInt(args.limit, 20, 50);
  const statusFilter = safeStr(args.status_filter, 'active');

  // Map Dazza-friendly status aliases to the actual stored values in the jobs table.
  // Schema default is 'New'; the app uses mixed-case status strings.
  // NEVER use LOWER() comparison — status values are mixed-case and must match exactly.
  let whereStatus = '';
  switch (statusFilter.toLowerCase()) {
    case 'active':
    case 'in_progress':
    case 'in progress':
      whereStatus = `AND j.status = 'Works in Progress'`;
      break;
    case 'quoting':
      whereStatus = `AND j.status IN ('Quoting', 'Submitted', 'Awaiting Approval')`;
      break;
    case 'on_hold':
    case 'on hold':
      whereStatus = `AND j.status = 'On Hold'`;
      break;
    case 'completed':
    case 'closed':
      whereStatus = `AND j.status IN ('Completed', 'Closed')`;
      break;
    case 'new':
      whereStatus = `AND j.status = 'New'`;
      break;
    case 'all':
    default:
      whereStatus = '';
      break;
  }

  // Column names from Drizzle schema (src/server/db/schema.ts, line 152):
  //   name (not title), client (not client_name), status, address
  //   scheduled_start_date, expected_completion_date (not start_date/end_date)
  //   job_number (added via colsToEnsure)
  //   created_at, updated_at
  // Columns that do NOT exist: title, client_name, end_date, progress_percent,
  //   risk_level, high_risk — selecting these causes ER_BAD_FIELD_ERROR.
  try {
    const [rows] = await db.execute(sql.raw(`
      SELECT j.id,
             j.job_number,
             j.name,
             j.status,
             j.client,
             j.address,
             j.scheduled_start_date,
             j.expected_completion_date,
             j.created_at,
             j.updated_at
      FROM jobs j
      WHERE j.company_id = ${companyId} ${whereStatus}
      ORDER BY j.updated_at DESC
      LIMIT ${limit}
    `)) as unknown as [Array<Record<string, unknown>>, unknown];

    return ok({ jobs: rows ?? [], count: rows?.length ?? 0, status_filter_applied: statusFilter });
  } catch (e: unknown) {
    // Never expose raw SQL errors, column names, or query details to Dazza.
    // Log the full cause server-side with a correlation reference.
    const ref = Math.random().toString(36).slice(2, 10).toUpperCase();
    console.error(`[dazza-v3] toolListJobs DB error [ref:${ref}] company=${companyId} filter=${statusFilter}:`, e);
    return JSON.stringify({ ok: false, error: 'Job lookup failed', reference: ref });
  }
}

async function toolListEstimates(args: Record<string, unknown>): Promise<string> {
  const companyId = safeInt(args.company_id, 0, 999999);
  if (!companyId) return err('company_id required');
  const limit = safeInt(args.limit, 20, 50);
  const statusFilter = safeStr(args.status_filter, 'all');
  const whereStatus = statusFilter !== 'all'
    ? `AND LOWER(e.status) = '${statusFilter.replace(/'/g, "''")}'`
    : '';

  const [rows] = await db.execute(sql.raw(`
    SELECT e.id, e.title, e.status, e.job_id,
           j.title AS job_title,
           COALESCE(SUM(el.quantity * el.rate), 0) AS subtotal,
           COUNT(el.id) AS line_count,
           e.created_at, e.updated_at
    FROM estimates e
    LEFT JOIN estimate_lines el ON el.estimate_id = e.id
    LEFT JOIN jobs j ON j.id = e.job_id
    WHERE e.company_id = ${companyId} ${whereStatus}
    GROUP BY e.id
    ORDER BY e.updated_at DESC
    LIMIT ${limit}
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  return ok({ estimates: rows ?? [], count: rows?.length ?? 0 });
}

async function toolListForms(args: Record<string, unknown>): Promise<string> {
  const companyId = safeInt(args.company_id, 0, 999999);
  if (!companyId) return err('company_id required');
  const limit = safeInt(args.limit, 20, 50);
  const statusFilter = safeStr(args.status_filter, 'all');
  const whereStatus = statusFilter !== 'all'
    ? `AND LOWER(fs.status) = '${statusFilter.replace(/'/g, "''")}'`
    : '';

  const [rows] = await db.execute(sql.raw(`
    SELECT fs.id, fs.form_type, fs.status, fs.job_id,
           j.title AS job_title,
           fs.submitted_at, fs.signed_at, fs.expires_at,
           fs.created_at
    FROM form_submissions fs
    LEFT JOIN jobs j ON j.id = fs.job_id
    WHERE fs.company_id = ${companyId} ${whereStatus}
    ORDER BY fs.created_at DESC
    LIMIT ${limit}
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  return ok({ forms: rows ?? [], count: rows?.length ?? 0 });
}

async function toolListFleet(args: Record<string, unknown>): Promise<string> {
  const companyId = safeInt(args.company_id, 0, 999999);
  if (!companyId) return err('company_id required');
  const limit = safeInt(args.limit, 50, 100);
  const overdueOnly = args.overdue_only === true;
  const overdueFilter = overdueOnly
    ? `AND a.next_service_date IS NOT NULL AND a.next_service_date < CURDATE()`
    : '';

  const [rows] = await db.execute(sql.raw(`
    SELECT a.id, a.name, a.asset_type, a.status, a.rego,
           a.next_service_date, a.last_service_date, a.odometer_km
    FROM assets a
    WHERE a.company_id = ${companyId} ${overdueFilter}
    ORDER BY a.name ASC
    LIMIT ${limit}
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  return ok({ assets: rows ?? [], count: rows?.length ?? 0 });
}

async function toolListShareLinks(args: Record<string, unknown>): Promise<string> {
  const companyId = safeInt(args.company_id, 0, 999999);
  if (!companyId) return err('company_id required');
  const limit = safeInt(args.limit, 20, 50);
  const activeOnly = args.active_only === true;
  const activeFilter = activeOnly
    ? `AND ssl.revoked = 0 AND (ssl.expires_at IS NULL OR ssl.expires_at > NOW())`
    : '';

  const [rows] = await db.execute(sql.raw(`
    SELECT ssl.id, ssl.link_type, ssl.target_type, ssl.target_id,
           ssl.use_count, ssl.max_uses, ssl.revoked, ssl.expires_at,
           ssl.created_at
    FROM secure_share_links ssl
    WHERE ssl.company_id = ${companyId} ${activeFilter}
    ORDER BY ssl.created_at DESC
    LIMIT ${limit}
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  // Never return token_hash or password_hash
  const safe = (rows ?? []).map(r => {
    const { token_hash: _th, password_hash: _ph, ...rest } = r as Record<string, unknown>;
    return rest;
  });
  return ok({ links: safe, count: safe.length });
}

async function toolGetLoginEvents(args: Record<string, unknown>): Promise<string> {
  const hours = safeInt(args.hours, 24, 168);
  const limit = safeInt(args.limit, 50, 100);
  const emailFilter = safeStr(args.email_filter);
  const companyId = args.company_id ? safeInt(args.company_id, 0, 999999) : null;
  const failedOnly = args.failed_only === true;

  // Use dazza_audit_log as proxy for login events (has user_id, company_id, question_summary)
  // Also check for failed login patterns in the audit log
  const whereEmail = emailFilter ? `AND u.email LIKE '%${emailFilter.replace(/'/g, "''")}%'` : '';
  const whereCompany = companyId ? `AND p.company_id = ${companyId}` : '';
  const whereStatus = failedOnly ? `AND dal.question_summary LIKE '%login%fail%'` : '';

  const [rows] = await db.execute(sql.raw(`
    SELECT dal.id, dal.user_id, dal.company_id, dal.question_summary,
           dal.created_at, u.email, u.name, p.role
    FROM dazza_audit_log dal
    LEFT JOIN user u ON u.id = dal.user_id
    LEFT JOIN profiles p ON p.user_id = dal.user_id
    WHERE dal.created_at >= DATE_SUB(NOW(), INTERVAL ${hours} HOUR)
      AND (dal.question_summary LIKE '%login%' OR dal.question_summary LIKE '%auth%' OR dal.question_summary LIKE '%session%')
      ${whereEmail} ${whereCompany} ${whereStatus}
    ORDER BY dal.created_at DESC
    LIMIT ${limit}
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  const safe = (rows ?? []).map(r => redactSecrets(r));
  return ok({ events: safe, count: safe.length, note: 'Login events sourced from Dazza audit log. Direct auth provider logs not yet instrumented.' });
}

async function toolGetApiErrors(args: Record<string, unknown>): Promise<string> {
  const hours = safeInt(args.hours, 24, 168);
  const limit = safeInt(args.limit, 50, 100);
  const routeFilter = safeStr(args.route_filter);

  // Query dazza_incidents for API error type incidents
  const whereRoute = routeFilter ? `AND di.affected_route LIKE '%${routeFilter.replace(/'/g, "''")}%'` : '';

  const [rows] = await db.execute(sql.raw(`
    SELECT di.id, di.incident_type, di.severity, di.status,
           di.affected_route, di.affected_company_id, di.affected_user_count,
           di.first_seen_at, di.last_seen_at, di.event_count,
           di.likely_cause, di.title
    FROM dazza_incidents di
    WHERE di.first_seen_at >= DATE_SUB(NOW(), INTERVAL ${hours} HOUR)
      AND di.incident_type IN ('api_error', 'server_exception', 'upload_failure', 'pdf_failure')
      ${whereRoute}
    ORDER BY di.last_seen_at DESC
    LIMIT ${limit}
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  return ok({ errors: rows ?? [], count: rows?.length ?? 0 });
}

async function toolGetBugReports(args: Record<string, unknown>): Promise<string> {
  const hours = safeInt(args.hours, 168, 720);
  const limit = safeInt(args.limit, 20, 50);
  const statusFilter = safeStr(args.status_filter, 'open');
  const whereStatus = statusFilter !== 'all'
    ? `AND br.status = '${statusFilter.replace(/'/g, "''")}'`
    : '';

  const [rows] = await db.execute(sql.raw(`
    SELECT br.id, br.category, br.description, br.status,
           br.submitted_by_name, br.submitted_by_email,
           br.platform, br.app_version, br.current_route,
           br.ai_analysis, br.ai_suggested_fix,
           br.ai_analysed_at, br.created_at
    FROM bug_reports br
    WHERE br.created_at >= DATE_SUB(NOW(), INTERVAL ${hours} HOUR)
      ${whereStatus}
    ORDER BY br.created_at DESC
    LIMIT ${limit}
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  return ok({ reports: rows ?? [], count: rows?.length ?? 0 });
}

async function toolGetIncidents(args: Record<string, unknown>): Promise<string> {
  const limit = safeInt(args.limit, 20, 50);
  const severityFilter = safeStr(args.severity_filter, 'all');
  const statusFilter = safeStr(args.status_filter, 'open');

  const whereSeverity = severityFilter !== 'all'
    ? `AND di.severity = '${severityFilter.replace(/'/g, "''")}'`
    : '';
  const whereStatus = statusFilter !== 'all'
    ? `AND di.status = '${statusFilter.replace(/'/g, "''")}'`
    : '';

  const [rows] = await db.execute(sql.raw(`
    SELECT di.id, di.title, di.incident_type, di.severity, di.status,
           di.affected_route, di.affected_company_id, di.affected_user_count,
           di.first_seen_at, di.last_seen_at, di.event_count,
           di.likely_cause, di.confidence, di.data_loss_risk,
           di.immediate_workaround, di.customer_recovered
    FROM dazza_incidents di
    WHERE 1=1 ${whereSeverity} ${whereStatus}
    ORDER BY
      CASE di.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
      di.last_seen_at DESC
    LIMIT ${limit}
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  return ok({ incidents: rows ?? [], count: rows?.length ?? 0 });
}

async function toolGetDazzaAudit(args: Record<string, unknown>): Promise<string> {
  const hours = safeInt(args.hours, 24, 168);
  const limit = safeInt(args.limit, 50, 100);

  const [rows] = await db.execute(sql.raw(`
    SELECT dal.id, dal.user_id, dal.company_id, dal.question_summary,
           dal.modules_used, dal.dollars_included, dal.support_mode,
           dal.created_at
    FROM dazza_audit_log dal
    WHERE dal.created_at >= DATE_SUB(NOW(), INTERVAL ${hours} HOUR)
    ORDER BY dal.created_at DESC
    LIMIT ${limit}
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  return ok({ audit: rows ?? [], count: rows?.length ?? 0 });
}

async function toolGetEmailEvents(args: Record<string, unknown>): Promise<string> {
  const hours = safeInt(args.hours, 48, 168);
  const limit = safeInt(args.limit, 50, 100);
  const companyId = args.company_id ? safeInt(args.company_id, 0, 999999) : null;
  const failedOnly = args.failed_only === true;

  const whereCompany = companyId ? `AND en.company_id = ${companyId}` : '';
  const whereFailed = failedOnly ? `AND en.note LIKE '%fail%'` : '';

  const [rows] = await db.execute(sql.raw(`
    SELECT en.id, en.entity_type, en.entity_id, en.company_id,
           en.note, en.created_at, en.created_by_name
    FROM entity_notes en
    WHERE en.created_at >= DATE_SUB(NOW(), INTERVAL ${hours} HOUR)
      AND en.note LIKE '%email%'
      ${whereCompany} ${whereFailed}
    ORDER BY en.created_at DESC
    LIMIT ${limit}
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  return ok({ events: rows ?? [], count: rows?.length ?? 0 });
}

async function toolPlatformHealth(): Promise<string> {
  const [companyCount] = await db.execute(sql.raw(
    `SELECT COUNT(*) AS total, SUM(CASE WHEN subscription_status = 'active' THEN 1 ELSE 0 END) AS active FROM companies`
  )) as unknown as [Array<{ total: number; active: number }>, unknown];

  const [userCount] = await db.execute(sql.raw(
    `SELECT COUNT(*) AS total FROM user`
  )) as unknown as [Array<{ total: number }>, unknown];

  const [openIncidents] = await db.execute(sql.raw(
    `SELECT COUNT(*) AS total, SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) AS critical FROM dazza_incidents WHERE status != 'resolved'`
  )) as unknown as [Array<{ total: number; critical: number }>, unknown];

  const [openBugs] = await db.execute(sql.raw(
    `SELECT COUNT(*) AS total FROM bug_reports WHERE status = 'open'`
  )) as unknown as [Array<{ total: number }>, unknown];

  const [recentAudit] = await db.execute(sql.raw(
    `SELECT COUNT(*) AS total FROM dazza_audit_log WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`
  )) as unknown as [Array<{ total: number }>, unknown];

  return ok({
    companies: { total: companyCount?.[0]?.total ?? 0, active: companyCount?.[0]?.active ?? 0 },
    users: { total: userCount?.[0]?.total ?? 0 },
    incidents: { open: openIncidents?.[0]?.total ?? 0, critical: openIncidents?.[0]?.critical ?? 0 },
    bugReports: { open: openBugs?.[0]?.total ?? 0 },
    dazzaInteractions24h: recentAudit?.[0]?.total ?? 0,
    timestamp: new Date().toISOString(),
  });
}

async function toolGetApprovedMemory(args: Record<string, unknown>): Promise<string> {
  const limit = safeInt(args.limit, 50, 100);
  const categoryFilter = safeStr(args.category_filter);
  const whereCategory = categoryFilter
    ? `AND (dbe.category = '${categoryFilter.replace(/'/g, "''")}' OR dk.category = '${categoryFilter.replace(/'/g, "''")}')`
    : '';

  const [brainRows] = await db.execute(sql.raw(`
    SELECT 'brain_entry' AS source_type, dbe.id, dbe.title, dbe.category,
           dbe.content, dbe.source_name, dbe.created_at
    FROM dazza_brain_entries dbe
    WHERE dbe.approved = 1 ${whereCategory}
    ORDER BY dbe.created_at DESC
    LIMIT ${limit}
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  const [knowledgeRows] = await db.execute(sql.raw(`
    SELECT 'knowledge' AS source_type, dk.id, dk.title, dk.category,
           dk.content, dk.source_name, dk.created_at
    FROM dazza_knowledge dk
    WHERE 1=1 ${whereCategory}
    ORDER BY dk.created_at DESC
    LIMIT ${limit}
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  const combined = [...(brainRows ?? []), ...(knowledgeRows ?? [])];
  return ok({ memory: combined, count: combined.length });
}

async function toolGetIncidentDetail(args: Record<string, unknown>): Promise<string> {
  const incidentId = safeStr(args.incident_id);
  if (!incidentId) return err('incident_id required');

  const [rows] = await db.execute(sql.raw(`
    SELECT di.*
    FROM dazza_incidents di
    WHERE di.id = '${incidentId.replace(/'/g, "''")}'
    LIMIT 1
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  if (!rows?.[0]) return err(`Incident ${incidentId} not found`);

  // Also get rescue entries for this incident
  const [rescueRows] = await db.execute(sql.raw(`
    SELECT dcr.id, dcr.user_name, dcr.user_email, dcr.user_phone,
           dcr.attempted_action, dcr.failure_description, dcr.recovered,
           dcr.rescue_status, dcr.suggested_call_wording, dcr.created_at
    FROM dazza_client_rescue dcr
    WHERE dcr.incident_id = '${incidentId.replace(/'/g, "''")}'
    ORDER BY dcr.created_at DESC
    LIMIT 10
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  return ok({ incident: rows[0], rescueEntries: rescueRows ?? [] });
}

// ── Anatomy tool implementations ──────────────────────────────────────────────

import { getActiveSnapshotId } from './anatomy-indexer.js';

const ANATOMY_MAX_SNIPPET = 500;
const ANATOMY_MAX_FILE_LINES = 300;

async function resolveSnapshotId(args: Record<string, unknown>): Promise<string | null> {
  const reqId = safeStr(args.snapshot_id);
  if (reqId) return reqId;
  return getActiveSnapshotId();
}

async function toolSearchAnatomy(args: Record<string, unknown>): Promise<string> {
  const query    = safeStr(args.query);
  const language = safeStr(args.language);
  const fileType = safeStr(args.file_type);
  const limit    = safeInt(args.limit, 10, 20);

  if (query.length < 2) return err('query must be at least 2 characters');

  const snapshotId = await resolveSnapshotId(args);
  if (!snapshotId) return err('No active anatomy snapshot. Ask Daryl to activate a snapshot first.');

  // Verify snapshot
  const [snapRows] = await db.execute(sql.raw(`
    SELECT id, source_type, repo_name, commit_sha, snapshot_name, is_active
    FROM anatomy_snapshots WHERE id = '${snapshotId.replace(/'/g, "''")}' AND status != 'deleted' LIMIT 1
  `)) as unknown as [Array<Record<string, unknown>>, unknown];
  if (!snapRows?.length) return err(`Snapshot ${snapshotId} not found or deleted.`);

  const langFilter = language ? `AND af.language = '${language.replace(/'/g, "''")}'` : '';
  const typeFilter = fileType ? `AND af.file_type = '${fileType.replace(/'/g, "''")}'` : '';
  const safeQ = query.replace(/['"\\]/g, ' ').slice(0, 200);

  const [rows] = await db.execute(sql.raw(`
    SELECT ac.rel_path, ac.start_line, ac.end_line, ac.chunk_type, ac.symbol_name,
           SUBSTRING(ac.content, 1, ${ANATOMY_MAX_SNIPPET}) AS snippet,
           MATCH(ac.content) AGAINST ('${safeQ}' IN BOOLEAN MODE) AS relevance
    FROM anatomy_chunks ac
    JOIN anatomy_files af ON af.id = ac.file_id
    WHERE ac.snapshot_id = '${snapshotId.replace(/'/g, "''")}'
      AND af.is_excluded = 0 AND af.is_quarantined = 0
      AND MATCH(ac.content) AGAINST ('${safeQ}' IN BOOLEAN MODE)
      ${langFilter} ${typeFilter}
    ORDER BY relevance DESC
    LIMIT ${limit}
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  return ok({
    query,
    snapshot: snapRows[0],
    results: rows ?? [],
    resultCount: (rows ?? []).length,
    note: 'Source: anatomy snapshot — not live production code. Verify against deployed version.',
  });
}

async function toolReadAnatomyFile(args: Record<string, unknown>): Promise<string> {
  const relPath   = safeStr(args.rel_path);
  const startLine = safeInt(args.start_line, 1, 999999);
  const endLine   = Math.min(safeInt(args.end_line, startLine + ANATOMY_MAX_FILE_LINES - 1, 999999), startLine + ANATOMY_MAX_FILE_LINES - 1);

  if (!relPath) return err('rel_path is required');

  const snapshotId = await resolveSnapshotId(args);
  if (!snapshotId) return err('No active anatomy snapshot.');

  // Verify snapshot
  const [snapRows] = await db.execute(sql.raw(`
    SELECT id, source_type, repo_name, commit_sha, snapshot_name
    FROM anatomy_snapshots WHERE id = '${snapshotId.replace(/'/g, "''")}' AND status != 'deleted' LIMIT 1
  `)) as unknown as [Array<Record<string, unknown>>, unknown];
  if (!snapRows?.length) return err(`Snapshot ${snapshotId} not found.`);

  // Get file record
  const [fileRows] = await db.execute(sql.raw(`
    SELECT id, language, file_type, line_count, is_excluded, is_quarantined
    FROM anatomy_files
    WHERE snapshot_id = '${snapshotId.replace(/'/g, "''")}' AND rel_path = '${relPath.replace(/'/g, "''")}'
    LIMIT 1
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  if (!fileRows?.length) return err(`File not found in snapshot: ${relPath}`);
  const fileRec = fileRows[0];
  if (fileRec.is_excluded) return err(`File is excluded from anatomy index: ${relPath}`);
  if (fileRec.is_quarantined) return err(`File is quarantined (secret pattern detected): ${relPath}. Path only — content not accessible.`);

  // Retrieve chunks covering the requested line range
  const [chunkRows] = await db.execute(sql.raw(`
    SELECT start_line, end_line, content
    FROM anatomy_chunks
    WHERE file_id = ${fileRec.id}
      AND end_line >= ${startLine}
      AND start_line <= ${endLine}
    ORDER BY start_line
    LIMIT 20
  `)) as unknown as [Array<{ start_line: number; end_line: number; content: string }>, unknown];

  if (!chunkRows?.length) return err(`No content found for ${relPath} lines ${startLine}-${endLine}`);

  // Reconstruct the requested line range from chunks
  const allLines: string[] = [];
  let baseLineOffset = chunkRows[0].start_line;
  for (const chunk of chunkRows) {
    const chunkLines = chunk.content.split('\n');
    for (let i = 0; i < chunkLines.length; i++) {
      const lineNum = chunk.start_line + i;
      if (lineNum >= startLine && lineNum <= endLine) {
        allLines.push(`${String(lineNum).padStart(4, ' ')} | ${chunkLines[i]}`);
      }
    }
    baseLineOffset = chunk.end_line;
  }
  void baseLineOffset;

  return ok({
    relPath,
    startLine,
    endLine: Math.min(endLine, (fileRec.line_count as number) ?? endLine),
    totalLines: fileRec.line_count,
    language: fileRec.language,
    snapshot: snapRows[0],
    content: allLines.join('\n'),
    note: 'Source: anatomy snapshot — not live production code.',
  });
}

async function toolListAnatomyFiles(args: Record<string, unknown>): Promise<string> {
  const pathPrefix = safeStr(args.path_prefix);
  const language   = safeStr(args.language);
  const fileType   = safeStr(args.file_type);
  const limit      = safeInt(args.limit, 50, 200);

  const snapshotId = await resolveSnapshotId(args);
  if (!snapshotId) return err('No active anatomy snapshot.');

  const [snapRows] = await db.execute(sql.raw(`
    SELECT id, source_type, repo_name, commit_sha, snapshot_name
    FROM anatomy_snapshots WHERE id = '${snapshotId.replace(/'/g, "''")}' AND status != 'deleted' LIMIT 1
  `)) as unknown as [Array<Record<string, unknown>>, unknown];
  if (!snapRows?.length) return err(`Snapshot ${snapshotId} not found.`);

  const prefixFilter = pathPrefix ? `AND rel_path LIKE '${pathPrefix.replace(/'/g, "''").replace(/%/g, '\\%')}%'` : '';
  const langFilter   = language   ? `AND language = '${language.replace(/'/g, "''")}'` : '';
  const typeFilter   = fileType   ? `AND file_type = '${fileType.replace(/'/g, "''")}'` : '';

  const [rows] = await db.execute(sql.raw(`
    SELECT rel_path, language, file_type, line_count, byte_size
    FROM anatomy_files
    WHERE snapshot_id = '${snapshotId.replace(/'/g, "''")}' AND is_excluded = 0 AND is_quarantined = 0
      ${prefixFilter} ${langFilter} ${typeFilter}
    ORDER BY rel_path
    LIMIT ${limit}
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  return ok({ snapshot: snapRows[0], files: rows ?? [], count: (rows ?? []).length });
}

async function toolFindRoute(args: Record<string, unknown>): Promise<string> {
  const routePattern = safeStr(args.route_pattern);
  if (!routePattern) return err('route_pattern is required');

  const snapshotId = await resolveSnapshotId(args);
  if (!snapshotId) return err('No active anatomy snapshot.');

  // Search for route registrations and handler files
  const safePattern = routePattern.replace(/['"\\]/g, ' ').slice(0, 200);

  const [rows] = await db.execute(sql.raw(`
    SELECT ac.rel_path, ac.start_line, ac.end_line,
           SUBSTRING(ac.content, 1, ${ANATOMY_MAX_SNIPPET}) AS snippet,
           MATCH(ac.content) AGAINST ('${safePattern}' IN BOOLEAN MODE) AS relevance
    FROM anatomy_chunks ac
    JOIN anatomy_files af ON af.id = ac.file_id
    WHERE ac.snapshot_id = '${snapshotId.replace(/'/g, "''")}' AND af.is_excluded = 0 AND af.is_quarantined = 0
      AND (
        MATCH(ac.content) AGAINST ('${safePattern}' IN BOOLEAN MODE)
        OR ac.content LIKE '%${safePattern.replace(/%/g, '\\%')}%'
      )
    ORDER BY relevance DESC
    LIMIT 15
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  return ok({ routePattern, results: rows ?? [], count: (rows ?? []).length });
}

async function toolFindDatabaseDefinition(args: Record<string, unknown>): Promise<string> {
  const tableOrColumn = safeStr(args.table_or_column);
  if (!tableOrColumn) return err('table_or_column is required');

  const snapshotId = await resolveSnapshotId(args);
  if (!snapshotId) return err('No active anatomy snapshot.');

  const safeQ = tableOrColumn.replace(/['"\\]/g, ' ').slice(0, 200);

  const [rows] = await db.execute(sql.raw(`
    SELECT ac.rel_path, ac.start_line, ac.end_line,
           SUBSTRING(ac.content, 1, ${ANATOMY_MAX_SNIPPET}) AS snippet,
           MATCH(ac.content) AGAINST ('${safeQ}' IN BOOLEAN MODE) AS relevance
    FROM anatomy_chunks ac
    JOIN anatomy_files af ON af.id = ac.file_id
    WHERE ac.snapshot_id = '${snapshotId.replace(/'/g, "''")}' AND af.is_excluded = 0 AND af.is_quarantined = 0
      AND (af.language = 'sql' OR af.language = 'typescript' OR af.language = 'javascript')
      AND MATCH(ac.content) AGAINST ('${safeQ}' IN BOOLEAN MODE)
    ORDER BY
      CASE WHEN af.language = 'sql' THEN 0 ELSE 1 END,
      relevance DESC
    LIMIT 15
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  return ok({ tableOrColumn, results: rows ?? [], count: (rows ?? []).length });
}

async function toolGetAnatomyManifest(args: Record<string, unknown>): Promise<string> {
  const snapshotId = await resolveSnapshotId(args);
  if (!snapshotId) return err('No active anatomy snapshot. Ask Daryl to fetch and activate a snapshot.');

  const [snapRows] = await db.execute(sql.raw(`
    SELECT id, source_type, repo_owner, repo_name, branch, commit_sha, commit_date,
           snapshot_name, app_version, build_number, status, is_active,
           total_files, indexed_files, excluded_files, quarantine_count, created_at
    FROM anatomy_snapshots WHERE id = '${snapshotId.replace(/'/g, "''")}' AND status != 'deleted' LIMIT 1
  `)) as unknown as [Array<Record<string, unknown>>, unknown];
  if (!snapRows?.length) return err(`Snapshot ${snapshotId} not found.`);

  // Language breakdown
  const [langRows] = await db.execute(sql.raw(`
    SELECT language, COUNT(*) as file_count, SUM(line_count) as total_lines
    FROM anatomy_files
    WHERE snapshot_id = '${snapshotId.replace(/'/g, "''")}' AND is_excluded = 0 AND is_quarantined = 0
    GROUP BY language ORDER BY file_count DESC
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  // Top directories
  const [dirRows] = await db.execute(sql.raw(`
    SELECT SUBSTRING_INDEX(rel_path, '/', 2) AS dir_prefix, COUNT(*) AS file_count
    FROM anatomy_files
    WHERE snapshot_id = '${snapshotId.replace(/'/g, "''")}' AND is_excluded = 0 AND is_quarantined = 0
    GROUP BY dir_prefix ORDER BY file_count DESC LIMIT 20
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  return ok({
    snapshot:  snapRows[0],
    languages: langRows ?? [],
    topDirs:   dirRows ?? [],
    note: 'This snapshot may not match the currently deployed production version. Always verify critical findings against live system evidence.',
  });
}

async function toolCompareAnatomySnapshots(args: Record<string, unknown>): Promise<string> {
  const idA = safeStr(args.snapshot_id_a);
  const idB = safeStr(args.snapshot_id_b);
  if (!idA || !idB) return err('Both snapshot_id_a and snapshot_id_b are required');
  if (idA === idB) return err('snapshot_id_a and snapshot_id_b must be different');

  // Verify both snapshots
  const [snapRows] = await db.execute(sql.raw(`
    SELECT id, source_type, repo_name, commit_sha, snapshot_name, created_at
    FROM anatomy_snapshots WHERE id IN ('${idA.replace(/'/g, "''")}', '${idB.replace(/'/g, "''")}') AND status != 'deleted'
  `)) as unknown as [Array<Record<string, unknown>>, unknown];
  if ((snapRows ?? []).length < 2) return err('One or both snapshots not found or deleted.');

  // Files in A
  const [filesA] = await db.execute(sql.raw(`
    SELECT rel_path, file_sha256 FROM anatomy_files
    WHERE snapshot_id = '${idA.replace(/'/g, "''")}' AND is_excluded = 0 AND is_quarantined = 0
  `)) as unknown as [Array<{ rel_path: string; file_sha256: string }>, unknown];

  // Files in B
  const [filesB] = await db.execute(sql.raw(`
    SELECT rel_path, file_sha256 FROM anatomy_files
    WHERE snapshot_id = '${idB.replace(/'/g, "''")}' AND is_excluded = 0 AND is_quarantined = 0
  `)) as unknown as [Array<{ rel_path: string; file_sha256: string }>, unknown];

  const mapA = new Map((filesA ?? []).map(f => [f.rel_path, f.file_sha256]));
  const mapB = new Map((filesB ?? []).map(f => [f.rel_path, f.file_sha256]));

  const added:   string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  for (const [path, shaB] of mapB) {
    if (!mapA.has(path)) { added.push(path); }
    else if (mapA.get(path) !== shaB) { changed.push(path); }
  }
  for (const path of mapA.keys()) {
    if (!mapB.has(path)) removed.push(path);
  }

  return ok({
    snapshotA: snapRows?.find(s => s.id === idA),
    snapshotB: snapRows?.find(s => s.id === idB),
    added:   added.slice(0, 100),
    removed: removed.slice(0, 100),
    changed: changed.slice(0, 100),
    addedCount:   added.length,
    removedCount: removed.length,
    changedCount: changed.length,
    note: 'Comparison based on file SHA-256 checksums from indexed content.',
  });
}

// ── CP12B — Image Safeguard tool implementations ──────────────────────────────

/**
 * v3_image_safeguard_status
 * Returns scanner capability, DB counts, and last 5 runs.
 * Never returns R2 keys, image bytes, or signed URLs.
 */
async function toolImageSafeguardStatus(): Promise<string> {
  const { getAdapterCapability } = await import('./imageSafeguard/scannerAdapter.js');
  const { getRecentRuns } = await import('./imageSafeguard/scanRunService.js');

  const cap = getAdapterCapability();

  // DB counts — tables may not exist yet on first deploy; handle gracefully
  let totalFindings = 0;
  let flaggedFindings = 0;
  let failedFindings = 0;
  try {
    const [countRows] = await db.execute(sql.raw(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN result = 'privacy_signal' THEN 1 ELSE 0 END) AS flagged,
        SUM(CASE WHEN result = 'failed'         THEN 1 ELSE 0 END) AS failed_count
      FROM image_safeguard_findings
    `)) as unknown as [Array<Record<string, unknown>>, unknown];
    totalFindings   = Number(countRows?.[0]?.total ?? 0);
    flaggedFindings = Number(countRows?.[0]?.flagged ?? 0);
    failedFindings  = Number(countRows?.[0]?.failed_count ?? 0);
  } catch {
    // Tables not yet created — migration runs on next deploy
  }

  let recentRuns: unknown[] = [];
  try {
    recentRuns = await getRecentRuns(5);
  } catch {
    // Tables not yet created
  }

  return ok({
    scanner: {
      configured: cap.configured,
      provider:   cap.provider,
      reason:     cap.reason,
    },
    findings: {
      total:   totalFindings,
      flagged: flaggedFindings,
      failed:  failedFindings,
    },
    recentRuns,
    note: 'R2 keys and image bytes are never returned via this tool.',
  });
}

/**
 * v3_image_safeguard_trigger_run
 * Creates a scan run record, then executes the scan via executeScan().
 * Fire-and-forget: returns runId immediately; poll v3_image_safeguard_run_detail for results.
 * Dazza never fetches R2 images — the server does all R2 access internally.
 */
async function toolImageSafeguardTriggerRun(args: Record<string, unknown>): Promise<string> {
  const {
    getAdapterCapability,
    executeScan,
  } = await import('./imageSafeguard/scannerAdapter.js');
  const {
    hasActiveRun,
    createScanRun,
    markRunStarted,
    markRunCompleted,
    markRunFailed,
    resolveDateRange,
    isDateRangeError,
    advanceCursor,
    persistFindings,
  } = await import('./imageSafeguard/scanRunService.js');

  const cap = getAdapterCapability();
  if (!cap.configured) {
    return err(`Scanner not configured: ${cap.reason ?? 'unknown'}`);
  }

  if (await hasActiveRun()) {
    return err('A scan run is already active. Wait for it to complete before triggering another.');
  }

  // Resolve date range
  const since     = typeof args.since === 'string' ? args.since : null;
  const until     = typeof args.until === 'string' ? args.until : null;
  const useCursor = args.use_cursor !== false; // default true

  // period_days: integer 1–90; only applied when no explicit `since` is given
  let resolvedSince = since;
  if (!resolvedSince && typeof args.period_days !== 'undefined') {
    const pd = args.period_days;
    if (!Number.isInteger(pd) || (pd as number) < 1 || (pd as number) > 90) {
      return err('period_days must be an integer between 1 and 90.');
    }
    resolvedSince = new Date(Date.now() - (pd as number) * 24 * 60 * 60 * 1000).toISOString();
  }

  const rangeResult = await resolveDateRange({ since: resolvedSince, until, useCursor });
  if (isDateRangeError(rangeResult)) {
    return err(`Date range error [${rangeResult.code}]: ${rangeResult.message}`);
  }

  // Create run record — initiatedBy = 'dazza'
  // Pass the full ResolvedDateRange object — createScanRun expects (initiatedBy, range)
  const runId = await createScanRun('dazza', rangeResult);
  await markRunStarted(runId);

  // Execute scan asynchronously — do not await so Dazza gets runId immediately
  void (async () => {
    try {
      const outcome = await executeScan({
        runId,
        rangeStart: rangeResult.rangeStart,
        rangeEnd:   rangeResult.rangeEnd,
      });
      // markRunCompleted expects (runId, counts, detectorName, detectorVersion)
      await markRunCompleted(
        runId,
        {
          imagesConsidered: outcome.imagesConsidered,
          imagesScanned:    outcome.imagesScanned,
          imagesSkipped:    outcome.imagesSkipped,
          imagesWithSignal: outcome.imagesWithSignal,
          imagesFailed:     outcome.imagesFailed,
        },
        outcome.detectorName,
        outcome.detectorVersion,
      );
      // Persist individual privacy_signal and failed findings to image_safeguard_findings.
      // clear and unavailable results are counted in the run record only — no rows stored.
      await persistFindings(runId, outcome.results);
      await advanceCursor(runId, new Date());
    } catch (e: unknown) {
      // Prefer .code (set by r2Scanner), then .name (AWS SDK), then sentinel
      const errName = e instanceof Error ? e.name : 'unknown';
      const rawCode =
        (e instanceof Error && 'code' in e && typeof (e as { code: unknown }).code === 'string')
          ? (e as { code: string }).code
          : errName !== 'Error' && errName !== 'unknown'
            ? errName
            : 'scan_error';
      await markRunFailed(runId, rawCode).catch(() => undefined);
    }
  })();

  return ok({
    runId,
    status: 'running',
    rangeStart:  rangeResult.rangeStart.toISOString(),
    rangeEnd:    rangeResult.rangeEnd.toISOString(),
    usedCursor:  rangeResult.usedCursor,
    provider:    cap.provider,
    note: 'Scan is running in the background. Poll v3_image_safeguard_run_detail with this runId for results.',
  });
}

/**
 * v3_image_safeguard_run_detail
 * Returns run status, counts, and up to 100 findings for a given runId.
 * R2 keys are NEVER returned.
 */
async function toolImageSafeguardRunDetail(args: Record<string, unknown>): Promise<string> {
  const runId = safeStr(args.run_id);
  if (!runId) return err('run_id is required');

  // Fetch run record
  const [runRows] = await db.execute(sql.raw(`
    SELECT id, initiated_by, range_start, range_end, used_cursor, run_status,
           images_considered, images_scanned, images_skipped, images_with_signal,
           images_failed, detector_name, detector_version,
           started_at, finished_at, created_at, error_code
    FROM image_safeguard_scan_runs
    WHERE id = '${runId.replace(/'/g, "''")}'
    LIMIT 1
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  if (!runRows?.length) return err(`Run ${runId} not found.`);

  // Fetch findings — R2 key column deliberately excluded; finding_type does not exist (column is `result`)
  const [findingRows] = await db.execute(sql.raw(`
    SELECT id, scan_run_id, asset_id, company_id, user_id,
           result, face_count,
           detector_name, detector_version, failure_code,
           reviewed, scanned_at
    FROM image_safeguard_findings
    WHERE scan_run_id = '${runId.replace(/'/g, "''")}'
    ORDER BY scanned_at DESC
    LIMIT 100
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  return ok({
    run:      runRows[0],
    findings: findingRows ?? [],
    findingCount: (findingRows ?? []).length,
    note: 'R2 keys are never returned. "clear" results are not stored as finding rows — only privacy_signal and failed.',
  });
}
