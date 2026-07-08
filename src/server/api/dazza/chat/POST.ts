/**
 * POST /api/dazza/chat
 * ─────────────────────────────────────────────────────────────────────────────
 * Dazza AI chat — server-side context, full guardrails, audit logging.
 *
 * Answer priority:
 *  1. Local tools  — simple math, GST, basic construction calcs
 *  2. Live context — IWILLBUILD portal data (jobs, fleet, forms, estimates, files)
 *  3. OpenAI       — general guidance / fallback
 *
 * Security:
 *  - Context is ALWAYS re-fetched server-side from the session.
 *  - permDazzaAi checked before any processing.
 *  - companyId comes from session profile only.
 *  - Support Mode: owners may pass supportCompanyId in body; verified server-side.
 *  - seeDollars enforced in buildDazzaContext() and double-enforced in system prompt.
 *  - Every sensitive-data answer is audit-logged.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles } from '../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { getSecret } from '#airo/secrets';
import {
  derivePermissions,
  buildDazzaContext,
  resolveEffectiveCompany,
  type DazzaContext,
} from '../../../lib/dazza-context.js';
import {
  processDazzaQuestion,
  detectModulesUsed as brainDetectModules,
} from '../../../lib/annette-brain.js';
import {
  runAllWalls,
  wall3_redactDollarsFromContext,
  wall5_enforceSourceCitation,
  wall6_scrubSecrets,
  wall7_injectDisclaimer,
  wall10_auditLog,
  wall11_getSubscriptionStatus,
  wall12_isLocalQuestion,
} from '../../../lib/dazza-walls.js';
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ── Local tool intercept ──────────────────────────────────────────────────────
// Handles simple questions that don't need OpenAI at all.

/**
 * Safe arithmetic evaluator — no eval / new Function.
 * Supports: integers, decimals, +, -, *, /, %, parentheses, whitespace.
 * Returns null if the expression is invalid or unsafe.
 */
function safeEval(expr: string): number | null {
  // Strict whitelist: only digits, operators, parens, dots, spaces.
  if (!/^[0-9\s+\-*/.()%]+$/.test(expr)) return null;
  if (expr.length > 200) return null;
  // Recursive-descent parser — no eval, no Function constructor.
  let pos = 0;
  const peek = () => expr[pos];
  const consume = () => expr[pos++];
  const skipWs = () => { while (pos < expr.length && expr[pos] === ' ') pos++; };

  function parseExpr(): number {
    let left = parseTerm();
    skipWs();
    while (pos < expr.length && (peek() === '+' || peek() === '-')) {
      const op = consume(); skipWs();
      const right = parseTerm();
      left = op === '+' ? left + right : left - right;
      skipWs();
    }
    return left;
  }

  function parseTerm(): number {
    let left = parseFactor();
    skipWs();
    while (pos < expr.length && (peek() === '*' || peek() === '/' || peek() === '%')) {
      const op = consume(); skipWs();
      const right = parseFactor();
      if (op === '*') left *= right;
      else if (op === '/') left = right !== 0 ? left / right : NaN;
      else left = left % right;
      skipWs();
    }
    return left;
  }

  function parseFactor(): number {
    skipWs();
    if (peek() === '(') {
      consume(); // '('
      const val = parseExpr();
      skipWs();
      if (peek() === ')') consume();
      return val;
    }
    if (peek() === '-') { consume(); return -parseFactor(); }
    if (peek() === '+') { consume(); return parseFactor(); }
    // Number
    let num = '';
    while (pos < expr.length && /[0-9.]/.test(expr[pos])) num += consume();
    return num ? parseFloat(num) : NaN;
  }

  try {
    const result = parseExpr();
    return isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

/**
 * Apply a regex only against a pre-validated, length-capped string.
 * This makes it explicit to static analysers that the input is bounded
 * before any regex execution, preventing catastrophic backtracking.
 */
function matchSafe(pattern: RegExp, input: string): RegExpMatchArray | null {
  // Input MUST already be sliced to ≤500 chars before calling this helper.
  // The assertion here documents the invariant for static analysis tools.
  if (input.length > 500) return null;
  return input.match(pattern);
}

function tryLocalTool(question: string): string | null {
  // Cap input length before any regex to prevent catastrophic backtracking.
  const q = question.trim().slice(0, 500);

  // ── Simple arithmetic ─────────────────────────────────────────────────────
  const mathMatch = matchSafe(/^(?:what\s+is\s+|calculate\s+|calc\s+|work\s+out\s+)?([0-9\s+\-*/.()%]+)=?$/i, q);
  if (mathMatch) {
    const expr = mathMatch[1].trim();
    const result = safeEval(expr);
    if (result !== null) {
      return `${result}`;
    }
  }

  // ── GST add ───────────────────────────────────────────────────────────────
  const gstAddMatch = matchSafe(/(?:add\s+gst\s+to|gst\s+on|plus\s+gst|add\s+10%\s+to)\s*\$?([\d,]+(?:\.\d+)?)/i, q)
    ?? matchSafe(/\$?([\d,]+(?:\.\d+)?)\s*\+\s*gst/i, q);
  if (gstAddMatch) {
    const base = parseFloat(gstAddMatch[1].replace(/,/g, ''));
    if (!isNaN(base)) {
      const gst = +(base * 0.1).toFixed(2);
      const total = +(base + gst).toFixed(2);
      return `GST calculation:\n• Base: $${base.toLocaleString('en-AU', { minimumFractionDigits: 2 })}\n• GST (10%): $${gst.toLocaleString('en-AU', { minimumFractionDigits: 2 })}\n• Total inc. GST: $${total.toLocaleString('en-AU', { minimumFractionDigits: 2 })}`;
    }
  }

  // ── GST remove ────────────────────────────────────────────────────────────
  const gstRemoveMatch = matchSafe(/(?:remove\s+gst\s+from|ex\s+gst\s+|excluding\s+gst\s+|gst\s+exclusive\s+of)\s*\$?([\d,]+(?:\.\d+)?)/i, q)
    ?? matchSafe(/\$?([\d,]+(?:\.\d+)?)\s+ex\.?\s+gst/i, q);
  if (gstRemoveMatch) {
    const total = parseFloat(gstRemoveMatch[1].replace(/,/g, ''));
    if (!isNaN(total)) {
      const base = +(total / 1.1).toFixed(2);
      const gst = +(total - base).toFixed(2);
      return `GST removal:\n• Total inc. GST: $${total.toLocaleString('en-AU', { minimumFractionDigits: 2 })}\n• GST (10%): $${gst.toLocaleString('en-AU', { minimumFractionDigits: 2 })}\n• Base ex. GST: $${base.toLocaleString('en-AU', { minimumFractionDigits: 2 })}`;
    }
  }

  // ── Markup / margin calculator ────────────────────────────────────────────
  const markupMatch = matchSafe(/add\s+([\d.]+)%\s+markup\s+(?:to\s+)?\$?([\d,]+(?:\.\d+)?)/i, q);
  if (markupMatch) {
    const pct = parseFloat(markupMatch[1]);
    const base = parseFloat(markupMatch[2].replace(/,/g, ''));
    if (!isNaN(pct) && !isNaN(base)) {
      const markup = +(base * pct / 100).toFixed(2);
      const total = +(base + markup).toFixed(2);
      return `Markup calculation (${pct}%):\n• Cost: $${base.toLocaleString('en-AU', { minimumFractionDigits: 2 })}\n• Markup (${pct}%): $${markup.toLocaleString('en-AU', { minimumFractionDigits: 2 })}\n• Sell price: $${total.toLocaleString('en-AU', { minimumFractionDigits: 2 })}`;
    }
  }

  const marginMatch = matchSafe(/(?:what\s+is\s+)?(\d+(?:\.\d+)?)%\s+margin\s+on\s+\$?([\d,]+(?:\.\d+)?)/i, q);
  if (marginMatch) {
    const pct = parseFloat(marginMatch[1]);
    const cost = parseFloat(marginMatch[2].replace(/,/g, ''));
    if (!isNaN(pct) && !isNaN(cost) && pct < 100) {
      const sell = +(cost / (1 - pct / 100)).toFixed(2);
      const margin = +(sell - cost).toFixed(2);
      return `Margin calculation (${pct}%):\n• Cost: $${cost.toLocaleString('en-AU', { minimumFractionDigits: 2 })}\n• Margin (${pct}%): $${margin.toLocaleString('en-AU', { minimumFractionDigits: 2 })}\n• Sell price: $${sell.toLocaleString('en-AU', { minimumFractionDigits: 2 })}`;
    }
  }

  // ── Concrete volume ───────────────────────────────────────────────────────
  // Rewritten without .*? to eliminate catastrophic backtracking risk.
  // Matches: "concrete 6x4x0.1" / "concrete 6m x 4m x 100mm" etc.
  const concreteMatch = matchSafe(
    /concrete\s+(\d+(?:\.\d+)?)\s*(?:m|metres?|meters?)?\s*[x\u00d7*]|by\s+(\d+(?:\.\d+)?)\s*(?:m|metres?|meters?)?\s*[x\u00d7*]|by\s+(\d+(?:\.\d+)?)\s*(m|mm|metres?|meters?|millimetres?)?/i,
    q
  ) ?? matchSafe(
    /(\d+(?:\.\d+)?)\s*(?:m|metres?|meters?)?\s*[x\u00d7]\s*(\d+(?:\.\d+)?)\s*(?:m|metres?|meters?)?\s*[x\u00d7]\s*(\d+(?:\.\d+)?)\s*(m|mm|metres?|meters?|millimetres?)?/i,
    q.includes('concrete') ? q : ''
  );
  if (concreteMatch) {
    const l = parseFloat(concreteMatch[1] ?? '');
    const w = parseFloat(concreteMatch[2] ?? '');
    let d = parseFloat(concreteMatch[3] ?? '');
    const unit = (concreteMatch[4] ?? 'm').toLowerCase();
    if (unit.startsWith('mm')) d = d / 1000;
    if (!isNaN(l) && !isNaN(w) && !isNaN(d) && d > 0) {
      const vol = +(l * w * d).toFixed(3);
      const withWaste = +(vol * 1.1).toFixed(3);
      return `Concrete volume:\n• Slab: ${l}m × ${w}m × ${d < 1 ? (d * 1000).toFixed(0) + 'mm' : d + 'm'}\n• Volume: **${vol} m³**\n• With 10% waste: **${withWaste} m³**\n\n_Order at least ${withWaste} m³. Verify with your concrete supplier._`;
    }
  }

  // ── Area calculator ───────────────────────────────────────────────────────
  const areaMatch = matchSafe(/(?:area\s+of|what\s+is\s+the\s+area)\s+(\d+(?:\.\d+)?)\s*(?:m|metres?|meters?)?\s*(?:x|\u00d7|\*|by)\s*(\d+(?:\.\d+)?)/i, q);
  if (areaMatch) {
    const l = parseFloat(areaMatch[1]);
    const w = parseFloat(areaMatch[2]);
    if (!isNaN(l) && !isNaN(w)) {
      const area = +(l * w).toFixed(2);
      return `Area calculation:\n• ${l}m × ${w}m = **${area} m²**`;
    }
  }

  // ── Pipe / drain fall ─────────────────────────────────────────────────────
  // Bounded pattern — no unbounded wildcards.
  const fallMatch = matchSafe(/fall\s+(?:for\s+)?(\d+(?:\.\d+)?)\s*m\s+(?:pipe\s+)?(?:at\s+)?1\s*(?::|in)\s*(\d+(?:\.\d+)?)/i, q)
    ?? matchSafe(/fall\s+(?:for\s+)?(\d+(?:\.\d+)?)\s*m\s*,?\s*1\s*(?::|in)\s*(\d+(?:\.\d+)?)/i, q);
  if (fallMatch) {
    const length = parseFloat(fallMatch[1]);
    const ratio = parseFloat(fallMatch[2]);
    if (!isNaN(length) && !isNaN(ratio) && ratio > 0) {
      const fall = +(length / ratio * 1000).toFixed(0);
      const fallM = +(length / ratio).toFixed(3);
      return `Pipe fall calculation:\n• Length: ${length}m at 1:${ratio}\n• Fall: **${fall}mm** (${fallM}m)\n• Invert drop: ${fall}mm over ${length}m`;
    }
  }

  // ── Percentage of ─────────────────────────────────────────────────────────
  const pctOfMatch = matchSafe(/(?:what\s+is\s+)?(\d+(?:\.\d+)?)%\s+of\s+\$?([\d,]+(?:\.\d+)?)/i, q);
  if (pctOfMatch) {
    const pct = parseFloat(pctOfMatch[1]);
    const base = parseFloat(pctOfMatch[2].replace(/,/g, ''));
    if (!isNaN(pct) && !isNaN(base)) {
      const result = +(base * pct / 100).toFixed(2);
      return `${pct}% of $${base.toLocaleString('en-AU', { minimumFractionDigits: 2 })} = **$${result.toLocaleString('en-AU', { minimumFractionDigits: 2 })}**`;
    }
  }

  // ── Lineal metres / perimeter ─────────────────────────────────────────────
  const perimMatch = matchSafe(/perimeter\s+(?:of\s+)?(\d+(?:\.\d+)?)\s*(?:m|metres?|meters?)?\s*(?:x|\u00d7|\*|by)\s*(\d+(?:\.\d+)?)/i, q);
  if (perimMatch) {
    const l = parseFloat(perimMatch[1]);
    const w = parseFloat(perimMatch[2]);
    if (!isNaN(l) && !isNaN(w)) {
      const perim = +(2 * (l + w)).toFixed(2);
      return `Perimeter:\n• ${l}m × ${w}m rectangle = **${perim} lineal metres**`;
    }
  }

  return null;
}

// ── Context-aware local handler ───────────────────────────────────────────────
// Handles portal data questions that don't need OpenAI.
// Returns a string answer or null (fall through to OpenAI).

function tryContextHandler(q: string, ctx: DazzaContext): string | null {
  const lq = q.toLowerCase().trim();
  const p  = ctx.permissions;
  const cn = ctx.companyName;

  // ── Cross-company guard ───────────────────────────────────────────────────
  if (
    /another company|other company|different company|competitor|someone elses?\s+(?:quote|job|data|estimate)/i.test(lq)
  ) {
    return `I can't access another company's private IWILLBUILD data. I only have access to ${cn}'s data.`;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // JOBS
  // ══════════════════════════════════════════════════════════════════════════

  // ── Job count ─────────────────────────────────────────────────────────────
  if (/how many jobs|job count|number of jobs|total jobs/i.test(lq)) {
    if (!p.canJobs) return "You don't have Jobs access.";
    const count = ctx.jobs?.length ?? 0;
    if (count === 0) return `📋 From IWILLBUILD data:\nNo jobs found for ${cn} yet.\n\n📦 Source modules:\nJobs\n\n📊 Confidence:\nHigh`;
    return `📋 From IWILLBUILD data:\nThere ${count === 1 ? 'is' : 'are'} **${count}** job${count === 1 ? '' : 's'} in IWILLBUILD for ${cn}.\n\n📦 Source modules:\nJobs\n\n📊 Confidence:\nHigh`;
  }

  // ── Active / open jobs ────────────────────────────────────────────────────
  if (/active jobs|open jobs|current jobs|list.*jobs|jobs.*list|show.*jobs/i.test(lq)) {
    if (!p.canJobs) return "You don't have Jobs access.";
    const jobs = (ctx.jobs ?? []) as Array<Record<string, unknown>>;
    const active = jobs.filter((j) => !['completed','cancelled'].includes(String(j.status ?? '').toLowerCase()));
    if (active.length === 0) return `📋 From IWILLBUILD data:\nNo active jobs found for ${cn}.\n\n📦 Source modules:\nJobs\n\n📊 Confidence:\nHigh`;
    const list = active.slice(0, 12).map((j) =>
      `• **${String(j.name ?? 'Unnamed')}** — ${String(j.status ?? 'Unknown')}${j.client ? ` | Client: ${String(j.client)}` : ''}${j.address ? ` | ${String(j.address)}` : ''}`
    ).join('\n');
    return `📋 From IWILLBUILD data:\n**${active.length}** active job${active.length === 1 ? '' : 's'} for ${cn}:\n${list}${active.length > 12 ? `\n…and ${active.length - 12} more.` : ''}\n\n📦 Source modules:\nJobs\n\n📊 Confidence:\nHigh`;
  }

  // ── Latest / newest job ───────────────────────────────────────────────────
  if (/latest job|newest job|most recent job|last job added|last job created/i.test(lq)) {
    if (!p.canJobs) return "You don't have Jobs access.";
    const jobs = (ctx.jobs ?? []) as Array<Record<string, unknown>>;
    if (jobs.length === 0) return `📋 From IWILLBUILD data:\nNo jobs found for ${cn} yet.\n\n📦 Source modules:\nJobs\n\n📊 Confidence:\nHigh`;
    const latest = jobs[0];
    return `📋 From IWILLBUILD data:\nThe latest job is **${String(latest.name ?? 'Unnamed')}**` +
      `${latest.client ? ` for ${String(latest.client)}` : ''}` +
      `${latest.status ? ` — Status: ${String(latest.status)}` : ''}` +
      `${latest.address ? ` | Address: ${String(latest.address)}` : ''}` +
      `${latest.created_at ? ` (created ${String(latest.created_at).slice(0, 10)})` : ''}.` +
      `\n\n📦 Source modules:\nJobs\n\n📊 Confidence:\nHigh`;
  }

  // ── Completed jobs ────────────────────────────────────────────────────────
  if (/completed jobs|finished jobs|done jobs|jobs.*completed/i.test(lq)) {
    if (!p.canJobs) return "You don't have Jobs access.";
    const jobs = (ctx.jobs ?? []) as Array<Record<string, unknown>>;
    const completed = jobs.filter((j) => String(j.status ?? '').toLowerCase() === 'completed');
    if (completed.length === 0) return `📋 From IWILLBUILD data:\nNo completed jobs found for ${cn}.\n\n📦 Source modules:\nJobs\n\n📊 Confidence:\nHigh`;
    const list = completed.slice(0, 10).map((j) => `• **${String(j.name ?? 'Unnamed')}**${j.client ? ` — ${String(j.client)}` : ''}`).join('\n');
    return `📋 From IWILLBUILD data:\n**${completed.length}** completed job${completed.length === 1 ? '' : 's'} for ${cn}:\n${list}${completed.length > 10 ? `\n…and ${completed.length - 10} more.` : ''}\n\n📦 Source modules:\nJobs\n\n📊 Confidence:\nHigh`;
  }

  // ── Jobs by supervisor ────────────────────────────────────────────────────
  if (/jobs.*supervisor|supervisor.*jobs|who.*supervising|supervisor.*assigned/i.test(lq)) {
    if (!p.canJobs) return "You don't have Jobs access.";
    const jobs = (ctx.jobs ?? []) as Array<Record<string, unknown>>;
    const withSup = jobs.filter((j) => j.supervisor_name || j.assigned_supervisor_user_id);
    if (withSup.length === 0) return `📋 From IWILLBUILD data:\nNo jobs with assigned supervisors found for ${cn}.\n\n📦 Source modules:\nJobs\n\n📊 Confidence:\nHigh`;
    const grouped: Record<string, string[]> = {};
    for (const j of withSup) {
      const sup = String(j.supervisor_name ?? j.assigned_supervisor_user_id ?? 'Unknown');
      if (!grouped[sup]) grouped[sup] = [];
      grouped[sup].push(String(j.name ?? 'Unnamed'));
    }
    const list = Object.entries(grouped).map(([sup, jbs]) => `• **${sup}**: ${jbs.join(', ')}`).join('\n');
    return `📋 From IWILLBUILD data:\nJobs by supervisor for ${cn}:\n${list}\n\n📦 Source modules:\nJobs\n\n📊 Confidence:\nHigh`;
  }

  // ── Jobs needing attention / overdue to-dos ───────────────────────────────
  if (/jobs.*attention|attention.*jobs|jobs.*issue|problem.*jobs|overdue.*job|job.*overdue/i.test(lq)) {
    if (!p.canJobs) return "You don't have Jobs access.";
    const overdue = (ctx.openTodos ?? []) as Array<Record<string, unknown>>;
    const today = new Date().toISOString().slice(0, 10);
    const overdueItems = overdue.filter((t) => t.due_date && String(t.due_date).slice(0, 10) < today);
    if (overdueItems.length === 0) return `📋 From IWILLBUILD data:\nNo jobs with overdue to-dos found for ${cn}.\n\n📦 Source modules:\nJobs, To-do\n\n📊 Confidence:\nHigh`;
    const list = overdueItems.slice(0, 8).map((t) => `• **${String(t.job_name ?? 'Unknown job')}** — "${String(t.title ?? '')}" overdue since ${String(t.due_date ?? '').slice(0, 10)}`).join('\n');
    return `📋 From IWILLBUILD data:\n**${overdueItems.length}** overdue to-do${overdueItems.length === 1 ? '' : 's'} across jobs:\n${list}\n\n📦 Source modules:\nJobs, To-do\n\n📊 Confidence:\nHigh`;
  }

  // ── Job delays ────────────────────────────────────────────────────────────
  if (/job.*delay|delay.*job|which jobs.*delayed|most delayed/i.test(lq)) {
    if (!p.canJobs) return "You don't have Jobs access.";
    const delays = (ctx.jobDelays ?? []) as Array<Record<string, unknown>>;
    if (delays.length === 0) return `📋 From IWILLBUILD data:\nNo job delays recorded for ${cn}.\n\n📦 Source modules:\nJobs\n\n📊 Confidence:\nHigh`;
    const sorted = [...delays].sort((a, b) => (Number(b.total_delay_days ?? 0)) - (Number(a.total_delay_days ?? 0)));
    const list = sorted.slice(0, 8).map((d) => `• **${String(d.job_name ?? 'Unknown')}** — ${String(d.total_delay_days ?? 0)} day${Number(d.total_delay_days ?? 0) === 1 ? '' : 's'} delay (${String(d.delay_count ?? 0)} event${Number(d.delay_count ?? 0) === 1 ? '' : 's'})`).join('\n');
    const totalDays = delays.reduce((s, d) => s + Number(d.total_delay_days ?? 0), 0);
    return `📋 From IWILLBUILD data:\n**${delays.length}** job${delays.length === 1 ? '' : 's'} with delays (${totalDays} total delay days):\n${list}\n\n📦 Source modules:\nJobs\n\n📊 Confidence:\nHigh`;
  }

  // ── Job progress ──────────────────────────────────────────────────────────
  if (/jobs.*progress|progress.*jobs|which jobs.*progress|progress recorded|job.*percent|percent.*complete/i.test(lq)) {
    if (!p.canJobs) return "You don't have Jobs access.";
    const progress = (ctx.jobProgress ?? []) as Array<Record<string, unknown>>;
    if (progress.length === 0) return `📋 From IWILLBUILD data:\nNo job progress recorded for ${cn} yet.\n\n📦 Source modules:\nProgress\n\n📊 Confidence:\nHigh`;
    const sorted = [...progress].sort((a, b) => Number(b.avg_percent ?? 0) - Number(a.avg_percent ?? 0));
    const list = sorted.slice(0, 10).map((p) => `• **${String(p.job_name ?? 'Unknown')}** — ${String(p.avg_percent ?? 0)}% complete`).join('\n');
    return `📋 From IWILLBUILD data:\n**${progress.length}** job${progress.length === 1 ? '' : 's'} with progress recorded:\n${list}\n\n📦 Source modules:\nProgress\n\n📊 Confidence:\nHigh`;
  }

  // ── Open to-dos ───────────────────────────────────────────────────────────
  if (/open to.?do|outstanding to.?do|my to.?do|to.?do list|pending task/i.test(lq)) {
    if (!p.canJobs) return "You don't have Jobs access.";
    const todos = (ctx.openTodos ?? []) as Array<Record<string, unknown>>;
    if (todos.length === 0) return `📋 From IWILLBUILD data:\nNo open to-dos found for ${cn}.\n\n📦 Source modules:\nTo-do\n\n📊 Confidence:\nHigh`;
    const list = todos.slice(0, 10).map((t) => `• **${String(t.job_name ?? 'Unknown job')}** — "${String(t.title ?? '')}"${t.due_date ? ` (due ${String(t.due_date).slice(0, 10)})` : ''}`).join('\n');
    return `📋 From IWILLBUILD data:\n**${todos.length}** open to-do${todos.length === 1 ? '' : 's'}:\n${list}${todos.length > 10 ? `\n…and ${todos.length - 10} more.` : ''}\n\n📦 Source modules:\nTo-do\n\n📊 Confidence:\nHigh`;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FLEET
  // ══════════════════════════════════════════════════════════════════════════

  // ── Fleet count ───────────────────────────────────────────────────────────
  if (/how many fleet|fleet count|number of fleet|total fleet|how many.*asset|fleet.*asset.*count/i.test(lq)) {
    if (!p.canFleet) return "You don't have Fleet access.";
    const count = ctx.fleet?.length ?? 0;
    if (count === 0) return `📋 From IWILLBUILD data:\nNo fleet assets found for ${cn} yet.\n\n📦 Source modules:\nFleet\n\n📊 Confidence:\nHigh`;
    return `📋 From IWILLBUILD data:\nThere ${count === 1 ? 'is' : 'are'} **${count}** fleet asset${count === 1 ? '' : 's'} in IWILLBUILD for ${cn}.\n\n📦 Source modules:\nFleet\n\n📊 Confidence:\nHigh`;
  }

  // ── List all fleet ────────────────────────────────────────────────────────
  if (/list.*fleet|show.*fleet|all.*fleet|fleet.*list/i.test(lq)) {
    if (!p.canFleet) return "You don't have Fleet access.";
    const fleet = (ctx.fleet ?? []) as Array<Record<string, unknown>>;
    if (fleet.length === 0) return `📋 From IWILLBUILD data:\nNo fleet assets found for ${cn} yet.\n\n📦 Source modules:\nFleet\n\n📊 Confidence:\nHigh`;
    const list = fleet.slice(0, 15).map((f) => `• **${String(f.name ?? 'Unnamed')}** — ${String(f.asset_type ?? f.type ?? 'Asset')}${f.rego ? ` | Rego: ${String(f.rego)}` : ''}`).join('\n');
    return `📋 From IWILLBUILD data:\n**${fleet.length}** fleet asset${fleet.length === 1 ? '' : 's'} for ${cn}:\n${list}${fleet.length > 15 ? `\n…and ${fleet.length - 15} more.` : ''}\n\n📦 Source modules:\nFleet\n\n📊 Confidence:\nHigh`;
  }

  // ── Last / latest prestart ────────────────────────────────────────────────
  if (/last prestart|latest prestart|most recent prestart|last.*daily check|recent.*prestart/i.test(lq)) {
    if (!p.canFleet) return "You don't have Fleet access.";
    const prestarts = (ctx.prestarts ?? []) as Array<Record<string, unknown>>;
    if (prestarts.length === 0) return `📋 From IWILLBUILD data:\nNo prestarts found for ${cn} yet.\n\n📦 Source modules:\nFleet\n\n📊 Confidence:\nHigh`;
    const last = prestarts[0];
    const flagged = last.issue_needs_attention ? ` ⚠️ Issue flagged: "${String(last.issue_comment ?? '')}"` : ' No issues flagged.';
    return `📋 From IWILLBUILD data:\nThe last prestart was for **${String(last.asset_name ?? 'Unknown asset')}**` +
      `${last.submitted_by_name ? ` submitted by ${String(last.submitted_by_name)}` : ''}` +
      `${last.created_at ? ` on ${String(last.created_at).slice(0, 10)}` : ''}.${flagged}` +
      `\n\n📦 Source modules:\nFleet\n\n📊 Confidence:\nHigh`;
  }

  // ── Next service due ──────────────────────────────────────────────────────
  if (/next service|service due|when.*service|service.*when|upcoming service/i.test(lq)) {
    if (!p.canFleet) return "You don't have Fleet access.";
    const fleet = (ctx.fleet ?? []) as Array<Record<string, unknown>>;
    const withDates = fleet
      .filter((f) => f.service_date)
      .sort((a, b) => String(a.service_date).localeCompare(String(b.service_date)));
    if (withDates.length === 0) return `📋 From IWILLBUILD data:\nNo service dates recorded for any fleet assets.\n\n📦 Source modules:\nFleet\n\n📊 Confidence:\nHigh`;
    const next = withDates[0];
    const today = new Date().toISOString().slice(0, 10);
    const isOverdue = String(next.service_date).slice(0, 10) < today;
    return `📋 From IWILLBUILD data:\nThe next service due is **${String(next.name ?? 'Unknown')}** — service date **${String(next.service_date).slice(0, 10)}**${isOverdue ? ' ⚠️ (overdue)' : ''}.\n\n📦 Source modules:\nFleet\n\n📊 Confidence:\nHigh`;
  }

  // ── Rego expiry ───────────────────────────────────────────────────────────
  if (/rego.*expir|expir.*rego|registration.*due|rego.*due|upcoming.*rego/i.test(lq)) {
    if (!p.canFleet) return "You don't have Fleet access.";
    const fleet = (ctx.fleet ?? []) as Array<Record<string, unknown>>;
    const today = new Date().toISOString().slice(0, 10);
    const withRego = fleet
      .filter((f) => f.rego_expiry && !f.rego_not_applicable)
      .sort((a, b) => String(a.rego_expiry).localeCompare(String(b.rego_expiry)));
    const overdue = withRego.filter((f) => String(f.rego_expiry).slice(0, 10) < today);
    const upcoming = withRego.filter((f) => String(f.rego_expiry).slice(0, 10) >= today).slice(0, 5);
    const lines: string[] = [];
    if (overdue.length > 0) {
      lines.push(`⚠️ **${overdue.length}** asset${overdue.length === 1 ? '' : 's'} with expired rego:`);
      overdue.slice(0, 5).forEach((f) => lines.push(`  • **${String(f.name ?? 'Unknown')}** — expired ${String(f.rego_expiry).slice(0, 10)}`));
    }
    if (upcoming.length > 0) {
      lines.push(`\nUpcoming rego renewals:`);
      upcoming.forEach((f) => lines.push(`  • **${String(f.name ?? 'Unknown')}** — due ${String(f.rego_expiry).slice(0, 10)}`));
    }
    if (lines.length === 0) return `📋 From IWILLBUILD data:\nNo rego expiry dates recorded for fleet assets.\n\n📦 Source modules:\nFleet\n\n📊 Confidence:\nHigh`;
    return `📋 From IWILLBUILD data:\n${lines.join('\n')}\n\n📦 Source modules:\nFleet\n\n📊 Confidence:\nHigh`;
  }

  // ── Fleet issues / flags ──────────────────────────────────────────────────
  if (/fleet issue|fleet flag|fleet problem|fleet.*attention|attention.*fleet/i.test(lq)) {
    if (!p.canFleet) return "You don't have Fleet access.";
    const flags = (ctx.fleetFlags ?? []) as Array<Record<string, unknown>>;
    if (flags.length === 0) return `📋 From IWILLBUILD data:\nNo fleet issues flagged for ${cn}.\n\n📦 Source modules:\nFleet\n\n📊 Confidence:\nHigh`;
    const list = flags.slice(0, 8).map((f) => `• **${String(f.asset_name ?? 'Unknown')}** — "${String(f.issue_comment ?? '')}" (${String(f.created_at ?? '').slice(0, 10)})`).join('\n');
    return `📋 From IWILLBUILD data:\n**${flags.length}** fleet issue${flags.length === 1 ? '' : 's'} flagged:\n${list}\n\n📦 Source modules:\nFleet\n\n📊 Confidence:\nHigh`;
  }

  // ── Who is driving / currently driving ────────────────────────────────────
  if (/who.*driving|driving.*who|who.*got.*vehicle|who.*has.*vehicle|who.*checked.*out|currently.*driving|active.*session|who.*in.*the\s+\w+/i.test(lq)) {
    if (!p.canFleet) return "You don't have Fleet access.";
    const active = (ctx.activeDriverSessions ?? []) as Array<Record<string, unknown>>;
    if (active.length === 0) return `📋 From IWILLBUILD data:\nNo vehicles are currently being driven.\n\n📦 Source modules:\nFleet · Driver Sessions\n\n📊 Confidence:\nHigh`;
    const list = active.map((s) => `• **${String(s.asset_name ?? 'Unknown')}** — driven by **${String(s.driver_name ?? 'Unknown')}** since ${String(s.start_at ?? '').slice(11, 16)}`).join('\n');
    return `📋 From IWILLBUILD data:\n**${active.length}** vehicle${active.length === 1 ? '' : 's'} currently being driven:\n${list}\n\n📦 Source modules:\nFleet · Driver Sessions\n\n📊 Confidence:\nHigh`;
  }

  // ── Which vehicles are active / being driven ──────────────────────────────
  if (/which.*vehicle.*driven|which.*vehicle.*active|vehicles.*being.*driven|active.*vehicle.*session/i.test(lq)) {
    if (!p.canFleet) return "You don't have Fleet access.";
    const active = (ctx.activeDriverSessions ?? []) as Array<Record<string, unknown>>;
    if (active.length === 0) return `📋 From IWILLBUILD data:\nNo vehicles are currently being driven.\n\n📦 Source modules:\nFleet · Driver Sessions\n\n📊 Confidence:\nHigh`;
    const list = active.map((s) => `• **${String(s.asset_name ?? 'Unknown')}** — ${String(s.driver_name ?? 'Unknown')}`).join('\n');
    return `📋 From IWILLBUILD data:\n${list}\n\n📦 Source modules:\nFleet · Driver Sessions\n\n📊 Confidence:\nHigh`;
  }

  // ── Who had / drove a vehicle (historical) ────────────────────────────────
  if (/who.*had|who.*drove|who.*was.*driving|who.*last.*drove|last.*driver|had.*yesterday|drove.*yesterday|drove.*last/i.test(lq)) {
    if (!p.canFleet) return "You don't have Fleet access.";
    const sessions = (ctx.recentDriverSessions ?? []) as Array<Record<string, unknown>>;
    if (sessions.length === 0) return `📋 From IWILLBUILD data:\nNo driver session history found.\n\n📦 Source modules:\nFleet · Driver Sessions\n\n📊 Confidence:\nHigh`;
    // Try to match a vehicle name from the question
    const fleet = (ctx.fleet ?? []) as Array<Record<string, unknown>>;
    const mentionedVehicle = fleet.find((f) => lq.includes(String(f.name ?? '').toLowerCase()));
    const relevant = mentionedVehicle
      ? sessions.filter((s) => String(s.asset_name ?? '').toLowerCase() === String(mentionedVehicle.name ?? '').toLowerCase())
      : sessions;
    if (relevant.length === 0) return `📋 From IWILLBUILD data:\nNo driver sessions found${mentionedVehicle ? ` for ${String(mentionedVehicle.name)}` : ''}.\n\n📦 Source modules:\nFleet · Driver Sessions\n\n📊 Confidence:\nHigh`;
    const list = relevant.slice(0, 8).map((s) => {
      const start = String(s.start_at ?? '').slice(0, 16).replace('T', ' ');
      const end = s.end_at ? String(s.end_at).slice(0, 16).replace('T', ' ') : 'still active';
      return `• **${String(s.driver_name ?? 'Unknown')}** drove **${String(s.asset_name ?? 'Unknown')}** — ${start} → ${end}`;
    }).join('\n');
    return `📋 From IWILLBUILD data:\n${list}\n\n📦 Source modules:\nFleet · Driver Sessions\n\n📊 Confidence:\nHigh`;
  }

  // ── When did [person] stop driving ────────────────────────────────────────
  if (/when.*stop.*driving|stop.*driving.*when|when.*finish.*driving|finish.*driving.*when/i.test(lq)) {
    if (!p.canFleet) return "You don't have Fleet access.";
    const sessions = (ctx.recentDriverSessions ?? []) as Array<Record<string, unknown>>;
    const completed = sessions.filter((s) => s.status === 'completed' && s.end_at);
    if (completed.length === 0) return `📋 From IWILLBUILD data:\nNo completed driving sessions found.\n\n📦 Source modules:\nFleet · Driver Sessions\n\n📊 Confidence:\nHigh`;
    const last = completed[0];
    const endTime = String(last.end_at ?? '').slice(0, 16).replace('T', ' ');
    return `📋 From IWILLBUILD data:\n**${String(last.driver_name ?? 'Unknown')}** stopped driving **${String(last.asset_name ?? 'Unknown')}** at **${endTime}**.\n\n📦 Source modules:\nFleet · Driver Sessions\n\n📊 Confidence:\nHigh`;
  }

  // ── Prestart count ────────────────────────────────────────────────────────
  if (/how many prestart|prestart count|number of prestart/i.test(lq)) {
    if (!p.canFleet) return "You don't have Fleet access.";
    const count = ctx.prestartCount ?? 0;
    return `📋 From IWILLBUILD data:\n**${count}** prestart${count === 1 ? '' : 's'} recorded for ${cn}.\n\n📦 Source modules:\nFleet\n\n📊 Confidence:\nHigh`;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ESTIMATES
  // ══════════════════════════════════════════════════════════════════════════

  // ── Estimate totals ───────────────────────────────────────────────────────
  if (/estimate total|quote total|how much.*quoted|total.*estimate|approved.*work|estimate.*dollar|dollar.*estimate|estimate.*total.*see|what.*total.*estimate|estimate.*value/i.test(lq)) {
    if (!p.canEstimating) return "You don't have Estimating access.";
    if (!p.seeDollars) return "I can't show cost values with your current permissions.";
    const estimates = (ctx.estimates ?? []) as Array<Record<string, unknown>>;
    if (estimates.length === 0) return `📋 From IWILLBUILD data:\nNo estimates found for ${cn} yet.\n\n📦 Source modules:\nEstimates\n\n📊 Confidence:\nHigh`;
    const approved = estimates.filter((e) => String(e.status ?? '').toLowerCase() === 'approved');
    const totalApproved = approved.reduce((sum, e) => sum + (parseFloat(String(e.subtotal ?? '0')) || 0), 0);
    const totalAll = estimates.reduce((sum, e) => sum + (parseFloat(String(e.subtotal ?? '0')) || 0), 0);
    return `📋 From IWILLBUILD data:\n**${estimates.length}** estimate${estimates.length === 1 ? '' : 's'} total.\n` +
      `• All estimates subtotal: **$${totalAll.toLocaleString('en-AU', { minimumFractionDigits: 2 })}** (ex. markup/GST)\n` +
      `• Approved estimates: **${approved.length}** totalling **$${totalApproved.toLocaleString('en-AU', { minimumFractionDigits: 2 })}** (ex. markup/GST)\n\n📦 Source modules:\nEstimates\n\n📊 Confidence:\nHigh`;
  }

  // ── Estimate count ────────────────────────────────────────────────────────
  if (/how many estimate|estimate count|number of estimate|how many quote/i.test(lq)) {
    if (!p.canEstimating) return "You don't have Estimating access.";
    const count = ctx.estimates?.length ?? 0;
    if (count === 0) return `📋 From IWILLBUILD data:\nNo estimates found for ${cn} yet.\n\n📦 Source modules:\nEstimates\n\n📊 Confidence:\nHigh`;
    const estimates = (ctx.estimates ?? []) as Array<Record<string, unknown>>;
    const approved = estimates.filter((e) => String(e.status ?? '').toLowerCase() === 'approved').length;
    const draft = estimates.filter((e) => String(e.status ?? '').toLowerCase() === 'draft').length;
    const sent = estimates.filter((e) => String(e.status ?? '').toLowerCase() === 'sent').length;
    return `📋 From IWILLBUILD data:\n**${count}** estimate${count === 1 ? '' : 's'} for ${cn}:\n• Draft: ${draft} | Sent: ${sent} | Approved: ${approved}\n\n📦 Source modules:\nEstimates\n\n📊 Confidence:\nHigh`;
  }

  // ── List / show estimates ─────────────────────────────────────────────────
  if (/what estimates|list.*estimate|show.*estimate|estimates.*exist|which estimates|all.*estimate|estimate.*list/i.test(lq)) {
    if (!p.canEstimating) return "You don't have Estimating access.";
    const estimates = (ctx.estimates ?? []) as Array<Record<string, unknown>>;
    if (estimates.length === 0) return `📋 From IWILLBUILD data:\nNo estimates found for ${cn} yet.\n\n📦 Source modules:\nEstimates\n\n📊 Confidence:\nHigh`;
    const list = estimates.slice(0, 15).map((e) => {
      const status = String(e.status ?? 'Draft');
      const jobName = e.job_name ? ` | Job: ${String(e.job_name)}` : '';
      const total = p.seeDollars && e.subtotal ? ` | $${parseFloat(String(e.subtotal)).toLocaleString('en-AU', { minimumFractionDigits: 2 })}` : '';
      return `• **${String(e.title ?? 'Unnamed')}** — ${status}${jobName}${total}`;
    }).join('\n');
    return `📋 From IWILLBUILD data:\n**${estimates.length}** estimate${estimates.length === 1 ? '' : 's'} for ${cn}:\n${list}${estimates.length > 15 ? `\n…and ${estimates.length - 15} more.` : ''}\n\n📦 Source modules:\nEstimates\n\n📊 Confidence:\nHigh`;
  }

  // ── Approved estimates ────────────────────────────────────────────────────
  if (/approved estimate|approved quote|estimates.*approved/i.test(lq)) {
    if (!p.canEstimating) return "You don't have Estimating access.";
    const estimates = (ctx.estimates ?? []) as Array<Record<string, unknown>>;
    const approved = estimates.filter((e) => String(e.status ?? '').toLowerCase() === 'approved');
    if (approved.length === 0) return `📋 From IWILLBUILD data:\nNo approved estimates found for ${cn}.\n\n📦 Source modules:\nEstimates\n\n📊 Confidence:\nHigh`;
    const list = approved.slice(0, 12).map((e) => {
      const jobName = e.job_name ? ` | Job: ${String(e.job_name)}` : '';
      const total = p.seeDollars && e.subtotal ? ` | $${parseFloat(String(e.subtotal)).toLocaleString('en-AU', { minimumFractionDigits: 2 })}` : '';
      return `• **${String(e.title ?? 'Unnamed')}**${jobName}${total}`;
    }).join('\n');
    return `📋 From IWILLBUILD data:\n**${approved.length}** approved estimate${approved.length === 1 ? '' : 's'} for ${cn}:\n${list}${approved.length > 12 ? `\n…and ${approved.length - 12} more.` : ''}\n\n📦 Source modules:\nEstimates\n\n📊 Confidence:\nHigh`;
  }

  // ── Draft estimates ───────────────────────────────────────────────────────
  if (/draft estimate|draft quote|estimates.*draft/i.test(lq)) {
    if (!p.canEstimating) return "You don't have Estimating access.";
    const estimates = (ctx.estimates ?? []) as Array<Record<string, unknown>>;
    const drafts = estimates.filter((e) => String(e.status ?? '').toLowerCase() === 'draft');
    if (drafts.length === 0) return `📋 From IWILLBUILD data:\nNo draft estimates found for ${cn}.\n\n📦 Source modules:\nEstimates\n\n📊 Confidence:\nHigh`;
    const list = drafts.slice(0, 12).map((e) => {
      const jobName = e.job_name ? ` | Job: ${String(e.job_name)}` : '';
      return `• **${String(e.title ?? 'Unnamed')}**${jobName}`;
    }).join('\n');
    return `📋 From IWILLBUILD data:\n**${drafts.length}** draft estimate${drafts.length === 1 ? '' : 's'} for ${cn}:\n${list}${drafts.length > 12 ? `\n…and ${drafts.length - 12} more.` : ''}\n\n📦 Source modules:\nEstimates\n\n📊 Confidence:\nHigh`;
  }

  // ── Job costs / over budget ───────────────────────────────────────────────
  if (/job.*cost|cost.*job|over.*budget|budget.*over|which jobs.*expensive|most expensive job/i.test(lq)) {
    if (!p.canJobs) return "You don't have Jobs access.";
    if (!p.seeDollars) return "I can't show cost values with your current permissions.";
    const costs = (ctx.jobCosts ?? []) as Array<Record<string, unknown>>;
    if (costs.length === 0) return `📋 From IWILLBUILD data:\nNo job costs recorded for ${cn} yet.\n\n📦 Source modules:\nJobs\n\n📊 Confidence:\nHigh`;
    const sorted = [...costs].sort((a, b) => Number(b.total_actual ?? 0) - Number(a.total_actual ?? 0));
    const list = sorted.slice(0, 8).map((c) => {
      const actual = Number(c.total_actual ?? 0);
      const approved = Number(c.approved_estimate ?? 0);
      const overBudget = approved > 0 && actual > approved;
      return `• **${String(c.job_name ?? 'Unknown')}** — $${actual.toLocaleString('en-AU', { minimumFractionDigits: 2 })} actual${approved > 0 ? ` vs $${approved.toLocaleString('en-AU', { minimumFractionDigits: 2 })} approved${overBudget ? ' ⚠️ over budget' : ''}` : ''}`;
    }).join('\n');
    const totalActual = costs.reduce((s, c) => s + Number(c.total_actual ?? 0), 0);
    return `📋 From IWILLBUILD data:\nJob costs for ${cn} (total: **$${totalActual.toLocaleString('en-AU', { minimumFractionDigits: 2 })}**):\n${list}\n\n📦 Source modules:\nJobs\n\n📊 Confidence:\nHigh`;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FORMS
  // ══════════════════════════════════════════════════════════════════════════

  // ── Form / template count ─────────────────────────────────────────────────
  if (/how many forms|form count|number of forms|form template|available forms/i.test(lq)) {
    if (!p.canForms) return "You don't have Forms access.";
    const count = ctx.formTemplates?.length ?? 0;
    if (count === 0) return `📋 From IWILLBUILD data:\nNo form templates found for ${cn} yet.\n\n📦 Source modules:\nForms\n\n📊 Confidence:\nHigh`;
    return `📋 From IWILLBUILD data:\nThere ${count === 1 ? 'is' : 'are'} **${count}** form template${count === 1 ? '' : 's'} available for ${cn}.\n\n📦 Source modules:\nForms\n\n📊 Confidence:\nHigh`;
  }

  // ── List form templates ───────────────────────────────────────────────────
  if (/list.*forms|show.*forms|what forms|forms.*available|which forms/i.test(lq)) {
    if (!p.canForms) return "You don't have Forms access.";
    const templates = (ctx.formTemplates ?? []) as Array<Record<string, unknown>>;
    if (templates.length === 0) return `📋 From IWILLBUILD data:\nNo form templates found for ${cn} yet.\n\n📦 Source modules:\nForms\n\n📊 Confidence:\nHigh`;
    const list = templates.slice(0, 15).map((t) => `• **${String(t.name ?? 'Unnamed')}**${t.category ? ` (${String(t.category)})` : ''}`).join('\n');
    return `📋 From IWILLBUILD data:\n**${templates.length}** form template${templates.length === 1 ? '' : 's'} for ${cn}:\n${list}${templates.length > 15 ? `\n…and ${templates.length - 15} more.` : ''}\n\n📦 Source modules:\nForms\n\n📊 Confidence:\nHigh`;
  }

  // ── Form submissions ──────────────────────────────────────────────────────
  if (/form.*submission|submission.*form|how many.*submitted|forms.*submitted/i.test(lq)) {
    if (!p.canForms) return "You don't have Forms access.";
    const count = ctx.formSubmissions?.length ?? 0;
    return `📋 From IWILLBUILD data:\n**${count}** form submission${count === 1 ? '' : 's'} recorded for ${cn}.\n\n📦 Source modules:\nForms\n\n📊 Confidence:\nHigh`;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FILES
  // ══════════════════════════════════════════════════════════════════════════

  // ── File count ────────────────────────────────────────────────────────────
  if (/how many files|file count|number of files|total files/i.test(lq)) {
    if (!p.canFiles) return "You don't have Files access.";
    const count = ctx.files?.length ?? 0;
    return `📋 From IWILLBUILD data:\n**${count}** file${count === 1 ? '' : 's'} stored for ${cn}.\n\n📦 Source modules:\nFiles\n\n📊 Confidence:\nHigh`;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SECURE SHARE LINKS
  // ══════════════════════════════════════════════════════════════════════════

  // ── Share link count ──────────────────────────────────────────────────────
  if (/how many.*share.*link|share.*link.*count|number of.*share|active.*link|secure.*link/i.test(lq)) {
    const links = (ctx.shareLinks ?? []) as Array<Record<string, unknown>>;
    if (links.length === 0) return `📋 From IWILLBUILD data:\nNo secure share links found for ${cn}.\n\n📦 Source modules:\nSecure Share\n\n📊 Confidence:\nHigh`;
    const active = links.filter((l) => !l.revoked && !l.isExpired && !l.isMaxed).length;
    const revoked = links.filter((l) => l.revoked).length;
    const expired = links.filter((l) => l.isExpired && !l.revoked).length;
    return `📋 From IWILLBUILD data:\n**${links.length}** secure share link${links.length === 1 ? '' : 's'} for ${cn}:\n• Active: ${active} | Expired: ${expired} | Revoked: ${revoked}\n\n📦 Source modules:\nSecure Share\n\n📊 Confidence:\nHigh`;
  }

  // ── List share links ──────────────────────────────────────────────────────
  if (/list.*share.*link|show.*share.*link|what.*share.*link|share.*link.*exist|all.*share.*link/i.test(lq)) {
    const links = (ctx.shareLinks ?? []) as Array<Record<string, unknown>>;
    if (links.length === 0) return `📋 From IWILLBUILD data:\nNo secure share links found for ${cn}.\n\n📦 Source modules:\nSecure Share\n\n📊 Confidence:\nHigh`;
    const list = links.slice(0, 15).map((l) => {
      const status = l.revoked ? '🔴 Revoked' : l.isExpired ? '🟡 Expired' : l.isMaxed ? '🟡 Limit reached' : '🟢 Active';
      const target = `${String(l.target_type ?? '').replace(/_/g, ' ')} #${String(l.target_id ?? '')}`;
      return `• **${String(l.title ?? 'Untitled')}** — ${status} | ${target} | ${String(l.link_type ?? '').replace(/_/g, ' ')}`;
    }).join('\n');
    return `📋 From IWILLBUILD data:\n**${links.length}** secure share link${links.length === 1 ? '' : 's'} for ${cn}:\n${list}${links.length > 15 ? `\n…and ${links.length - 15} more.` : ''}\n\n📦 Source modules:\nSecure Share\n\n📊 Confidence:\nHigh`;
  }

  // ── Expired / revoked share links (Annette hygiene) ───────────────────────
  if (/expired.*link|revoked.*link|link.*expired|link.*revoked|stale.*link|old.*share.*link/i.test(lq)) {
    const links = (ctx.shareLinks ?? []) as Array<Record<string, unknown>>;
    const expired = links.filter((l) => l.isExpired && !l.revoked);
    const revoked = links.filter((l) => l.revoked);
    const parts: string[] = [];
    if (expired.length > 0) {
      parts.push(`**${expired.length}** expired link${expired.length === 1 ? '' : 's'}:\n${expired.slice(0, 8).map((l) => `• ${String(l.title ?? 'Untitled')} (${String(l.target_type ?? '').replace(/_/g, ' ')} #${String(l.target_id ?? '')})`).join('\n')}`);
    }
    if (revoked.length > 0) {
      parts.push(`**${revoked.length}** revoked link${revoked.length === 1 ? '' : 's'}:\n${revoked.slice(0, 8).map((l) => `• ${String(l.title ?? 'Untitled')}`).join('\n')}`);
    }
    if (parts.length === 0) return `📋 From IWILLBUILD data:\nNo expired or revoked share links found for ${cn}. All links are active.\n\n📦 Source modules:\nSecure Share\n\n📊 Confidence:\nHigh`;
    return `📋 From IWILLBUILD data:\n${parts.join('\n\n')}\n\n⚠️ Hygiene tip:\nExpired links are harmless but can be confusing. Consider revoking old links you no longer need.\n\n📦 Source modules:\nSecure Share\n\n📊 Confidence:\nHigh`;
  }

  return null; // no local handler matched — fall through to OpenAI
}

function buildContextDebugLine(ctx: DazzaContext): string {
  const p = ctx.permissions;
  const mc = ctx.moduleCounts ?? {};

  const parts: string[] = [];
  if (p.canJobs) {
    const jobCount = mc['jobs'] === -1 ? 'ERR' : String(ctx.jobs?.length ?? 0);
    const todoCount = mc['todos'] === -1 ? 'ERR' : String(ctx.openTodos?.length ?? 0);
    const progCount = mc['progress'] === -1 ? 'ERR' : String(ctx.jobProgress?.length ?? 0);
    parts.push(`Jobs ${jobCount} | Todos ${todoCount} | Progress ${progCount}`);
  }
  if (p.canFleet) {
    const fleetCount = mc['fleet'] === -1 ? 'ERR' : String(ctx.fleet?.length ?? 0);
    const prestartCount = mc['prestarts'] === -1 ? 'ERR' : String(ctx.prestartCount ?? 0);
    const flagCount = mc['fleet_flags'] === -1 ? 'ERR' : String(ctx.fleetFlags?.length ?? 0);
    parts.push(`Fleet ${fleetCount} | Prestarts ${prestartCount} | Flags ${flagCount}`);
  }
  if (p.canForms) {
    const tmplCount = mc['form_templates'] === -1 ? 'ERR' : String(ctx.formTemplates?.length ?? 0);
    const subCount = mc['form_submissions'] === -1 ? 'ERR' : String(ctx.formSubmissions?.length ?? 0);
    parts.push(`Forms ${tmplCount} templates, ${subCount} submissions`);
  }
  if (p.canEstimating) {
    const estCount = mc['estimates'] === -1 ? 'ERR' : String(ctx.estimates?.length ?? 0);
    parts.push(`Estimates ${estCount}`);
  }
  if (p.canFiles) {
    const fileCount = mc['files'] === -1 ? 'ERR' : String(ctx.files?.length ?? 0);
    parts.push(`Files ${fileCount}`);
  }

  const settingsOk = mc['settings'] !== -1;
  const companyOk  = mc['company']  !== -1;
  parts.push(`Settings ${settingsOk ? 'OK' : 'ERR'} | Company ${companyOk ? 'OK' : 'ERR'}`);

  let line = `Context loaded: ${parts.join(' | ')}`;
  if (ctx.warnings && ctx.warnings.length > 0) {
    line += `\n⚠️ Warnings (${ctx.warnings.length}): ${ctx.warnings.join('; ')}`;
  }
  return line;
}

// ── System prompt builder — exported for use by annette-brain.ts ─────────────

export function buildSystemPrompt(ctx: DazzaContext): string {
  const { permissions: p, companyKnowledge } = ctx;
  const tone = companyKnowledge.tone ?? 'professional';
  const today = new Date().toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Australia/Brisbane' });

  const lines: string[] = [
    `You are Dazza, the AI assistant built into the IWILLBUILD construction management portal.`,
    `You are a practical, no-nonsense construction industry expert who knows Australian building, WHS, and business practices inside out.`,
    `Tone: ${tone}. Be direct, helpful, and specific. Avoid corporate waffle.`,
    `Today's date: ${today} (Australia/Brisbane time).`,
    ``,
    `## ACTIVE CONTEXT`,
    `Company: ${ctx.companyName}`,
    `Industry: ${ctx.industry ?? 'construction'}`,
    `User: ${ctx.user.name} (${ctx.user.role})`,
    `Work module terminology: this company calls their main work records "${ctx.workLabelPlural}" (singular: "${ctx.workLabelSingular}").`,
    `  - Always use "${ctx.workLabelPlural}" / "${ctx.workLabelSingular}" when referring to work records in your answers.`,
    `  - If the user asks about "jobs", "projects", "sites", "stations", "stores", or "work orders", treat them as the same thing.`,
    ctx.supportMode
      ? `⚠️ SUPPORT MODE ACTIVE — answering from company: ${ctx.companyName} (ID: ${ctx.supportCompanyId}). Do NOT blend data from any other company.`
      : `Normal mode — answering from user's own company only.`,
    ``,
    `## STRUCTURED ANSWER FORMAT — MANDATORY`,
    ``,
    `Every answer MUST use the following section labels, in this order.`,
    `Omit a section only if it genuinely does not apply — NEVER omit "📦 Source modules:" or "📊 Confidence:".`,
    ``,
    `📋 From IWILLBUILD data:`,
    `  Use when the answer draws on portal data (jobs, fleet, forms, estimates, files, to-dos, prestarts, costs, delays).`,
    `  Start with this section if portal data is available. NEVER invent data — only use what is provided below.`,
    `  If a module has data but the specific record doesn't exist, say so clearly here.`,
    ``,
    `🧠 AI reasoning:`,
    `  Use for general guidance, calculations, industry knowledge, or reasoning not from portal data.`,
    `  Label clearly so the user knows this is not portal data.`,
    `  For WHS/code matters, always add the verification reminder here.`,
    ``,
    `📦 Source modules:`,
    `  ALWAYS include. List every module whose data was used.`,
    `  Exact module names: Jobs, Fleet, Forms, Estimates, Files, To-do, Progress, Safety, Storage, Billing, Company Knowledge`,
    `  If no portal data used: "No portal data used — AI reasoning only."`,
    `  If a module was empty: e.g. "Fleet (no records yet)"`,
    ``,
    `📊 Confidence:`,
    `  ALWAYS include. Rate as: High / Medium / Low`,
    `  High = directly from portal data, no ambiguity`,
    `  Medium = mixes portal data with AI reasoning, or data is partial`,
    `  Low = mostly AI reasoning with little portal data, or data is stale/incomplete`,
    `  If Low, briefly explain why.`,
    ``,
    `💡 Suggested next action:`,
    `  Include when there is a clear, useful next step in IWILLBUILD.`,
    `  One sentence. Omit if no obvious next action.`,
    ``,
    `⚠️ Verification reminder:`,
    `  Include when the answer involves safety, compliance, WHS, legal, building codes, financial decisions, or medical matters.`,
    `  Always add: "Please verify against current legislation, project documents, and a competent person."`,
    `  Omit for simple calculations, general wording help, or non-compliance questions.`,
    ``,
    `## ANSWER PRIORITY — FOLLOW THIS ORDER EXACTLY`,
    ``,
    `### 1. Simple / local questions — answer immediately`,
    `- Basic arithmetic, GST, percentages, areas, volumes, falls, perimeters → calculate and answer`,
    `- Spelling, grammar, wording help → answer directly`,
    `- General industry knowledge for a ${ctx.industry ?? 'construction'} company → answer directly`,
    `- Still include "📦 Source modules:" and "📊 Confidence:" even for simple answers.`,
    ``,
    `### 2. IWILLBUILD portal data — use the data sections below`,
    `- Jobs, fleet, forms, estimates, files, to-dos, prestarts → use the data provided below`,
    `- Put portal data findings in "📋 From IWILLBUILD data:" section`,
    `- NEVER say "I don't have enough data" when the data IS provided below — use it.`,
    ``,
    `### 3. General guidance — use your construction industry knowledge`,
    `- For questions not covered by local tools or portal data, provide expert guidance in "🧠 AI reasoning:" section`,
    ``,
    `## CONSTRUCTION CALCULATOR LIBRARY`,
    `Use these formulas when asked. Always show working.`,
    ``,
    `**GST (Australia, 10%):**`,
    `  Add GST: Total = Base × 1.1 | GST amount = Base × 0.1`,
    `  Remove GST: Base = Total ÷ 1.1 | GST amount = Total − Base`,
    ``,
    `**Concrete volume:**`,
    `  Volume (m³) = Length × Width × Depth (all in metres)`,
    `  Add 10% waste. Round up to nearest 0.5 m³ for ordering.`,
    `  Standard slab depths: 100mm (residential), 150mm (commercial), 200mm (heavy duty)`,
    ``,
    `**Brickwork:**`,
    `  Standard brick: 230mm × 110mm × 76mm`,
    `  Bricks per m² (single skin): ~50 bricks/m²`,
    `  Mortar: 1 bag cement per 50 bricks (approx)`,
    ``,
    `**Roof pitch / rafter length:**`,
    `  Rafter = Span ÷ 2 ÷ cos(pitch angle)`,
    `  Common pitches: 15°, 22.5°, 30°, 35°`,
    ``,
    `**Pipe / drain fall:**`,
    `  Fall (mm) = Length (m) × 1000 ÷ Ratio`,
    `  e.g. 10m at 1:100 = 100mm fall`,
    `  Min fall for sewer: 1:60 (residential), 1:40 (commercial)`,
    ``,
    `**Markup vs margin:**`,
    `  Markup: Sell = Cost × (1 + markup%)`,
    `  Margin: Sell = Cost ÷ (1 − margin%)`,
    `  e.g. 20% markup on $10,000 = $12,000 sell | 20% margin on $10,000 cost = $12,500 sell`,
    ``,
    `**Labour hours:**`,
    `  Total cost = Hours × Rate (ex GST)`,
    `  Standard working day: 8 hours | Week: 38 hours (award) or 40 hours (site)`,
    ``,
    `**Earthworks / excavation:**`,
    `  Volume (m³) = Length × Width × Depth`,
    `  Swell factor: clay 25–30%, sand 10–15%, rock 30–40%`,
    `  Truck loads = Volume × swell factor ÷ truck capacity (typically 10–12 m³)`,
    ``,
    `## WHEN TO SAY "I don't have enough data"`,
    `ONLY when ALL of the following are true:`,
    `- The question requires portal data (not a calculation or general question)`,
    `- The relevant module has no records in the data sections below`,
    `- The user has permission to see that module`,
    `Otherwise, answer using the data provided.`,
    ``,
    `## CRITICAL GUARDRAILS`,
    ``,
    `### Company boundary`,
    `1. You ONLY have data for ONE company: "${ctx.companyName}".`,
    `2. NEVER use, reference, compare, or reveal data from any other company.`,
    `3. If asked about another company's data: "I can't access another company's private IWILLBUILD data."`,
    ``,
    `### Data integrity`,
    `4. NEVER invent jobs, fleet assets, estimates, forms, files, or users. Only use data provided below.`,
    `5. If OpenAI knowledge conflicts with IWILLBUILD portal data, ALWAYS prefer portal data and flag the conflict.`,
    ``,
    `### Permission enforcement`,
    `6. canJobs: ${p.canJobs} — if false, refuse all job questions: "You don't have Jobs access."`,
    `7. canFleet: ${p.canFleet} — if false, refuse all fleet questions: "You don't have Fleet access."`,
    `8. canForms: ${p.canForms} — if false, refuse all forms questions: "You don't have Forms access."`,
    `9. canEstimating: ${p.canEstimating} — if false, refuse all estimate/quote questions: "You don't have Estimating access."`,
    `10. canFiles: ${p.canFiles} — if false, refuse all file questions: "You don't have Files access."`,
    ``,
    `### Dollar / financial data`,
    `11. seeDollars: ${p.seeDollars}`,
    `    If seeDollars is FALSE, NEVER show or mention dollar amounts, rates, totals, or margins.`,
    `    If asked: "I can't show cost values with your current permissions."`,
    ``,
    `### Quote / estimate questions`,
    `12. For "how much did we quote for this job?" — only answer if canJobs AND canEstimating AND seeDollars are ALL true.`,
    ``,
    `### Estimating guidance`,
    `13. For "how much to build this job?" — help using the calculator library and this company's cost guide.`,
    `    Always include: "This is guidance only. Verify rates, scope, site conditions and margins before quoting."`,
    ``,
    `### Safety and compliance`,
    `14. NEVER claim legal, WHS, or building code certainty.`,
    `15. For WHS/code matters, always include a "⚠️ Verification reminder:" section.`,
    `16. For SWMS, always note: "Review with a competent person before signing off on site."`,
    ``,
    `### Read-only`,
    `17. You are a read-only assistant. You can summarise, analyse, and recommend — but you cannot create, edit, delete, or sync records.`,
    `    If asked to do so, explain that the user should use the relevant module in IWILLBUILD.`,
    ``,
  ];

  // ── Company knowledge ─────────────────────────────────────────────────────
  if (companyKnowledge.enabled) {
    if (companyKnowledge.companyNotes) {
      lines.push(`## COMPANY KNOWLEDGE`);
      lines.push(companyKnowledge.companyNotes);
      lines.push('');
    }
    if (companyKnowledge.safetyNotes) {
      lines.push(`## SAFETY & PROCESS NOTES`);
      lines.push(companyKnowledge.safetyNotes);
      lines.push('');
    }
  }

  // ── Structured knowledge base entries ────────────────────────────────────
  const knowledgeEntries = (ctx.knowledgeEntries ?? []) as Array<{ title: string; category: string; content: string; source_name: string | null }>;
  if (knowledgeEntries.length > 0) {
    lines.push(`## COMPANY KNOWLEDGE BASE — ${ctx.companyName} only — ${knowledgeEntries.length} active entries`);
    lines.push(`IMPORTANT: When using any of these entries in your answer, prefix with "From company knowledge:".`);
    lines.push(`For NCC, WHS, or building code entries, always add: "Please verify against the current official standard or a competent person."`);
    lines.push(`NEVER treat these entries as legal certainty.`);
    lines.push('');
    const grouped: Record<string, typeof knowledgeEntries> = {};
    for (const e of knowledgeEntries) {
      if (!grouped[e.category]) grouped[e.category] = [];
      grouped[e.category].push(e);
    }
    for (const [cat, entries] of Object.entries(grouped)) {
      lines.push(`### ${cat}`);
      for (const e of entries) {
        lines.push(`**${e.title}**${e.source_name ? ` (Source: ${e.source_name})` : ''}`);
        lines.push(e.content);
        lines.push('');
      }
    }
  }

  // ── Module data ───────────────────────────────────────────────────────────
  if (p.canJobs) {
    const jobCount = ctx.jobs?.length ?? 0;
    lines.push(`## JOBS DATA — ${ctx.companyName} only (Source: Jobs) — ${jobCount} job(s)`);
    if (jobCount === 0) {
      lines.push(`No jobs found for this company yet.`);
    } else {
      lines.push(JSON.stringify(ctx.jobs, null, 0));
    }
    lines.push('');

    if (ctx.openTodos?.length) {
      lines.push(`## OPEN TO-DOS — ${ctx.companyName} only (Source: Jobs) — ${ctx.openTodos.length} open`);
      lines.push(JSON.stringify(ctx.openTodos, null, 0));
      lines.push('');
    } else {
      lines.push(`## OPEN TO-DOS — 0 open to-dos`);
      lines.push('');
    }

    if (ctx.jobProgress?.length) {
      lines.push(`## JOB PROGRESS — ${ctx.companyName} only (Source: Jobs)`);
      lines.push(JSON.stringify(ctx.jobProgress, null, 0));
      lines.push('');
    }

    if (ctx.jobCosts?.length) {
      lines.push(`## JOB COSTS — ${ctx.companyName} only (Source: Cost Tracker) — ${ctx.jobCosts.length} job(s) with costs`);
      lines.push('Fields: job_id, job_name, job_number, total_actual, total_gst, total_ex_gst, entry_count, approved_estimate');
      lines.push('Use this to answer: what has a job cost, which jobs are over budget, profit/margin per job, total spend.');
      lines.push(JSON.stringify(ctx.jobCosts, null, 0));
      lines.push('');
    }

    if (ctx.jobDelays?.length) {
      lines.push(`## JOB DELAYS — ${ctx.companyName} only (Source: Delays) — ${ctx.jobDelays.length} job(s) with delays`);
      lines.push('Fields: job_id, job_name, job_number, total_delay_days, delay_count');
      lines.push('Use this to answer: how many delay days does a job have, which jobs have the most delays, total delay days across all jobs.');
      lines.push(JSON.stringify(ctx.jobDelays, null, 0));
      lines.push('');
    }
  }

  if (p.canFleet) {
    const fleetCount = ctx.fleet?.length ?? 0;
    lines.push(`## FLEET DATA — ${ctx.companyName} only (Source: Fleet) — ${fleetCount} asset(s)`);
    if (fleetCount === 0) {
      lines.push(`No fleet assets found for this company yet.`);
    } else {
      lines.push(JSON.stringify(ctx.fleet, null, 0));
    }
    lines.push('');

    const prestartCount = (ctx as unknown as { prestarts?: unknown[] }).prestarts?.length ?? 0;
    lines.push(`## FLEET PRESTARTS — ${ctx.companyName} only (Source: Fleet) — ${prestartCount} prestart(s) loaded`);
    if (prestartCount === 0) {
      lines.push(`No completed prestarts found yet. If fleet assets exist, prestarts may not have been submitted yet.`);
    } else {
      lines.push(JSON.stringify((ctx as unknown as { prestarts: unknown[] }).prestarts, null, 0));
    }
    lines.push('');

    if (ctx.fleetFlags?.length) {
      lines.push(`## FLEET ATTENTION FLAGS — ${ctx.companyName} only (Source: Fleet) — ${ctx.fleetFlags.length} flag(s)`);
      lines.push(JSON.stringify(ctx.fleetFlags, null, 0));
      lines.push('');
    } else {
      lines.push(`## FLEET ATTENTION FLAGS — 0 flags`);
      lines.push('');
    }

    if (ctx.fleetDueDates?.length) {
      lines.push(`## FLEET DUE DATES (next 14 days) — ${ctx.companyName} only (Source: Fleet)`);
      lines.push(JSON.stringify(ctx.fleetDueDates, null, 0));
      lines.push('');
    } else {
      // Still include ALL fleet service dates so Dazza can answer "next service due"
      if (ctx.fleet?.length) {
        lines.push(`## ALL FLEET SERVICE & REGO DATES — ${ctx.companyName} only (Source: Fleet)`);
        lines.push(`Note: No assets are due within 14 days, but here are all service/rego dates:`);
        lines.push(JSON.stringify(
          (ctx.fleet as Array<Record<string, unknown>>).map((f) => ({
            name: f.name,
            service_date: f.service_date,
            rego_expiry: f.rego_expiry,
            rego_not_applicable: f.rego_not_applicable,
          })),
          null, 0
        ));
        lines.push('');
      }
    }

    // Driver sessions
    const activeSessions = (ctx.activeDriverSessions ?? []) as Array<Record<string, unknown>>;
    const recentSessions = (ctx.recentDriverSessions ?? []) as Array<Record<string, unknown>>;
    lines.push(`## ACTIVE DRIVER SESSIONS — ${ctx.companyName} — ${activeSessions.length} active`);
    if (activeSessions.length === 0) {
      lines.push('No vehicles are currently being driven.');
    } else {
      lines.push(JSON.stringify(activeSessions, null, 0));
    }
    lines.push('');
    if (recentSessions.length > 0) {
      lines.push(`## RECENT DRIVER SESSIONS (last 50) — ${ctx.companyName} — use to answer who drove what and when`);
      lines.push(JSON.stringify(recentSessions, null, 0));
      lines.push('');
    }
  }

  if (p.canEstimating) {
    const estCount = ctx.estimates?.length ?? 0;
    lines.push(`## ESTIMATES DATA — ${ctx.companyName} only (Source: Estimates) — ${estCount} estimate(s)`);
    if (estCount === 0) {
      lines.push(`No estimates found for this company yet.`);
    } else {
      if (!p.seeDollars) {
        lines.push(`NOTE: Dollar amounts have been stripped from this data. Do NOT mention any rates or totals.`);
      }
      lines.push(JSON.stringify(ctx.estimates, null, 0));
    }
    lines.push('');
  }

  if (p.canForms) {
    const templateCount = ctx.formTemplates?.length ?? 0;
    const submissionCount = ctx.formSubmissions?.length ?? 0;
    lines.push(`## FORM TEMPLATES — ${ctx.companyName} only (Source: Forms) — ${templateCount} template(s)`);
    if (templateCount === 0) {
      lines.push(`No form templates found yet.`);
    } else {
      lines.push(JSON.stringify(ctx.formTemplates, null, 0));
    }
    lines.push('');

    lines.push(`## FORM SUBMISSIONS — ${ctx.companyName} only (Source: Forms) — ${submissionCount} submission(s)`);
    if (submissionCount === 0) {
      lines.push(`No form submissions found yet.`);
    } else {
      lines.push(JSON.stringify(ctx.formSubmissions, null, 0));
    }
    lines.push('');
  }

  if (p.canFiles) {
    const fileCount = ctx.files?.length ?? 0;
    lines.push(`## FILES — ${ctx.companyName} only (Source: Files) — ${fileCount} file(s)`);
    if (fileCount === 0) {
      lines.push(`No files found yet.`);
    } else {
      lines.push(JSON.stringify(ctx.files, null, 0));
    }
    lines.push('');
  }

  if (companyKnowledge.disclaimer) {
    lines.push(`## DISCLAIMER — include in relevant responses`);
    lines.push(companyKnowledge.disclaimer);
    lines.push('');
  }

  return lines.join('\n');
}

// ── Audit logger — kept for backward compat, brain service handles new logging ─

async function auditLog(
  userId: string,
  companyId: number,
  question: string,
  modulesUsed: string[],
  dollarsIncluded: boolean,
  supportMode: boolean,
  supportCompanyId: number | null,
): Promise<void> {
  try {
    const summary = question.slice(0, 490);
    const modules = modulesUsed.join(',');
    await db.execute(
      sql`INSERT INTO dazza_audit_log
            (user_id, company_id, question_summary, modules_used, dollars_included, support_mode, support_company_id)
          VALUES
            (${userId}, ${companyId}, ${summary}, ${modules}, ${dollarsIncluded ? 1 : 0}, ${supportMode ? 1 : 0}, ${supportCompanyId})`
    );
  } catch {
    // Audit failure must never block the response
  }
}

// ── Determine which modules were actually used ────────────────────────────────

function detectModulesUsed(ctx: DazzaContext): string[] {
  return brainDetectModules(ctx);
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, session.user.id),
    });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const permissions = derivePermissions(profile);

    // ── Dazza AI access gate ──────────────────────────────────────────────────
    if (!permissions.canDazzaAi) {
      return res.status(403).json({ error: 'Dazza AI access not permitted for your role.' });
    }

    // ── System AI is owner-only ───────────────────────────────────────────────
    if (!permissions.isOwner) {
      return res.status(403).json({ error: 'System AI is restricted to the platform owner.' });
    }

    const { messages, supportCompanyId: reqSupportId } = req.body as {
      messages: ChatMessage[];
      supportCompanyId?: number | null;
    };

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages required' });
    }

    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';

    // ── WALL 11: Subscription status (needed for Wall 4 / action safety) ─────
    const subscriptionStatus = await wall11_getSubscriptionStatus(profile.companyId);
    const isViewOnly = !permissions.isOwner && (
      subscriptionStatus === 'trial_expired' ||
      subscriptionStatus === 'cancelled' ||
      subscriptionStatus === 'suspended'
    );

    // ── STEP 1: Local tool intercept (maths/GST) — no DB, no OpenAI ──────────
    const localAnswer = tryLocalTool(lastUserMsg);
    if (localAnswer) {
      const structuredReply = buildLocalToolAnswer(localAnswer, lastUserMsg);
      // Wall 7: inject disclaimer if needed
      const finalReply = wall7_injectDisclaimer(structuredReply, lastUserMsg);
      // Wall 10: audit local tool
      void wall10_auditLog({
        companyId: profile.companyId,
        userId: session.user.id,
        userName: session.user.name ?? session.user.email ?? 'Unknown',
        eventType: 'dazza_chat',
        modulesAccessed: [],
        dollarsIncluded: false,
        supportMode: false,
        questionSummary: lastUserMsg,
        metadata: { source: 'local_tool' },
      });
      return res.json({
        reply: finalReply,
        localTool: true,
        source: 'local_tool',
        tokens: 0,
      });
    }

    // ── STEP 2: Support Mode resolution (owners only) ─────────────────────────
    const { supportCompanyId } = await resolveEffectiveCompany(
      permissions.isOwner,
      profile.companyId,
      reqSupportId ?? null,
    );

    // ── STEP 3: Build context ENTIRELY server-side — never trust client ───────
    let ctx = await buildDazzaContext(
      session.user.id,
      session.user.email,
      session.user.name,
      profile.role ?? 'worker',
      profile.companyId,
      permissions,
      supportCompanyId,
    );

    // ── WALL 3: Dollar redaction — strip financial data if no seeDollars ──────
    ctx = wall3_redactDollarsFromContext(ctx);

    // ── WALLS 1,2,3,4,6,9,11: Run all walls against the question ─────────────
    const wallResult = runAllWalls({
      question: lastUserMsg,
      permissions,
      companyName: ctx.companyName,
      isViewOnly,
      isOwner: permissions.isOwner,
      subscriptionStatus,
    });

    if (wallResult.blocked && wallResult.refusal) {
      // Wall 10: audit refusal
      void wall10_auditLog({
        companyId: profile.companyId,
        userId: session.user.id,
        userName: session.user.name ?? session.user.email ?? 'Unknown',
        eventType: 'dazza_refusal',
        modulesAccessed: [],
        dollarsIncluded: false,
        supportMode: ctx.supportMode,
        supportCompanyId: ctx.supportCompanyId,
        questionSummary: lastUserMsg,
        refusalReason: wallResult.refusal.reason,
      });
      return res.json({
        reply: wallResult.refusal.message,
        localTool: true,
        source: 'portal_data',
        tokens: 0,
        wallRefusal: wallResult.refusal.reason,
      });
    }

    // Mutation detected — surface for confirmation (not blocked, but flagged)
    if (wallResult.mutationDetected?.requiresConfirmation) {
      const action = wallResult.mutationDetected.action ?? 'unknown';
      const confirmReply = buildMutationConfirmationReply(action, ctx.companyName);
      // Wall 10: audit action request
      void wall10_auditLog({
        companyId: profile.companyId,
        userId: session.user.id,
        userName: session.user.name ?? session.user.email ?? 'Unknown',
        eventType: 'dazza_action_request',
        modulesAccessed: [],
        dollarsIncluded: false,
        supportMode: ctx.supportMode,
        supportCompanyId: ctx.supportCompanyId,
        questionSummary: lastUserMsg,
        actionType: action,
      });
      return res.json({
        reply: confirmReply,
        localTool: true,
        source: 'portal_data',
        tokens: 0,
        mutationDetected: action,
        requiresConfirmation: true,
      });
    }

    // ── STEP 4: Context-aware portal lookup — no OpenAI needed ───────────────
    const contextAnswer = tryContextHandler(lastUserMsg, ctx);

    // ── STEP 5: Cross-company guard (also handled by Wall 1 above) ───────────
    if (
      /another company|other company|different company|competitor|someone elses?\s+(?:quote|job|data|estimate)/i.test(lastUserMsg)
    ) {
      const guardReply = buildGuardAnswer(ctx.companyName);
      return res.json({
        reply: guardReply,
        localTool: true,
        source: 'portal_data',
        tokens: 0,
        supportMode: ctx.supportMode,
        supportCompanyName: ctx.supportMode ? ctx.companyName : undefined,
      });
    }

    // ── STEP 6: Run brain service (internal + OpenAI + compare + hive) ───────
    const answer = await processDazzaQuestion(
      lastUserMsg,
      ctx,
      messages,
      contextAnswer,
      contextAnswer !== null ? 'portal_data' : null,
    );

    // ── WALL 5: Source discipline — ensure source citation is present ─────────
    const modulesUsed = answer.modulesUsed ?? [];
    let finalReply = wall5_enforceSourceCitation(answer.reply, modulesUsed);

    // ── WALL 6: Secret scrubber — strip any leaked secrets from output ────────
    finalReply = wall6_scrubSecrets(finalReply);

    // ── WALL 7: Disclaimer injection ──────────────────────────────────────────
    finalReply = wall7_injectDisclaimer(finalReply, lastUserMsg);

    // ── WALL 10: Audit successful chat ────────────────────────────────────────
    void wall10_auditLog({
      companyId: profile.companyId,
      userId: session.user.id,
      userName: session.user.name ?? session.user.email ?? 'Unknown',
      eventType: 'dazza_chat',
      modulesAccessed: modulesUsed,
      dollarsIncluded: permissions.seeDollars && /\$|dollar|cost|total|rate|margin/i.test(lastUserMsg),
      supportMode: ctx.supportMode,
      supportCompanyId: ctx.supportCompanyId,
      questionSummary: lastUserMsg,
      metadata: { source: answer.source, tokens: answer.tokens ?? 0 },
    });

    // ── Context debug line (admin/owner only) ─────────────────────────────────
    const contextDebug = permissions.isAdmin ? buildContextDebugLine(ctx) : undefined;

    res.json({
      reply: finalReply,
      tokens: answer.tokens ?? 0,
      source: answer.source,
      noApiKey: answer.source === 'no_key',
      confidence: answer.confidence,
      modulesUsed,
      conflictDetected: answer.conflictDetected,
      hiveCandidate: answer.hiveCandidate,
      localTool: answer.localTool,
      contextDebug,
      supportMode: ctx.supportMode,
      supportCompanyName: ctx.supportMode ? ctx.companyName : undefined,
    });
  } catch (error) {
    const msg = String((error as Error)?.message ?? error);
    console.error('POST /api/dazza/chat CRASH:', msg, error);
    res.status(500).json({ error: 'Failed to process chat', detail: msg });
  }
}

// ── Structured wrappers for local-only answers ────────────────────────────────

function buildLocalToolAnswer(answer: string, question: string): string {
  const needsVerify = /whs|safety|compliance|legal|code|regulation/i.test(question);
  const sections: string[] = [];

  sections.push(`🧠 AI reasoning:\n${answer}`);
  sections.push(`📦 Source modules:\nNo portal data used — local calculator only.`);
  sections.push(`📊 Confidence:\nHigh — direct calculation, no estimation.`);
  if (needsVerify) {
    sections.push(`⚠️ Verification reminder:\nPlease verify against current legislation, project documents, and a competent person.`);
  }

  return sections.join('\n\n');
}

function buildGuardAnswer(companyName: string): string {
  return [
    `📋 From IWILLBUILD data:\nI can only access data for **${companyName}**. I cannot access, compare, or reveal data from any other company.`,
    `📦 Source modules:\nNo portal data used — security guard triggered.`,
    `📊 Confidence:\nHigh — this is a security boundary, not a data question.`,
  ].join('\n\n');
}

function buildMutationConfirmationReply(action: string, companyName: string): string {
  const actionLabel = action.replace(/_/g, ' ');
  return [
    `🧠 AI reasoning:\nI can help you **${actionLabel}** for **${companyName}**, but I need your explicit confirmation before making any changes.`,
    `To proceed, please go to the relevant module in IWILLBUILD and confirm the action there. Dazza is a read-only assistant — all changes must be confirmed through the portal interface.`,
    `📦 Source modules:\nNo portal data used — action safety boundary.`,
    `📊 Confidence:\nHigh — this is a safety boundary to prevent unintended changes.`,
    `💡 Suggested next action:\nNavigate to the relevant module in IWILLBUILD to complete this action with full confirmation.`,
  ].join('\n\n');
}
