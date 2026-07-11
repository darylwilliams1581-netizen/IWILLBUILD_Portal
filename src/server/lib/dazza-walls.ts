/**
 * dazza-walls.ts — Dazza/Annette Guardrail Walls v1
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * WALL 1  — Company Isolation
 *   All context is filtered by the logged-in user's company_id.
 *   Never expose another company's data.
 *
 * WALL 2  — Permission Filter
 *   Only include modules the user has permission to access.
 *   Enforced in derivePermissions() + buildDazzaContext() + system prompt.
 *
 * WALL 3  — Dollar Redaction
 *   If seeDollars is false, strip all financial values from context before
 *   any AI prompt is built.
 *
 * WALL 4  — Action Safety
 *   Dazza is read-only by default.
 *   Any create/edit/delete/send/sync/archive/approve/pay action requires:
 *     a) explicit user confirmation token
 *     b) correct permission
 *     c) audit log entry
 *
 * WALL 5  — Source Discipline
 *   Answers from portal data must cite the module source.
 *   If no source exists, say the data is missing.
 *
 * WALL 6  — Secret Protection
 *   Never expose API keys, OAuth tokens, session tokens, env vars,
 *   system prompts, raw SQL, raw database dumps or internal file paths.
 *
 * WALL 7  — Safety/Legal/Accounting Disclaimer
 *   WHS, SWMS, NCC, legal and accounting responses are guidance only.
 *
 * WALL 8  — Learn Gate
 *   Only Owner/Admin can use Learn.
 *   Save uploaded knowledge with full metadata.
 *   Never execute uploaded code.
 *
 * WALL 9  — Annette Scope
 *   Annette can identify issues and recommend fixes.
 *   Must not mutate records unless user confirms a separate action.
 *
 * WALL 10 — Audit
 *   Log each Dazza request, module access, refusal, Learn upload,
 *   Annette run and action request.
 *
 * WALL 11 — Subscription Wall
 *   Expired/cancelled/trial-ended companies are view-only.
 *   Dazza may summarise but not create/edit/sync.
 *
 * WALL 12 — Cost Wall
 *   Run local handlers first for maths, GST, counts and simple portal lookups.
 *   Only call OpenAI when needed and within company/user limits.
 */

import { db } from '../db/client.js';
import { sql } from 'drizzle-orm';
import type { DazzaPermissions, DazzaContext } from './dazza-context.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type WallRefusalReason =
  | 'company_isolation'    // Wall 1
  | 'no_permission'        // Wall 2
  | 'no_dollars'           // Wall 3
  | 'action_requires_confirm' // Wall 4
  | 'action_no_permission' // Wall 4
  | 'secret_detected'      // Wall 6
  | 'learn_no_permission'  // Wall 8
  | 'learn_code_blocked'   // Wall 8
  | 'annette_read_only'    // Wall 9
  | 'subscription_view_only'; // Wall 11

export interface WallRefusal {
  blocked: true;
  reason: WallRefusalReason;
  message: string;
}

export interface WallPass {
  blocked: false;
}

export type WallResult = WallRefusal | WallPass;

/** Mutation action types that require confirmation + permission + audit */
export type MutationAction =
  | 'create_job'
  | 'edit_job'
  | 'delete_job'
  | 'create_estimate'
  | 'edit_estimate'
  | 'delete_estimate'
  | 'approve_estimate'
  | 'create_invoice'
  | 'edit_invoice'
  | 'delete_invoice'
  | 'send_invoice'
  | 'pay_invoice'
  | 'sync_xero'
  | 'sync_myob'
  | 'archive_record'
  | 'delete_record'
  | 'create_form'
  | 'submit_form'
  | 'create_swms'
  | 'approve_swms'
  | 'create_user'
  | 'edit_user'
  | 'delete_user'
  | 'send_email'
  | 'upload_file'
  | 'delete_file';

/** Subscription states that put a company into view-only mode */
const VIEW_ONLY_SUBSCRIPTION_STATES = new Set([
  'trial_expired',
  'cancelled',
  'suspended',
]);

// ── WALL 1: Company Isolation ─────────────────────────────────────────────────

/**
 * Checks whether a question is attempting to access another company's data.
 * Returns a WallRefusal if the cross-company pattern is detected.
 */
export function wall1_companyIsolation(
  question: string,
  companyName: string,
): WallResult {
  const crossCompanyPattern =
    // eslint-disable-next-line security/detect-unsafe-regex -- alternation is bounded: each branch is a fixed keyword phrase; input is a short user chat message (< 2 KB), not attacker-controlled unbounded input
    /another company|other company|different company|competitor|someone else'?s?\s+(quote|job|data|estimate|invoice|fleet|form)/i;

  if (crossCompanyPattern.test(question)) {
    return {
      blocked: true,
      reason: 'company_isolation',
      message:
        `I can only access data for **${companyName}**. ` +
        `I cannot access, compare, or reveal data from any other company.\n\n` +
        `📦 Source modules:\nNo portal data used — security boundary.\n\n` +
        `📊 Confidence:\nHigh — this is a security boundary, not a data question.`,
    };
  }
  return { blocked: false };
}

// ── WALL 2: Permission Filter ─────────────────────────────────────────────────

/**
 * Checks whether the user has permission to access the requested module.
 * Returns a WallRefusal if the module is gated and the user lacks access.
 */
export function wall2_permissionFilter(
  question: string,
  permissions: DazzaPermissions,
): WallResult {
  const q = question.toLowerCase();

  const checks: Array<{ pattern: RegExp; flag: keyof DazzaPermissions; label: string }> = [
    { pattern: /\bjob\b|jobs|site|project|work order|schedule|gantt|supervisor|crew/i, flag: 'canJobs', label: 'Jobs' },
    { pattern: /\bfleet\b|vehicle|truck|excavator|plant|prestart|rego|service due|asset/i, flag: 'canFleet', label: 'Fleet' },
    { pattern: /\bform\b|forms|template|submission|sign.?off|inspection|checklist/i, flag: 'canForms', label: 'Forms' },
    { pattern: /\bestimate\b|quote|quoted|estimating|cost guide|markup|margin/i, flag: 'canEstimating', label: 'Estimating' },
    { pattern: /\bfile\b|files|document|attachment|upload|photo|drawing/i, flag: 'canFiles', label: 'Files' },
  ];

  for (const { pattern, flag, label } of checks) {
    if (pattern.test(q) && !permissions[flag]) {
      return {
        blocked: true,
        reason: 'no_permission',
        message:
          `You don't have **${label}** access. ` +
          `Please contact your administrator if you need access to this module.\n\n` +
          `📦 Source modules:\nNone — permission denied.\n\n` +
          `📊 Confidence:\nHigh — permission check is definitive.`,
      };
    }
  }

  return { blocked: false };
}

// ── WALL 3: Dollar Redaction ──────────────────────────────────────────────────

/**
 * Checks whether the question is asking for financial data the user cannot see.
 * Returns a WallRefusal if seeDollars is false and the question is financial.
 */
export function wall3_dollarCheck(
  question: string,
  permissions: DazzaPermissions,
): WallResult {
  if (permissions.seeDollars) return { blocked: false };

  const financialPattern =
    /\$|dollar|cost|price|rate|total|subtotal|gst|margin|markup|profit|revenue|invoice amount|quote amount|estimate total|how much|budget|spend|expenditure|ledger|financial/i;

  if (financialPattern.test(question)) {
    return {
      blocked: true,
      reason: 'no_dollars',
      message:
        `I can't show cost values, rates, or financial totals with your current permissions.\n\n` +
        `📦 Source modules:\nNone — financial data access denied.\n\n` +
        `📊 Confidence:\nHigh — permission check is definitive.`,
    };
  }

  return { blocked: false };
}

/**
 * Redacts dollar values and financial fields from a context object before
 * it is serialised into an AI system prompt.
 * Called in buildDazzaContext() when seeDollars is false.
 */
export function wall3_redactDollarsFromContext(ctx: DazzaContext): DazzaContext {
  if (ctx.permissions.seeDollars) return ctx;

  const DOLLAR_FIELDS = [
    'rate', 'subtotal', 'gst', 'total', 'markup_percent', 'gst_mode',
    'amount', 'amount_paid', 'balance_due', 'unit_price', 'line_total',
    'approved_estimate', 'total_actual', 'total_gst', 'total_ex_gst',
    'margin', 'profit', 'revenue', 'cost', 'price', 'budget',
  ];

  function redactObj(obj: unknown): unknown {
    if (Array.isArray(obj)) return obj.map(redactObj);
    if (obj && typeof obj === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        if (DOLLAR_FIELDS.some((f) => k.toLowerCase().includes(f))) {
          out[k] = '[REDACTED — no financial access]';
        } else {
          out[k] = redactObj(v);
        }
      }
      return out;
    }
    return obj;
  }

  return {
    ...ctx,
    estimates:   ctx.estimates   ? (redactObj(ctx.estimates)   as unknown[]) : undefined,
    jobCosts:    ctx.jobCosts    ? (redactObj(ctx.jobCosts)    as unknown[]) : undefined,
    jobs:        ctx.jobs        ? (redactObj(ctx.jobs)        as unknown[]) : undefined,
  };
}

// ── WALL 4: Action Safety ─────────────────────────────────────────────────────

/**
 * Mutation keywords that indicate the user is requesting a write action.
 * Dazza is read-only by default — these must be intercepted.
 */
const MUTATION_PATTERNS: Array<{ pattern: RegExp; action: MutationAction; requiredPermission: keyof DazzaPermissions | null }> = [
  { pattern: /create.*job|add.*job|new.*job|make.*job/i,           action: 'create_job',       requiredPermission: 'canJobs' },
  { pattern: /edit.*job|update.*job|change.*job|modify.*job/i,     action: 'edit_job',         requiredPermission: 'canJobs' },
  { pattern: /delete.*job|remove.*job|archive.*job/i,              action: 'delete_job',       requiredPermission: 'isAdmin' },
  { pattern: /create.*estimate|add.*estimate|new.*quote/i,         action: 'create_estimate',  requiredPermission: 'canEstimating' },
  { pattern: /edit.*estimate|update.*estimate|change.*quote/i,     action: 'edit_estimate',    requiredPermission: 'canEstimating' },
  { pattern: /approve.*estimate|approve.*quote/i,                  action: 'approve_estimate', requiredPermission: 'isAdmin' },
  { pattern: /create.*invoice|add.*invoice|new.*invoice/i,         action: 'create_invoice',   requiredPermission: 'canJobs' },
  { pattern: /send.*invoice|email.*invoice/i,                      action: 'send_invoice',     requiredPermission: 'canJobs' },
  { pattern: /pay.*invoice|mark.*paid|record.*payment/i,           action: 'pay_invoice',      requiredPermission: 'isAdmin' },
  { pattern: /sync.*xero|push.*xero|export.*xero/i,                action: 'sync_xero',        requiredPermission: 'isAdmin' },
  { pattern: /sync.*myob|push.*myob|export.*myob/i,                action: 'sync_myob',        requiredPermission: 'isAdmin' },
  { pattern: /delete.*file|remove.*file/i,                         action: 'delete_file',      requiredPermission: 'canFiles' },
  { pattern: /approve.*swms|sign.*swms/i,                          action: 'approve_swms',     requiredPermission: 'isAdmin' },
  { pattern: /send.*email|email.*to/i,                             action: 'send_email',       requiredPermission: 'isAdmin' },
];

export interface ActionCheckResult {
  isMutation: boolean;
  action?: MutationAction;
  hasPermission?: boolean;
  /** If true, the action is detected but needs explicit confirmation from the user */
  requiresConfirmation?: boolean;
  refusalMessage?: string;
}

/**
 * Checks whether a question is requesting a mutation action.
 * Returns the action type and whether the user has permission.
 * Dazza NEVER executes mutations — it only surfaces them for user confirmation.
 */
export function wall4_actionSafety(
  question: string,
  permissions: DazzaPermissions,
  isViewOnly: boolean,
): ActionCheckResult {
  for (const { pattern, action, requiredPermission } of MUTATION_PATTERNS) {
    if (pattern.test(question)) {
      // Subscription view-only check
      if (isViewOnly) {
        return {
          isMutation: true,
          action,
          hasPermission: false,
          requiresConfirmation: false,
          refusalMessage:
            `Your account is currently in **view-only mode** (subscription expired or suspended). ` +
            `I can summarise your data but cannot create, edit, or sync records. ` +
            `Please renew your subscription to re-enable write access.\n\n` +
            `📦 Source modules:\nNone — subscription wall.\n\n` +
            `📊 Confidence:\nHigh — subscription status is definitive.`,
        };
      }

      // Permission check
      const hasPerm = requiredPermission === null
        ? true
        : requiredPermission === 'isAdmin'
          ? permissions.isAdmin
          : requiredPermission === 'isOwner'
            ? permissions.isOwner
            : Boolean(permissions[requiredPermission as keyof DazzaPermissions]);

      if (!hasPerm) {
        return {
          isMutation: true,
          action,
          hasPermission: false,
          requiresConfirmation: false,
          refusalMessage:
            `You don't have permission to **${action.replace(/_/g, ' ')}**. ` +
            `Please contact your administrator.\n\n` +
            `📦 Source modules:\nNone — permission denied.\n\n` +
            `📊 Confidence:\nHigh — permission check is definitive.`,
        };
      }

      // Has permission — but still requires explicit confirmation
      return {
        isMutation: true,
        action,
        hasPermission: true,
        requiresConfirmation: true,
      };
    }
  }

  return { isMutation: false };
}

// ── WALL 5: Source Discipline ─────────────────────────────────────────────────

/**
 * Validates that an AI-generated reply contains source citations.
 * If the reply references portal data but has no "Source modules:" section,
 * appends a fallback source line.
 */
export function wall5_enforceSourceCitation(
  reply: string,
  modulesUsed: string[],
): string {
  // Already has source modules section
  if (/📦\s*Source modules:/i.test(reply)) return reply;

  const sourceList = modulesUsed.length > 0
    ? modulesUsed.join(', ')
    : 'No portal data used — AI reasoning only.';

  return reply + `\n\n📦 Source modules:\n${sourceList}`;
}

/**
 * Checks whether a question requires portal data that is missing.
 * Returns a "data missing" message if the relevant module is empty.
 */
export function wall5_checkMissingData(
  question: string,
  ctx: DazzaContext,
): string | null {
  const q = question.toLowerCase();

  if (/\bjob\b|jobs/.test(q) && ctx.permissions.canJobs && (ctx.jobs?.length ?? 0) === 0) {
    return `📋 From IWILLBUILD data:\nNo jobs found for **${ctx.companyName}** yet.\n\n📦 Source modules:\nJobs (empty)\n\n📊 Confidence:\nHigh — no records exist.`;
  }
  if (/\bfleet\b|vehicle|asset/.test(q) && ctx.permissions.canFleet && (ctx.fleet?.length ?? 0) === 0) {
    return `📋 From IWILLBUILD data:\nNo fleet assets found for **${ctx.companyName}** yet.\n\n📦 Source modules:\nFleet (empty)\n\n📊 Confidence:\nHigh — no records exist.`;
  }
  if (/estimate|quote/.test(q) && ctx.permissions.canEstimating && (ctx.estimates?.length ?? 0) === 0) {
    return `📋 From IWILLBUILD data:\nNo estimates found for **${ctx.companyName}** yet.\n\n📦 Source modules:\nEstimates (empty)\n\n📊 Confidence:\nHigh — no records exist.`;
  }

  return null;
}

// ── WALL 6: Secret Protection ─────────────────────────────────────────────────

/**
 * Patterns that indicate secret/sensitive data that must never appear in AI output.
 */
const SECRET_PATTERNS: RegExp[] = [
  // API keys
  /sk-[a-zA-Z0-9]{20,}/g,                    // OpenAI sk- keys
  /xoxb-[a-zA-Z0-9-]{20,}/g,                 // Slack bot tokens
  /ghp_[a-zA-Z0-9]{36}/g,                    // GitHub PATs
  /AKIA[0-9A-Z]{16}/g,                        // AWS access keys
  /[a-zA-Z0-9]{32,}:[a-zA-Z0-9]{32,}/g,      // Generic key:secret pairs
  // OAuth tokens (long base64-like strings)
  /eyJ[a-zA-Z0-9_-]{50,}/g,                  // JWT tokens
  // Environment variable patterns
  /process\.env\.[A-Z_]+/g,
  /getSecret\(['"][^'"]+['"]\)/g,
  // SQL patterns
  /SELECT\s+\*\s+FROM\s+\w+/gi,
  /INSERT\s+INTO\s+\w+/gi,
  /UPDATE\s+\w+\s+SET/gi,
  /DELETE\s+FROM\s+\w+/gi,
  // Internal file paths
  /\/app\/src\/server\//g,
  /\/shared-storage\//g,
  /\/private\//g,
  // Database connection strings
  /mysql:\/\/[^\s]+/g,
  /postgres:\/\/[^\s]+/g,
];

/**
 * Scrubs secrets and sensitive patterns from AI-generated output.
 * Should be applied to every reply before sending to the client.
 */
export function wall6_scrubSecrets(text: string): string {
  let out = text;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, '[REDACTED]');
  }
  return out;
}

/**
 * Checks whether an input question is attempting to extract secrets.
 */
export function wall6_detectSecretProbe(question: string): WallResult {
  const probePatterns = [
    /api.?key|secret.?key|access.?token|oauth.?token|bearer.?token/i,
    /openai.?key|stripe.?key|xero.?secret|twilio.?auth/i,
    /process\.env|getSecret|\.env\b/i,
    /system.?prompt|your.?instructions|your.?prompt|ignore.?previous/i,
    /raw.?sql|database.?dump|show.?tables|show.?columns|describe.?table/i,
    /internal.?path|file.?path|server.?path|source.?code/i,
    /session.?token|cookie.?value|auth.?header/i,
  ];

  for (const p of probePatterns) {
    if (p.test(question)) {
      return {
        blocked: true,
        reason: 'secret_detected',
        message:
          `I can't share API keys, tokens, system configuration, or internal details.\n\n` +
          `📦 Source modules:\nNone — security boundary.\n\n` +
          `📊 Confidence:\nHigh — this is a security boundary.`,
      };
    }
  }

  return { blocked: false };
}

// ── WALL 7: Safety/Legal/Accounting Disclaimer ────────────────────────────────

/** Topics that require a guidance-only disclaimer */
const DISCLAIMER_TOPICS: Array<{ pattern: RegExp; topic: string }> = [
  { pattern: /\bwhs\b|work.?health.?safety|occupational.?health|ohs\b|safety.?regulation|safe.?work/i, topic: 'WHS/Safety' },
  { pattern: /\bswms\b|safe.?work.?method|method.?statement/i, topic: 'SWMS' },
  { pattern: /\bncc\b|national.?construction.?code|building.?code|bca\b|deemed.?to.?satisfy/i, topic: 'NCC/Building Code' },
  { pattern: /legal.?advice|contract.?law|liability|negligence|indemnity|dispute.?resolution/i, topic: 'Legal' },
  { pattern: /tax.?advice|accounting.?advice|gst.?treatment|depreciation|write.?off|ato\b|tax.?return/i, topic: 'Accounting/Tax' },
  { pattern: /asbestos|hazardous.?material|dangerous.?goods|chemical.?safety|silica/i, topic: 'Hazardous Materials' },
  { pattern: /first.?aid|medical.?emergency|injury.?treatment|health.?advice/i, topic: 'Medical/First Aid' },
];

/**
 * Returns a disclaimer string if the question touches a regulated topic.
 * Returns null if no disclaimer is needed.
 */
export function wall7_getDisclaimer(question: string): string | null {
  const matched: string[] = [];
  for (const { pattern, topic } of DISCLAIMER_TOPICS) {
    if (pattern.test(question)) matched.push(topic);
  }
  if (matched.length === 0) return null;

  const topics = matched.join(', ');
  return (
    `⚠️ Verification reminder:\n` +
    `This response covers **${topics}** topics. ` +
    `It is **guidance only** and must be verified by a competent person, ` +
    `registered professional, or responsible party before being relied upon. ` +
    `Always check against current legislation, Australian Standards, project documents, ` +
    `and site-specific conditions.`
  );
}

/**
 * Injects a disclaimer into a reply if the question requires one.
 * Replaces any existing verification reminder to avoid duplication.
 */
export function wall7_injectDisclaimer(reply: string, question: string): string {
  const disclaimer = wall7_getDisclaimer(question);
  if (!disclaimer) return reply;

  // Replace existing verification reminder if present
  if (/⚠️\s*Verification reminder:/i.test(reply)) {
    return reply.replace(/⚠️\s*Verification reminder:[^\n]*/i, disclaimer);
  }

  return reply + '\n\n' + disclaimer;
}

// ── WALL 8: Learn Gate ────────────────────────────────────────────────────────

/** Code execution patterns that must never be stored as knowledge */
const CODE_EXECUTION_PATTERNS: RegExp[] = [
  /<script[\s>]/i,
  /javascript:/i,
  /eval\s*\(/i,
  /Function\s*\(/i,
  /require\s*\(['"]/i,
  /import\s+.*from\s+['"]/i,
  /process\.exit/i,
  /child_process/i,
  /exec\s*\(/i,
  /spawn\s*\(/i,
  /fs\.(read|write|unlink|rm)/i,
  /fetch\s*\(/i,
  /XMLHttpRequest/i,
  /\$\{.*\}/,  // template literal injection
  /`[^`]*`/,   // backtick strings (potential injection)
];

export interface LearnGateResult {
  allowed: boolean;
  reason?: string;
  /** Sanitised content safe to store (code stripped) */
  sanitisedContent?: string;
}

/**
 * Validates a Learn upload before it is stored.
 * - Owner/Admin only
 * - Strips and blocks code execution patterns
 * - Returns sanitised content
 */
export function wall8_learnGate(
  content: string,
  isAdmin: boolean,
  isOwner: boolean,
): LearnGateResult {
  if (!isAdmin && !isOwner) {
    return {
      allowed: false,
      reason: 'Only Owner or Admin users can add knowledge to the Learn system.',
    };
  }

  // Check for code execution patterns
  for (const pattern of CODE_EXECUTION_PATTERNS) {
    if (pattern.test(content)) {
      return {
        allowed: false,
        reason:
          `The uploaded content contains code or script patterns that cannot be stored. ` +
          `Knowledge entries must be plain text only — no JavaScript, HTML, or executable code.`,
      };
    }
  }

  // Sanitise: strip HTML tags, limit length
  const sanitised = content
    .replace(/<[^>]+>/g, '')           // strip HTML
    .replace(/\r\n/g, '\n')            // normalise line endings
    .trim()
    .slice(0, 50_000);                 // hard cap at 50k chars

  return { allowed: true, sanitisedContent: sanitised };
}

// ── WALL 9: Annette Scope Guard ───────────────────────────────────────────────

/**
 * Patterns that indicate Annette is being asked to mutate data.
 * Annette is analysis-only — it must never execute mutations.
 */
const ANNETTE_MUTATION_PATTERNS: RegExp[] = [
  // eslint-disable-next-line security/detect-unsafe-regex -- alternation over fixed keyword lists; input is a short user chat message, not unbounded attacker input
  /fix\s+(?:the|this|all|these)\s+(?:job|invoice|estimate|form|record|entry)/i,
  // eslint-disable-next-line security/detect-unsafe-regex -- same as above
  /update\s+(?:the|this|all|these)\s+(?:job|invoice|estimate|form|record)/i,
  // eslint-disable-next-line security/detect-unsafe-regex -- same as above
  /delete\s+(?:the|this|all|these)\s+(?:job|invoice|estimate|form|record)/i,
  // eslint-disable-next-line security/detect-unsafe-regex -- same as above
  /create\s+(?:a|the|new)\s+(?:job|invoice|estimate|form|record)/i,
  // eslint-disable-next-line security/detect-unsafe-regex -- same as above
  /send\s+(?:the|this|an)\s+(?:invoice|email|notification)/i,
  // eslint-disable-next-line security/detect-unsafe-regex -- same as above
  /approve\s+(?:the|this|all)\s+(?:estimate|swms|invoice)/i,
  // eslint-disable-next-line security/detect-unsafe-regex -- same as above
  /sync\s+(?:to|with)\s+(?:xero|myob|accounting)/i,
];

/**
 * Checks whether an Annette request is attempting a mutation.
 * Returns a read-only boundary message if so.
 */
export function wall9_annetteScope(question: string): WallResult {
  for (const pattern of ANNETTE_MUTATION_PATTERNS) {
    if (pattern.test(question)) {
      return {
        blocked: true,
        reason: 'annette_read_only',
        message:
          `Annette is an analysis tool — she can identify issues and recommend fixes, ` +
          `but cannot directly create, edit, delete, or sync records. ` +
          `To act on Annette's recommendations, use the relevant module in IWILLBUILD ` +
          `(Jobs, Invoices, Estimates, etc.) and confirm the action there.`,
      };
    }
  }
  return { blocked: false };
}

// ── WALL 10: Audit Logger ─────────────────────────────────────────────────────

export type AuditEventType =
  | 'dazza_chat'
  | 'dazza_refusal'
  | 'dazza_action_request'
  | 'annette_run'
  | 'annette_refusal'
  | 'learn_upload'
  | 'learn_upload_blocked'
  | 'learn_delete'
  | 'brain_hive_approve'
  | 'brain_hive_reject'
  | 'subscription_wall_hit'
  | 'secret_probe_blocked'
  | 'permission_denied';

export interface AuditEntry {
  companyId: number;
  userId: string;
  userName: string;
  eventType: AuditEventType;
  modulesAccessed?: string[];
  dollarsIncluded?: boolean;
  supportMode?: boolean;
  supportCompanyId?: number | null;
  questionSummary?: string;
  refusalReason?: string;
  actionType?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Writes a structured audit log entry to dazza_brain_interactions.
 * Never throws — audit failure must never block the response.
 */
export async function wall10_auditLog(entry: AuditEntry): Promise<void> {
  try {
    const summary = (entry.questionSummary ?? entry.eventType).slice(0, 490);
    const modules = (entry.modulesAccessed ?? []).join(',');
    const metadata = entry.metadata ? JSON.stringify(entry.metadata).slice(0, 500) : null;

    await db.execute(sql`
      INSERT INTO dazza_brain_interactions
        (company_id, user_id, question_summary, answer_source, modules_used,
         confidence_level, conflict_detected, dollars_included,
         support_mode, support_company_id, tokens_used)
      VALUES
        (${entry.companyId}, ${entry.userId},
         ${`[${entry.eventType}] ${summary}`},
         ${entry.refusalReason ?? entry.actionType ?? entry.eventType},
         ${modules},
         ${'High'},
         ${0},
         ${entry.dollarsIncluded ? 1 : 0},
         ${entry.supportMode ? 1 : 0},
         ${entry.supportCompanyId ?? null},
         ${0})
    `);

    // Also log to legacy audit table for backward compat
    await db.execute(sql`
      INSERT INTO dazza_audit_log
        (user_id, company_id, question_summary, modules_used,
         dollars_included, support_mode, support_company_id)
      VALUES
        (${entry.userId}, ${entry.companyId},
         ${`[${entry.eventType}] ${summary}`},
         ${modules},
         ${entry.dollarsIncluded ? 1 : 0},
         ${entry.supportMode ? 1 : 0},
         ${entry.supportCompanyId ?? null})
    `);
  } catch (err) {
    // Audit failure must NEVER block the response
    console.warn('[dazza-walls] audit log failed:', String((err as Error)?.message ?? err));
  }
}

// ── WALL 11: Subscription Wall ────────────────────────────────────────────────

export interface SubscriptionWallContext {
  subscriptionStatus: string | null;
  isOwner: boolean;
}

/**
 * Checks whether the company is in a view-only subscription state.
 * Platform owners (role === 'owner') always bypass this wall.
 */
export function wall11_subscriptionWall(ctx: SubscriptionWallContext): WallResult {
  // Platform owners always bypass
  if (ctx.isOwner) return { blocked: false };

  const status = ctx.subscriptionStatus ?? 'trial';
  if (VIEW_ONLY_SUBSCRIPTION_STATES.has(status)) {
    return {
      blocked: true,
      reason: 'subscription_view_only',
      message:
        `Your account is currently in **view-only mode** ` +
        `(subscription status: ${status}). ` +
        `I can summarise your existing data but cannot create, edit, or sync records. ` +
        `Please renew your subscription to re-enable full access.\n\n` +
        `📦 Source modules:\nNone — subscription wall.\n\n` +
        `📊 Confidence:\nHigh — subscription status is definitive.`,
    };
  }

  return { blocked: false };
}

/**
 * Resolves the subscription status for a company from the DB.
 * Returns null if the company cannot be found.
 */
export async function wall11_getSubscriptionStatus(companyId: number): Promise<string | null> {
  try {
    const [rows] = await db.execute(
      sql`SELECT subscription_status FROM companies WHERE id = ${companyId} LIMIT 1`
    ) as unknown as [Array<{ subscription_status: string | null }>, unknown];
    return rows?.[0]?.subscription_status ?? 'trial';
  } catch {
    return null;
  }
}

// ── WALL 12: Cost Wall ────────────────────────────────────────────────────────

/**
 * Determines whether a question can be answered locally without calling OpenAI.
 * Returns true if the question is a simple local operation.
 */
export function wall12_isLocalQuestion(question: string): boolean {
  const q = question.trim().toLowerCase();

  // Pure arithmetic
  if (/^[0-9\s\+\-\*\/\.\(\)%]+[=?]?$/.test(q)) return true;

  // GST calculations
  if (/(?:add|remove|calculate|what.?is)\s+gst|gst\s+on|ex\.?\s*gst|\+\s*gst/i.test(q)) return true;

  // Simple portal counts (answered by context handler, not OpenAI)
  if (/how many (jobs|fleet|forms|estimates|assets|vehicles|templates)/i.test(q)) return true;

  // Simple greetings / meta
  if (/^(hi|hello|hey|g'?day|thanks|thank you|cheers|ok|okay|yes|no|yep|nope)[\s!?.]*$/i.test(q)) return true;

  return false;
}

/**
 * Checks whether the company has a valid OpenAI key configured.
 * Returns the key or null.
 */
export async function wall12_resolveOpenAIKey(companyId: number): Promise<string | null> {
  try {
    // Check company-level key first
    const [rows] = await db.execute(
      sql`SELECT openai_api_key FROM company_settings WHERE company_id = ${companyId} LIMIT 1`
    ) as unknown as [Array<{ openai_api_key: string | null }>, unknown];
    const companyKey = rows?.[0]?.openai_api_key?.trim();
    if (companyKey) return companyKey;
  } catch { /* fall through to platform key */ }

  // Fall back to platform key (imported lazily to avoid circular deps)
  try {
    const { getSecret } = await import('#airo/secrets');
    const platformKey = getSecret('OPENAI_API_KEY');
    return platformKey ?? null;
  } catch {
    return null;
  }
}

// ── Combined Wall Runner ──────────────────────────────────────────────────────

export interface WallRunnerOptions {
  question: string;
  permissions: DazzaPermissions;
  companyName: string;
  isViewOnly: boolean;
  isOwner: boolean;
  subscriptionStatus: string | null;
  /** Pass true when running in Annette context */
  isAnnette?: boolean;
}

export interface WallRunnerResult {
  blocked: boolean;
  refusal?: WallRefusal;
  /** Action mutation detected — needs confirmation */
  mutationDetected?: ActionCheckResult;
  /** Disclaimer to append to the final reply */
  disclaimer?: string;
}

/**
 * Runs all applicable walls in order for a given question.
 * Returns immediately on first block.
 * Non-blocking walls (disclaimer, source) are returned for the caller to apply.
 */
export function runAllWalls(opts: WallRunnerOptions): WallRunnerResult {
  const { question, permissions, companyName, isViewOnly, isOwner, subscriptionStatus, isAnnette } = opts;

  // Wall 1: Company isolation
  const w1 = wall1_companyIsolation(question, companyName);
  if (w1.blocked) return { blocked: true, refusal: w1 };

  // Wall 6: Secret probe detection (run early — before permission checks)
  const w6 = wall6_detectSecretProbe(question);
  if (w6.blocked) return { blocked: true, refusal: w6 };

  // Wall 11: Subscription wall (read-only check for mutations handled in Wall 4)
  const w11 = wall11_subscriptionWall({ subscriptionStatus, isOwner });
  // Note: subscription wall only blocks mutations (handled in Wall 4).
  // Summarise/read is always allowed even in view-only mode.

  // Wall 2: Permission filter
  const w2 = wall2_permissionFilter(question, permissions);
  if (w2.blocked) return { blocked: true, refusal: w2 };

  // Wall 3: Dollar check
  const w3 = wall3_dollarCheck(question, permissions);
  if (w3.blocked) return { blocked: true, refusal: w3 };

  // Wall 9: Annette scope (only in Annette context)
  if (isAnnette) {
    const w9 = wall9_annetteScope(question);
    if (w9.blocked) return { blocked: true, refusal: w9 };
  }

  // Wall 4: Action safety (mutation detection — returns for confirmation, not hard block)
  const w4 = wall4_actionSafety(question, permissions, isViewOnly || w11.blocked);
  if (w4.isMutation && !w4.hasPermission) {
    return {
      blocked: true,
      refusal: {
        blocked: true,
        reason: 'action_no_permission',
        message: w4.refusalMessage ?? 'Action not permitted.',
      },
    };
  }
  if (w4.isMutation && w4.requiresConfirmation) {
    return { blocked: false, mutationDetected: w4 };
  }

  // Wall 7: Disclaimer (non-blocking — returned for injection)
  const disclaimer = wall7_getDisclaimer(question) ?? undefined;

  return { blocked: false, disclaimer };
}
