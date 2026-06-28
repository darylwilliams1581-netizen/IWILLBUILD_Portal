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
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ── Local tool intercept ──────────────────────────────────────────────────────
// Handles simple questions that don't need OpenAI at all.

function tryLocalTool(question: string): string | null {
  const q = question.trim();

  // Simple arithmetic: "2+2", "2+2=", "what is 3*4", "calculate 100/5"
  const mathMatch = q.match(/^(?:what\s+is\s+|calculate\s+|calc\s+)?([0-9\s\+\-\*\/\.\(\)%]+)=?$/i);
  if (mathMatch) {
    const expr = mathMatch[1].trim();
    try {
      // Safe eval — only digits and math operators
      if (/^[0-9\s\+\-\*\/\.\(\)%]+$/.test(expr)) {
        // eslint-disable-next-line no-new-func
        const result = Function(`"use strict"; return (${expr})`)() as number;
        if (typeof result === 'number' && isFinite(result)) {
          return `${result}`;
        }
      }
    } catch { /* fall through */ }
  }

  // GST add: "add gst to 1000", "1000 + gst", "gst on 500"
  const gstAddMatch = q.match(/(?:add\s+gst\s+to|gst\s+on|plus\s+gst|add\s+10%\s+to)\s*\$?([\d,]+(?:\.\d+)?)/i)
    ?? q.match(/\$?([\d,]+(?:\.\d+)?)\s*\+\s*gst/i);
  if (gstAddMatch) {
    const base = parseFloat(gstAddMatch[1].replace(/,/g, ''));
    if (!isNaN(base)) {
      const gst = +(base * 0.1).toFixed(2);
      const total = +(base + gst).toFixed(2);
      return `GST calculation:\n• Base: $${base.toLocaleString('en-AU', { minimumFractionDigits: 2 })}\n• GST (10%): $${gst.toLocaleString('en-AU', { minimumFractionDigits: 2 })}\n• Total inc. GST: $${total.toLocaleString('en-AU', { minimumFractionDigits: 2 })}`;
    }
  }

  // GST remove: "remove gst from 1100", "ex gst 1100", "1100 ex gst"
  const gstRemoveMatch = q.match(/(?:remove\s+gst\s+from|ex\s+gst\s+|excluding\s+gst\s+|gst\s+exclusive\s+of)\s*\$?([\d,]+(?:\.\d+)?)/i)
    ?? q.match(/\$?([\d,]+(?:\.\d+)?)\s+ex\.?\s+gst/i);
  if (gstRemoveMatch) {
    const total = parseFloat(gstRemoveMatch[1].replace(/,/g, ''));
    if (!isNaN(total)) {
      const base = +(total / 1.1).toFixed(2);
      const gst = +(total - base).toFixed(2);
      return `GST removal:\n• Total inc. GST: $${total.toLocaleString('en-AU', { minimumFractionDigits: 2 })}\n• GST (10%): $${gst.toLocaleString('en-AU', { minimumFractionDigits: 2 })}\n• Base ex. GST: $${base.toLocaleString('en-AU', { minimumFractionDigits: 2 })}`;
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

  // ── Cross-company guard ───────────────────────────────────────────────────
  if (
    /another company|other company|different company|competitor|someone else'?s?\s+(quote|job|data|estimate)/i.test(lq)
  ) {
    return `I can't access another company's private IWILLBUILD data. I only have access to ${ctx.companyName}'s data.`;
  }

  // ── Job count ─────────────────────────────────────────────────────────────
  if (/how many jobs|job count|number of jobs|total jobs/i.test(lq)) {
    if (!p.canJobs) return "You don't have Jobs access.";
    const count = ctx.jobs?.length ?? 0;
    if (count === 0) return `From IWILLBUILD data: No jobs found for ${ctx.companyName} yet. Source: Jobs.`;
    return `From IWILLBUILD data: There ${count === 1 ? 'is' : 'are'} **${count}** job${count === 1 ? '' : 's'} in IWILLBUILD for ${ctx.companyName}. Source: Jobs.`;
  }

  // ── Active / open jobs ────────────────────────────────────────────────────
  if (/active jobs|open jobs|current jobs|list.*jobs|jobs.*list/i.test(lq)) {
    if (!p.canJobs) return "You don't have Jobs access.";
    const jobs = (ctx.jobs ?? []) as Array<Record<string, unknown>>;
    const active = jobs.filter((j) => String(j.status ?? '').toLowerCase() !== 'completed' && String(j.status ?? '').toLowerCase() !== 'cancelled');
    if (active.length === 0) return `From IWILLBUILD data: No active jobs found for ${ctx.companyName}. Source: Jobs.`;
    const list = active.slice(0, 10).map((j) => `• **${String(j.name ?? 'Unnamed')}** (${String(j.status ?? 'Unknown')})${j.client ? ` — ${String(j.client)}` : ''}`).join('\n');
    return `From IWILLBUILD data: **${active.length}** active job${active.length === 1 ? '' : 's'} for ${ctx.companyName}:\n${list}${active.length > 10 ? `\n…and ${active.length - 10} more.` : ''}\nSource: Jobs.`;
  }

  // ── Latest / newest job ───────────────────────────────────────────────────
  if (/latest job|newest job|most recent job|last job added|last job created/i.test(lq)) {
    if (!p.canJobs) return "You don't have Jobs access.";
    const jobs = (ctx.jobs ?? []) as Array<Record<string, unknown>>;
    if (jobs.length === 0) return `From IWILLBUILD data: No jobs found for ${ctx.companyName} yet. Source: Jobs.`;
    const latest = jobs[0];
    return `From IWILLBUILD data: The latest job is **${String(latest.name ?? 'Unnamed')}**` +
      `${latest.client ? ` for ${String(latest.client)}` : ''}` +
      `${latest.status ? ` — Status: ${String(latest.status)}` : ''}` +
      `${latest.created_at ? ` (created ${String(latest.created_at).slice(0, 10)})` : ''}.` +
      ` Source: Jobs.`;
  }

  // ── Jobs needing attention ────────────────────────────────────────────────
  if (/jobs.*attention|attention.*jobs|jobs.*issue|problem.*jobs/i.test(lq)) {
    if (!p.canJobs) return "You don't have Jobs access.";
    const overdue = (ctx.openTodos ?? []) as Array<Record<string, unknown>>;
    const today = new Date().toISOString().slice(0, 10);
    const overdueItems = overdue.filter((t) => t.due_date && String(t.due_date).slice(0, 10) < today);
    if (overdueItems.length === 0) return `From IWILLBUILD data: No jobs with overdue to-dos found. Source: Jobs.`;
    const list = overdueItems.slice(0, 8).map((t) => `• **${String(t.job_name ?? 'Unknown job')}** — "${String(t.title ?? '')}" overdue since ${String(t.due_date ?? '').slice(0, 10)}`).join('\n');
    return `From IWILLBUILD data: **${overdueItems.length}** overdue to-do${overdueItems.length === 1 ? '' : 's'} across jobs:\n${list}\nSource: Jobs.`;
  }

  // ── Fleet count ───────────────────────────────────────────────────────────
  if (/how many fleet|fleet count|number of fleet|total fleet|how many.*asset|fleet.*asset.*count/i.test(lq)) {
    if (!p.canFleet) return "You don't have Fleet access.";
    const count = ctx.fleet?.length ?? 0;
    if (count === 0) return `From IWILLBUILD data: No fleet assets found for ${ctx.companyName} yet. Source: Fleet.`;
    return `From IWILLBUILD data: There ${count === 1 ? 'is' : 'are'} **${count}** fleet asset${count === 1 ? '' : 's'} in IWILLBUILD for ${ctx.companyName}. Source: Fleet.`;
  }

  // ── Last / latest prestart ────────────────────────────────────────────────
  if (/last prestart|latest prestart|most recent prestart|last.*daily check|recent.*prestart/i.test(lq)) {
    if (!p.canFleet) return "You don't have Fleet access.";
    const prestarts = (ctx.prestarts ?? []) as Array<Record<string, unknown>>;
    if (prestarts.length === 0) return `From IWILLBUILD data: No prestarts found for ${ctx.companyName} yet. Source: Fleet.`;
    const last = prestarts[0];
    const flagged = last.issue_needs_attention ? ` ⚠️ Issue flagged: "${String(last.issue_comment ?? '')}"` : ' No issues flagged.';
    return `From IWILLBUILD data: The last prestart was for **${String(last.asset_name ?? 'Unknown asset')}**` +
      `${last.submitted_by_name ? ` submitted by ${String(last.submitted_by_name)}` : ''}` +
      `${last.created_at ? ` on ${String(last.created_at).slice(0, 10)}` : ''}.${flagged} Source: Fleet.`;
  }

  // ── Next service due ──────────────────────────────────────────────────────
  if (/next service|service due|when.*service|service.*when|upcoming service/i.test(lq)) {
    if (!p.canFleet) return "You don't have Fleet access.";
    const fleet = (ctx.fleet ?? []) as Array<Record<string, unknown>>;
    const withDates = fleet
      .filter((f) => f.service_date)
      .sort((a, b) => String(a.service_date).localeCompare(String(b.service_date)));
    if (withDates.length === 0) return `From IWILLBUILD data: No service dates recorded for any fleet assets. Source: Fleet.`;
    const next = withDates[0];
    const today = new Date().toISOString().slice(0, 10);
    const isOverdue = String(next.service_date).slice(0, 10) < today;
    return `From IWILLBUILD data: The next service due is **${String(next.name ?? 'Unknown')}** — service date **${String(next.service_date).slice(0, 10)}**${isOverdue ? ' ⚠️ (overdue)' : ''}. Source: Fleet.`;
  }

  // ── Fleet issues / flags ──────────────────────────────────────────────────
  if (/fleet issue|fleet flag|fleet problem|fleet.*attention|attention.*fleet/i.test(lq)) {
    if (!p.canFleet) return "You don't have Fleet access.";
    const flags = (ctx.fleetFlags ?? []) as Array<Record<string, unknown>>;
    if (flags.length === 0) return `From IWILLBUILD data: No fleet issues flagged for ${ctx.companyName}. Source: Fleet.`;
    const list = flags.slice(0, 8).map((f) => `• **${String(f.asset_name ?? 'Unknown')}** — "${String(f.issue_comment ?? '')}" (${String(f.created_at ?? '').slice(0, 10)})`).join('\n');
    return `From IWILLBUILD data: **${flags.length}** fleet issue${flags.length === 1 ? '' : 's'} flagged:\n${list}\nSource: Fleet.`;
  }

  // ── Open to-dos ───────────────────────────────────────────────────────────
  if (/open to.?do|outstanding to.?do|my to.?do|to.?do list|pending task/i.test(lq)) {
    if (!p.canJobs) return "You don't have Jobs access.";
    const todos = (ctx.openTodos ?? []) as Array<Record<string, unknown>>;
    if (todos.length === 0) return `From IWILLBUILD data: No open to-dos found for ${ctx.companyName}. Source: Jobs.`;
    const list = todos.slice(0, 10).map((t) => `• **${String(t.job_name ?? 'Unknown job')}** — "${String(t.title ?? '')}"${t.due_date ? ` (due ${String(t.due_date).slice(0, 10)})` : ''}`).join('\n');
    return `From IWILLBUILD data: **${todos.length}** open to-do${todos.length === 1 ? '' : 's'}:\n${list}${todos.length > 10 ? `\n…and ${todos.length - 10} more.` : ''}\nSource: Jobs.`;
  }

  // ── Jobs with progress ────────────────────────────────────────────────────
  if (/jobs.*progress|progress.*jobs|which jobs.*progress|progress recorded/i.test(lq)) {
    if (!p.canJobs) return "You don't have Jobs access.";
    const progress = (ctx.jobProgress ?? []) as Array<Record<string, unknown>>;
    if (progress.length === 0) return `From IWILLBUILD data: No job progress recorded for ${ctx.companyName} yet. Source: Jobs.`;
    const list = progress.slice(0, 10).map((p) => `• **${String(p.job_name ?? 'Unknown')}** — ${String(p.avg_percent ?? 0)}% complete`).join('\n');
    return `From IWILLBUILD data: **${progress.length}** job${progress.length === 1 ? '' : 's'} with progress recorded:\n${list}\nSource: Jobs.`;
  }

  // ── Estimate totals ───────────────────────────────────────────────────────
  if (/estimate total|quote total|how much.*quoted|total.*estimate|approved.*work|estimate.*dollar|dollar.*estimate/i.test(lq)) {
    if (!p.canEstimating) return "You don't have Estimating access.";
    if (!p.seeDollars) return "I can't show cost values with your current permissions.";
    const estimates = (ctx.estimates ?? []) as Array<Record<string, unknown>>;
    if (estimates.length === 0) return `From IWILLBUILD data: No estimates found for ${ctx.companyName} yet. Source: Estimates.`;
    const approved = estimates.filter((e) => String(e.status ?? '').toLowerCase() === 'approved');
    const totalApproved = approved.reduce((sum, e) => sum + (parseFloat(String(e.subtotal ?? '0')) || 0), 0);
    const totalAll = estimates.reduce((sum, e) => sum + (parseFloat(String(e.subtotal ?? '0')) || 0), 0);
    return `From IWILLBUILD data: **${estimates.length}** estimate${estimates.length === 1 ? '' : 's'} total.\n` +
      `• All estimates subtotal: **$${totalAll.toLocaleString('en-AU', { minimumFractionDigits: 2 })}** (ex. markup/GST)\n` +
      `• Approved estimates: **${approved.length}** totalling **$${totalApproved.toLocaleString('en-AU', { minimumFractionDigits: 2 })}** (ex. markup/GST)\n` +
      `Source: Estimates.`;
  }

  // ── Form / template count ─────────────────────────────────────────────────
  if (/how many forms|form count|number of forms|form template|available forms/i.test(lq)) {
    if (!p.canForms) return "You don't have Forms access.";
    const count = ctx.formTemplates?.length ?? 0;
    if (count === 0) return `From IWILLBUILD data: No form templates found for ${ctx.companyName} yet. Source: Forms.`;
    return `From IWILLBUILD data: There ${count === 1 ? 'is' : 'are'} **${count}** form template${count === 1 ? '' : 's'} available for ${ctx.companyName}. Source: Forms.`;
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

// ── System prompt builder ─────────────────────────────────────────────────────

function buildSystemPrompt(ctx: DazzaContext): string {
  const { permissions: p, companyKnowledge } = ctx;
  const tone = companyKnowledge.tone ?? 'professional';

  const lines: string[] = [
    `You are Dazza, the AI assistant for the IWILLBUILD portal.`,
    `You are helpful, practical, and honest. Tone: ${tone}.`,
    ``,
    `## ACTIVE CONTEXT`,
    `Company: ${ctx.companyName}`,
    `Industry: ${ctx.industry ?? 'construction'}`,
    `User: ${ctx.user.name} (${ctx.user.role})`,
    ctx.supportMode
      ? `⚠️ SUPPORT MODE ACTIVE — answering from company: ${ctx.companyName} (ID: ${ctx.supportCompanyId}). Do NOT blend data from any other company.`
      : `Normal mode — answering from user's own company only.`,
    ``,
    `## ANSWER PRIORITY — FOLLOW THIS ORDER EXACTLY`,
    ``,
    `### 1. Simple / local questions — answer immediately, no data needed`,
    `- Basic arithmetic: "2+2", "100/4", "3*7" → answer directly, e.g. "4"`,
    `- GST calculations: "add GST to $500", "remove GST from $1100" → calculate and answer`,
    `- Basic industry calculators: concrete volumes, areas, falls, grades, load weights → calculate and answer`,
    `- Spelling, grammar, wording help → answer directly`,
    `- General industry knowledge relevant to a ${ctx.industry ?? 'construction'} company → answer directly`,
    `- Do NOT say "I don't have enough data" for these — just answer.`,
    ``,
    `### 2. IWILLBUILD portal data — use the data sections below`,
    `- When the user asks about jobs, fleet, forms, estimates, files, to-dos, prestarts → use the data provided below`,
    `- Always prefix portal data answers with "From IWILLBUILD data:"`,
    `- Always cite the source module: "Source: Jobs", "Source: Fleet", "Source: Estimates", etc.`,
    `- If a module has data but the specific record doesn't exist, say so clearly:`,
    `  e.g. "From IWILLBUILD data: I can see X fleet assets, but there are no completed prestarts yet. Source: Fleet."`,
    `- NEVER say "I don't have enough data" when the data IS provided below — use it.`,
    ``,
    `### 3. General guidance — use OpenAI knowledge`,
    `- For questions not covered by local tools or portal data, provide general guidance`,
    `- Clearly label as "General guidance:" not portal data`,
    ``,
    `## WHEN TO SAY "I don't have enough data"`,
    `ONLY say this when ALL of the following are true:`,
    `- The question requires portal data (not a simple calculation or general question)`,
    `- The relevant module has no records in the data sections below`,
    `- The user has permission to see that module`,
    `Otherwise, answer using the data provided.`,
    ``,
    `## CRITICAL GUARDRAILS`,
    ``,
    `### Company boundary`,
    `1. You ONLY have data for ONE company in this context: "${ctx.companyName}".`,
    `2. NEVER use, reference, compare, or reveal data from any other company.`,
    `3. If asked about another company's data, respond: "I can't access another company's private IWILLBUILD data."`,
    ``,
    `### Data integrity`,
    `4. NEVER invent jobs, fleet assets, estimates, forms, files, or users. Only use data provided below.`,
    `5. Always clearly separate "From IWILLBUILD data:" from "General guidance:".`,
    ``,
    `### Permission enforcement`,
    `6. canJobs: ${p.canJobs} — if false, refuse all job questions with: "You don't have Jobs access."`,
    `7. canFleet: ${p.canFleet} — if false, refuse all fleet questions with: "You don't have Fleet access."`,
    `8. canForms: ${p.canForms} — if false, refuse all forms questions with: "You don't have Forms access."`,
    `9. canEstimating: ${p.canEstimating} — if false, refuse all estimate/quote questions with: "You don't have Estimating access."`,
    `10. canFiles: ${p.canFiles} — if false, refuse all file questions with: "You don't have Files access."`,
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
    `13. For "how much to build this job?" — you may help using this company's cost guide and calculator logic.`,
    `    Always include: "This is guidance only. Verify rates, scope, site conditions and margins before quoting."`,
    ``,
    `### Safety and compliance`,
    `14. NEVER claim legal, WHS, or building code certainty.`,
    `15. For WHS/code matters, always add: "Please verify against current legislation, NCC, project documents and a competent person."`,
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
    lines.push(`IMPORTANT: When using any of these entries in your answer, you MUST prefix with "From company knowledge:".`);
    lines.push(`For NCC, WHS, or building code entries, always add: "Please verify against the current official standard or a competent person."`);
    lines.push(`NEVER treat these entries as legal certainty.`);
    lines.push('');
    // Group by category for readability
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

// ── Audit logger ──────────────────────────────────────────────────────────────

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
  const used: string[] = [];
  if (ctx.permissions.canJobs       && ctx.jobs?.length)            used.push('jobs');
  if (ctx.permissions.canFleet      && ctx.fleet?.length)           used.push('fleet');
  if (ctx.permissions.canEstimating && ctx.estimates?.length)       used.push('estimates');
  if (ctx.permissions.canForms      && ctx.formTemplates?.length)   used.push('forms');
  if (ctx.permissions.canFiles      && ctx.files?.length)           used.push('files');
  return used;
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

    const { messages, supportCompanyId: reqSupportId } = req.body as {
      messages: ChatMessage[];
      supportCompanyId?: number | null;
    };

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages required' });
    }

    // ── Local tool intercept — no OpenAI needed ───────────────────────────────
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    const localAnswer = tryLocalTool(lastUserMsg);
    if (localAnswer) {
      return res.json({
        reply: localAnswer,
        localTool: true,
        tokens: 0,
      });
    }

    // ── Support Mode resolution (owners only) ─────────────────────────────────
    const { supportCompanyId } = await resolveEffectiveCompany(
      permissions.isOwner,
      profile.companyId,
      reqSupportId ?? null,
    );

    // ── Build context ENTIRELY server-side — never trust client ───────────────
    const ctx = await buildDazzaContext(
      session.user.id,
      session.user.email,
      session.user.name,
      profile.role ?? 'worker',
      profile.companyId,
      permissions,
      supportCompanyId,
    );

    // ── API key check ─────────────────────────────────────────────────────────
    const apiKey = getSecret('OPENAI_API_KEY');

    // ── Context-aware local handler — no OpenAI needed ────────────────────────
    const contextAnswer = tryContextHandler(lastUserMsg, ctx);
    if (contextAnswer) {
      const contextDebugLocal = permissions.isAdmin ? buildContextDebugLine(ctx) : undefined;
      await auditLog(session.user.id, profile.companyId, lastUserMsg, detectModulesUsed(ctx), false, ctx.supportMode, ctx.supportCompanyId);
      return res.json({
        reply: contextAnswer,
        localTool: true,
        tokens: 0,
        contextDebug: contextDebugLocal,
        supportMode: ctx.supportMode,
        supportCompanyName: ctx.supportMode ? ctx.companyName : undefined,
      });
    }

    if (!apiKey) {
      return res.json({
        reply: "I can answer simple portal lookups and calculators, but an OpenAI API key is needed for general AI responses. An Owner or Admin can add one in Settings → Dazza AI.",
        noApiKey: true,
      });
    }

    const systemPrompt = buildSystemPrompt(ctx);

    // Trim history to last 10 messages to keep token usage reasonable
    const recentMessages = messages.slice(-10);

    const payload = {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        ...recentMessages,
      ],
      max_tokens: 1200,
      temperature: 0.3,
    };

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.error('OpenAI error:', openaiRes.status, errText);
      return res.status(502).json({ error: 'AI service error', detail: openaiRes.status });
    }

    const data = await openaiRes.json() as {
      choices: Array<{ message: { content: string } }>;
      usage?: { total_tokens: number };
    };

    const reply = data.choices?.[0]?.message?.content ?? "I couldn't generate a response. Please try again.";

    // ── Context debug line (admin/owner only) ─────────────────────────────────
    const contextDebug = permissions.isAdmin ? buildContextDebugLine(ctx) : undefined;

    // ── Audit log ─────────────────────────────────────────────────────────────
    const modulesUsed = detectModulesUsed(ctx);
    await auditLog(
      session.user.id,
      profile.companyId,
      lastUserMsg,
      modulesUsed,
      permissions.seeDollars && modulesUsed.includes('estimates'),
      ctx.supportMode,
      ctx.supportCompanyId,
    );

    res.json({
      reply,
      tokens: data.usage?.total_tokens,
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
