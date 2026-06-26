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

// ── Context summary line (for admin/owner debug) ──────────────────────────────

function buildContextDebugLine(ctx: DazzaContext): string {
  const p = ctx.permissions;
  const parts: string[] = [];
  if (p.canJobs)       parts.push(`Jobs ${ctx.jobs?.length ?? 0}`);
  if (p.canFleet)      parts.push(`Fleet ${ctx.fleet?.length ?? 0}`);
  if (p.canForms)      parts.push(`Forms ${ctx.formTemplates?.length ?? 0} templates, ${ctx.formSubmissions?.length ?? 0} submissions`);
  if (p.canEstimating) parts.push(`Estimates ${ctx.estimates?.length ?? 0}`);
  if (p.canFiles)      parts.push(`Files ${ctx.files?.length ?? 0}`);
  const prestartCount = (ctx as unknown as { prestartCount?: number }).prestartCount ?? 0;
  if (p.canFleet)      parts.push(`Prestarts ${prestartCount}`);
  return `Context loaded: ${parts.join(', ')}`;
}

// ── System prompt builder ─────────────────────────────────────────────────────

function buildSystemPrompt(ctx: DazzaContext): string {
  const { permissions: p, companyKnowledge } = ctx;
  const tone = companyKnowledge.tone ?? 'professional';

  const lines: string[] = [
    `You are Dazza, the AI assistant for the IWILLBUILD construction portal.`,
    `You are helpful, practical, and honest. Tone: ${tone}.`,
    ``,
    `## ACTIVE CONTEXT`,
    `Company: ${ctx.companyName}`,
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
    `- Basic construction calculators: concrete volumes, areas, falls, grades → calculate and answer`,
    `- Spelling, grammar, wording help → answer directly`,
    `- General construction knowledge → answer directly`,
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
    if (!apiKey) {
      return res.json({
        reply: "I'm Dazza, your IWILLBUILD assistant. To enable AI responses, an Owner or Admin needs to add an OpenAI API key in Settings → Dazza AI. Once that's done, I'll be able to answer questions about your jobs, fleet, estimates, and more using your real portal data.",
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
    console.error('POST /api/dazza/chat error:', error);
    res.status(500).json({ error: 'Failed to process chat' });
  }
}
