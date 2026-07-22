/**
 * drayl/drayl.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Drayl Engine — Dazza AI chat orchestrator.
 * Sourced from docs/drayl.ts (uploaded 2026-07-02).
 *
 * Answer priority:
 *   A. Stateless local tools (instant, no context needed)
 *   B. Load permitted IWILLBUILD context
 *   C. Context local tools (fast portal facts)
 *   D. Quick urgent / problems today
 *   E. Annette health check (full brain check)
 *   F. Safety / compliance questions
 *   G. General question with OpenAI
 *   H. No OpenAI key fallback
 */

import { loadDazzaContext } from './context.js';
import { formatAnnetteReply, formatContextAnswer, COMPLIANCE_NOTE } from './format.js';
import { dazzaOpening, DAZZA_SMART_FOLLOW_UPS } from './persona.js';
import {
  isCrossCompanyDataRequest,
  isHealthCheckIntent,
  tryContextLocalTool,
  tryStatelessLocalTool,
  isQuickUrgentIntent,
} from './localTools.js';
import { explainWithOpenAI } from './openai.js';
import { runAnnetteHealthCheck } from './annette.js';
import type { AnnetteFinding, DazzaChatInput, DazzaChatResponse, ModuleName } from './types.js';

export { DAZZA_SMART_FOLLOW_UPS };

function refusal(reply: string, sources: ModuleName[] = []): DazzaChatResponse {
  return {
    reply,
    mode: "refusal",
    findings: [],
    sources,
    warnings: [],
    usedOpenAI: false
  };
}

function likelyNeedsPortalData(message: string): boolean {
  const lower = message.toLowerCase();
  return [
    "job", "jobs", "fleet", "prestart", "form", "forms",
    "estimate", "quote", "file", "photo", "safety", "swms",
    "todo", "to-do", "portal", "iwillbuild", "overdue", "ending", "due"
  ].some((word) => lower.includes(word));
}

function sourcesFromContextQuestion(message: string): ModuleName[] {
  const lower = message.toLowerCase();
  const sources: ModuleName[] = [];
  if (lower.includes("job") || lower.includes("todo") || lower.includes("to-do")) sources.push("Jobs", "JobTodos");
  if (lower.includes("fleet") || lower.includes("prestart") || lower.includes("asset") || lower.includes("rego") || lower.includes("service")) sources.push("Fleet", "FleetPrestarts");
  if (lower.includes("form")) sources.push("Forms");
  if (lower.includes("estimate") || lower.includes("quote") || lower.includes("markup")) sources.push("Estimates");
  if (lower.includes("file") || lower.includes("photo")) sources.push("Files");
  if (lower.includes("safety") || lower.includes("swms") || lower.includes("whs")) sources.push("Safety");
  return Array.from(new Set(sources.length ? sources : ["Jobs", "Fleet", "Forms"]));
}

function safetyOrComplianceQuestion(message: string): boolean {
  const lower = message.toLowerCase();
  return ["whs compliant", "compliant", "legal", "building code", "safety decision", "safe to", "certify"].some((phrase) => lower.includes(phrase));
}

function buildNoOpenAiFallback(message: string, warnings: string[]): string {
  const lines = [
    dazzaOpening(true),
    "",
    "From IWILLBUILD data:",
    "- I loaded your permitted company context, but this question needs a bit more explanation or drafting than the local tools can do.",
    "- OpenAI is not configured on the server, so I won't invent an answer.",
    "",
    "Recommended next actions:",
    "1. Try a quick one: 'How many jobs?', 'Last prestart?', or 'What needs attention?' — these work instantly without OpenAI.",
    "2. Ask for a health check or run Annette — still works great with no AI key.",
    "3. Get the server admin to add OPENAI_API_KEY if you want full explanations and drafting.",
    "",
    `Question received: ${message}`,
    "",
    COMPLIANCE_NOTE
  ];

  if (warnings.length > 0) {
    lines.splice(3, 0, "", "Module warnings:", ...warnings.map((warning) => `- ${warning}`));
  }

  return lines.join("\n");
}

export async function handleDazzaChat(input: DazzaChatInput): Promise<DazzaChatResponse> {
  const trimmedMessage = input.message.trim();

  if (!trimmedMessage) {
    return refusal("Righto — ask Dazza about IWILLBUILD jobs, fleet, forms, estimates, files, safety, simple maths, GST, or say 'Run Annette' for a health check.");
  }

  if (isCrossCompanyDataRequest(trimmedMessage)) {
    return refusal(
      "I can't show data from another company, mate. Dazza is strictly company-scoped to your current IWILLBUILD login."
    );
  }

  // A. Stateless local tools first (instant, no context load needed)
  const stateless = tryStatelessLocalTool(trimmedMessage, input.gstRate);
  if (stateless) return stateless;

  // B. Load permitted IWILLBUILD context (every module is independently guarded)
  const context = input.context ?? await loadDazzaContext(input.user, input.adapter);

  // C. Context local tools (fast portal facts)
  const contextTool = tryContextLocalTool(trimmedMessage, context);
  if (contextTool) return contextTool;

  // D. Quick urgent / problems today (smart local summary without full Annette)
  if (isQuickUrgentIntent(trimmedMessage)) {
    const overdueTodos = context.modules.jobTodos.data.filter((t: Record<string, unknown>) => {
      const status = String(t.status ?? '').toLowerCase();
      const dueDate = String(t.dueDate ?? t.due_date ?? '');
      return !["done","complete","completed"].includes(status) && dueDate && new Date(dueDate) < new Date();
    }).length;
    const overdueService = context.modules.fleet.data.filter((a: Record<string, unknown>) => {
      const svcDate = String(a.nextServiceDate ?? a.service_date ?? '');
      return svcDate && new Date(svcDate) < new Date();
    }).length;
    const highRiskNoSwms = context.modules.jobs.data.filter((j: Record<string, unknown>) => {
      const isHighRisk = j.highRisk || String(j.riskLevel ?? '').toLowerCase().includes("high");
      const hasSwms = context.modules.safety.data.some((s: Record<string, unknown>) => {
        const sJobId = s.jobId ?? s.job_id;
        return sJobId === j.id && String(s.type ?? s.template_name ?? '').toLowerCase().includes("swms");
      });
      return isHighRisk && !hasSwms;
    }).length;

    const reply = `${dazzaOpening(true)}\n\nFrom IWILLBUILD data (quick urgent scan):\n- Overdue to-dos: ${overdueTodos}\n- Fleet service overdue: ${overdueService}\n- High-risk jobs possibly missing SWMS: ${highRiskNoSwms}\n\nSource: JobTodos + Fleet + Safety (quick scan)\n\nRecommended: Say "Run Annette Health Check" for the full detailed brain check with actions.`;
    return {
      reply,
      mode: "context",
      findings: [],
      sources: ["JobTodos", "Fleet", "Safety"],
      warnings: context.warnings,
      usedOpenAI: false
    };
  }

  // E. Annette health check intents (the smart brain check)
  if (isHealthCheckIntent(trimmedMessage)) {
    const findings = runAnnetteHealthCheck(context);
    let aiGuidance = "";
    let usedOpenAI = false;
    const openAiWarnings: string[] = [];

    if (input.openAiApiKey) {
      try {
        aiGuidance = await explainWithOpenAI({
          apiKey: input.openAiApiKey,
          model: input.openAiModel,
          userMessage: trimmedMessage,
          context,
          findings
        });
        usedOpenAI = Boolean(aiGuidance.trim());
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        openAiWarnings.push(`Module warning: OpenAI explanation could not be loaded. ${message}`);
      }
    }

    const reply = formatAnnetteReply({
      findings,
      context,
      aiGuidance,
      includeGeneralGuidance: usedOpenAI
    });

    const sources = Array.from(new Set(findings.map((finding) => finding.module)));
    return {
      reply,
      mode: "annette",
      findings,
      sources,
      warnings: [...context.warnings, ...openAiWarnings],
      usedOpenAI
    };
  }

  // F. Safety / compliance questions — never give false certainty
  if (safetyOrComplianceQuestion(trimmedMessage)) {
    const findings: AnnetteFinding[] = runAnnetteHealthCheck(context).filter((finding) => finding.module === "Safety");
    const safetySummary = findings.length
      ? formatAnnetteReply({ findings, context })
      : formatContextAnswer({
          context,
          sources: ["Safety"],
          answer: "- I can check whether safety/SWMS data exists in IWILLBUILD, but I can't certify WHS, legal, building code or safety compliance. That's for a competent person on site."
        });
    return {
      reply: safetySummary,
      mode: "annette",
      findings,
      sources: ["Safety"],
      warnings: context.warnings,
      usedOpenAI: false
    };
  }

  // G. General Dazza question — internal data still wins; AI only explains or drafts
  if (input.openAiApiKey) {
    let aiGuidance = "";
    const warnings = [...context.warnings];
    try {
      aiGuidance = await explainWithOpenAI({
        apiKey: input.openAiApiKey,
        model: input.openAiModel,
        userMessage: trimmedMessage,
        context
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Module warning: OpenAI explanation could not be loaded. ${message}`);
    }

    const sources = sourcesFromContextQuestion(trimmedMessage);
    const answer = likelyNeedsPortalData(trimmedMessage)
      ? "- Dazza loaded your permitted IWILLBUILD context first. Any portal facts must come from the listed source modules."
      : "- This looks like general guidance rather than a direct portal-data request. I've kept it practical.";

    return {
      reply: formatContextAnswer({ context, answer, sources, aiGuidance }),
      mode: aiGuidance ? "ai" : "context",
      findings: [],
      sources,
      warnings,
      usedOpenAI: Boolean(aiGuidance)
    };
  }

  // H. No OpenAI key fallback — still useful
  return {
    reply: buildNoOpenAiFallback(trimmedMessage, context.warnings),
    mode: "context",
    findings: [],
    sources: sourcesFromContextQuestion(trimmedMessage),
    warnings: context.warnings,
    usedOpenAI: false
  };
}
