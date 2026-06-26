/**
 * POST /api/dazza/chat
 * ─────────────────────────────────────────────────────────────────────────────
 * Dazza AI chat — server-side context, full guardrails, audit logging.
 *
 * Security:
 *  - Context is ALWAYS re-fetched server-side from the session.
 *    The client sends messages only — no context payload is trusted.
 *  - permDazzaAi checked before any processing.
 *  - companyId comes from session profile only.
 *  - Support Mode: owners may pass supportCompanyId in body; verified server-side.
 *  - seeDollars enforced in buildDazzaContext() and double-enforced in system prompt.
 *  - Every sensitive-data answer is audit-logged (user, company, modules, dollars).
 *  - Raw secrets and passwords are never logged.
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
    `## CRITICAL GUARDRAILS — FOLLOW THESE EXACTLY AND WITHOUT EXCEPTION`,
    ``,
    `### Company boundary`,
    `1. You ONLY have data for ONE company in this context: "${ctx.companyName}".`,
    `2. NEVER use, reference, compare, or reveal data from any other company.`,
    `3. If asked about another company's jobs, quotes, rates, or data, respond EXACTLY:`,
    `   "I can't access or use another company's private IWILLBUILD data for that."`,
    `4. NEVER compare this company's quote to another company's quote.`,
    `5. NEVER answer "what did another company charge" or similar cross-company questions.`,
    `6. NEVER use another company's cost guide, recipes, jobs, or estimates.`,
    ``,
    `### Data integrity`,
    `7. NEVER invent jobs, fleet assets, estimates, forms, files, or users. Only use data provided below.`,
    `8. If data is missing or empty, say: "I don't have enough IWILLBUILD data for that yet."`,
    `9. Always clearly separate "From IWILLBUILD data:" from "General guidance:".`,
    `10. Always cite the source module: e.g. "Source: Jobs", "Source: Fleet", "Source: Estimates".`,
    ``,
    `### Permission enforcement`,
    `11. canJobs: ${p.canJobs} — if false, refuse all job questions with: "You don't have Jobs access."`,
    `12. canFleet: ${p.canFleet} — if false, refuse all fleet questions with: "You don't have Fleet access."`,
    `13. canForms: ${p.canForms} — if false, refuse all forms questions with: "You don't have Forms access."`,
    `14. canEstimating: ${p.canEstimating} — if false, refuse all estimate/quote questions with: "You don't have Estimating access."`,
    `15. canFiles: ${p.canFiles} — if false, refuse all file questions with: "You don't have Files access."`,
    ``,
    `### Dollar / financial data`,
    `16. seeDollars: ${p.seeDollars}`,
    `    If seeDollars is FALSE, you MUST NEVER show or mention:`,
    `    - Quote totals, estimate totals, subtotals, or approved values`,
    `    - Rates, unit rates, labour rates, or material rates`,
    `    - Margins, markup percentages, or contract values`,
    `    - Cost guide rates or recipe costs`,
    `    - Any dollar amount at all`,
    `    If asked for dollar values when seeDollars is false, respond EXACTLY:`,
    `    "I can't show quote or cost values with your current permissions."`,
    ``,
    `### Quote / estimate questions`,
    `17. For "how much did we quote for this job?" — only answer if:`,
    `    - canJobs AND canEstimating AND seeDollars are ALL true`,
    `    - The estimate belongs to this company's job`,
    `    If allowed: "From IWILLBUILD data: [Job] approved quote total is $X. Source: Estimates."`,
    `    If not allowed: "I can't show quote values with your current permissions."`,
    ``,
    `### Estimating guidance`,
    `18. For "how much to build this job?" — you may help using:`,
    `    - This company's cost guide and recipes (if provided)`,
    `    - This company's historical estimates (only if canEstimating AND seeDollars)`,
    `    - Calculator logic`,
    `    You MUST include: "This is guidance only. Verify rates, scope, site conditions and margins before quoting."`,
    `    You MUST NOT pull another company's rates or reveal another company's pricing.`,
    ``,
    `### Safety and compliance`,
    `19. NEVER claim legal, WHS, building code, or compliance certainty.`,
    `20. For building/WHS/code matters, always add: "Please verify against current legislation, NCC, project documents and a competent person."`,
    `21. NEVER say "Everything is compliant." — you cannot know that.`,
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
  if (p.canJobs && ctx.jobs) {
    lines.push(`## JOBS DATA — ${ctx.companyName} only (Source: Jobs)`);
    lines.push(JSON.stringify(ctx.jobs, null, 0));
    lines.push('');
    if (ctx.openTodos?.length) {
      lines.push(`## OPEN TO-DOS — ${ctx.companyName} only (Source: Jobs)`);
      lines.push(JSON.stringify(ctx.openTodos, null, 0));
      lines.push('');
    }
    if (ctx.jobProgress?.length) {
      lines.push(`## JOB PROGRESS — ${ctx.companyName} only (Source: Jobs)`);
      lines.push(JSON.stringify(ctx.jobProgress, null, 0));
      lines.push('');
    }
  }

  if (p.canFleet && ctx.fleet) {
    lines.push(`## FLEET DATA — ${ctx.companyName} only (Source: Fleet)`);
    lines.push(JSON.stringify(ctx.fleet, null, 0));
    lines.push('');
    if (ctx.fleetFlags?.length) {
      lines.push(`## FLEET ATTENTION FLAGS — ${ctx.companyName} only (Source: Fleet)`);
      lines.push(JSON.stringify(ctx.fleetFlags, null, 0));
      lines.push('');
    }
    if (ctx.fleetDueDates?.length) {
      lines.push(`## FLEET DUE DATES — ${ctx.companyName} only (Source: Fleet)`);
      lines.push(JSON.stringify(ctx.fleetDueDates, null, 0));
      lines.push('');
    }
  }

  if (p.canEstimating && ctx.estimates) {
    lines.push(`## ESTIMATES DATA — ${ctx.companyName} only (Source: Estimates)`);
    if (!p.seeDollars) {
      lines.push(`NOTE: Dollar amounts have been stripped from this data. Do NOT mention any rates or totals.`);
    }
    lines.push(JSON.stringify(ctx.estimates, null, 0));
    lines.push('');
  }

  if (p.canForms && ctx.formTemplates) {
    lines.push(`## FORM TEMPLATES — ${ctx.companyName} only (Source: Forms)`);
    lines.push(JSON.stringify(ctx.formTemplates, null, 0));
    lines.push('');
    if (ctx.formSubmissions?.length) {
      lines.push(`## FORM SUBMISSIONS — ${ctx.companyName} only (Source: Forms)`);
      lines.push(JSON.stringify(ctx.formSubmissions, null, 0));
      lines.push('');
    }
  }

  if (p.canFiles && ctx.files) {
    lines.push(`## FILES — ${ctx.companyName} only (Source: Files)`);
    lines.push(JSON.stringify(ctx.files, null, 0));
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
      temperature: 0.4,
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

    // ── Audit log ─────────────────────────────────────────────────────────────
    const lastUserMsg = [...recentMessages].reverse().find((m) => m.role === 'user')?.content ?? '';
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
      supportMode: ctx.supportMode,
      supportCompanyName: ctx.supportMode ? ctx.companyName : undefined,
    });
  } catch (error) {
    console.error('POST /api/dazza/chat error:', error);
    res.status(500).json({ error: 'Failed to process chat' });
  }
}
