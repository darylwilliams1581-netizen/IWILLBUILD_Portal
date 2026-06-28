/**
 * annette-brain.ts  —  Annette Core / Dazza Brain Service
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * THE LOOP (per question):
 *
 *   1. INTERNAL CHECK
 *      tryLocalTool()      → pure maths / GST / calculators  (no DB, no OpenAI)
 *      tryContextHandler() → portal data lookups              (DB, no OpenAI)
 *      tryBrainLookup()    → company-scoped brain entries     (DB, no OpenAI)
 *
 *   2. OPENAI REASONING  (only if API key exists)
 *      Sends system prompt + context + question to OpenAI.
 *      Parses the structured response sections.
 *
 *   3. COMPARE + CONFLICT DETECTION
 *      If both internal and OpenAI answers exist, compare them.
 *      Portal data ALWAYS wins on factual conflicts.
 *      Flag conflicts in the AI reasoning section.
 *
 *   4. RESULT  →  DazzaAnswer (structured, source-labelled)
 *
 *   5. HIVE UPDATE  (async, non-blocking)
 *      Useful interactions are queued as pending hive entries.
 *      Admins approve/reject via the Brain Status panel.
 *      NOTHING is auto-saved as approved knowledge.
 *
 * SECURITY GUARANTEES:
 *   - All queries scoped to effectiveCompanyId from session.
 *   - No cross-company data ever included.
 *   - seeDollars enforced before any financial data is included.
 *   - Brain entries are company-scoped — no global knowledge leakage.
 *   - Hive pending entries require explicit admin approval.
 *   - OpenAI is fully optional — all local tools work without it.
 */

import { db } from '../db/client.js';
import { sql } from 'drizzle-orm';
import { getSecret } from '#airo/secrets';
import type { DazzaContext } from './dazza-context.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type AnswerSource =
  | 'local_tool'       // pure maths / GST / calculator — no DB, no OpenAI
  | 'portal_data'      // IWILLBUILD DB lookup
  | 'brain_entry'      // approved company brain entry
  | 'openai'           // OpenAI reasoning
  | 'portal+openai'    // combined: portal data + OpenAI reasoning
  | 'brain+openai'     // combined: brain entry + OpenAI reasoning
  | 'no_key';          // OpenAI needed but key not configured

export type ConfidenceLevel = 'High' | 'Medium' | 'Low';

export interface DazzaAnswer {
  /** The full formatted reply to send to the user */
  reply: string;

  /** Primary source classification */
  source: AnswerSource;

  /** Which portal modules contributed data */
  modulesUsed: string[];

  /** Confidence level */
  confidence: ConfidenceLevel;
  confidenceReason?: string;

  /** Whether a conflict was detected between portal data and OpenAI */
  conflictDetected: boolean;
  conflictDetail?: string;

  /** Whether a verification reminder was included */
  hasVerificationReminder: boolean;

  /** Suggested next action (if any) */
  suggestedAction?: string;

  /** Whether this interaction is a candidate for hive learning */
  hiveCandidate: boolean;
  hiveSuggestedTitle?: string;
  hiveSuggestedContent?: string;
  hiveSuggestedCategory?: string;

  /** Token usage (OpenAI only) */
  tokens?: number;

  /** Whether this was answered locally (no OpenAI call) */
  localTool: boolean;
}

// ── Brain entry type (from dazza_brain_entries) ───────────────────────────────

interface BrainEntry {
  id: number;
  title: string;
  category: string;
  content: string;
  source_label: string | null;
  confidence: string | null;
  usage_count: number;
}

// ── Module list for source labelling ─────────────────────────────────────────

const ALL_MODULES = ['Jobs', 'Fleet', 'Forms', 'Estimates', 'Files', 'To-do', 'Progress', 'Safety', 'Storage', 'Billing', 'Company Knowledge'] as const;

// ── Detect which modules were actually used in a context ──────────────────────

export function detectModulesUsed(ctx: DazzaContext): string[] {
  const used: string[] = [];
  if (ctx.permissions.canJobs) {
    if (ctx.jobs?.length)         used.push('Jobs');
    if (ctx.openTodos?.length)    used.push('To-do');
    if (ctx.jobProgress?.length)  used.push('Progress');
  }
  if (ctx.permissions.canFleet && ctx.fleet?.length)           used.push('Fleet');
  if (ctx.permissions.canEstimating && ctx.estimates?.length)  used.push('Estimates');
  if (ctx.permissions.canForms && ctx.formTemplates?.length)   used.push('Forms');
  if (ctx.permissions.canFiles && ctx.files?.length)           used.push('Files');
  if (ctx.knowledgeEntries?.length)                            used.push('Company Knowledge');
  return used;
}

// ── Format a DazzaAnswer into the structured reply string ─────────────────────

export function formatDazzaAnswer(answer: DazzaAnswer): string {
  const sections: string[] = [];

  // 1. From IWILLBUILD data
  if (answer.portalDataSection) {
    sections.push(`📋 From IWILLBUILD data:\n${answer.portalDataSection}`);
  }

  // 2. AI reasoning
  if (answer.aiReasoningSection) {
    let reasoning = answer.aiReasoningSection;
    if (answer.conflictDetected && answer.conflictDetail) {
      reasoning += `\n\n⚡ **Conflict detected:** ${answer.conflictDetail}\nPortal data has been used as the authoritative source.`;
    }
    sections.push(`🧠 AI reasoning:\n${reasoning}`);
  }

  // 3. Source modules
  const moduleList = answer.modulesUsed.length > 0
    ? answer.modulesUsed.join(', ')
    : 'No portal data used — AI reasoning only.';
  sections.push(`📦 Source modules:\n${moduleList}`);

  // 4. Confidence
  let confidenceLine = answer.confidence;
  if (answer.confidenceReason) confidenceLine += ` — ${answer.confidenceReason}`;
  sections.push(`📊 Confidence:\n${confidenceLine}`);

  // 5. Suggested next action
  if (answer.suggestedAction) {
    sections.push(`💡 Suggested next action:\n${answer.suggestedAction}`);
  }

  // 6. Verification reminder
  if (answer.hasVerificationReminder) {
    sections.push(`⚠️ Verification reminder:\nPlease verify against current legislation, project documents, and a competent person.`);
  }

  return sections.join('\n\n');
}

// Extend DazzaAnswer with internal section fields (not sent to client directly)
declare module './annette-brain.js' {
  interface DazzaAnswer {
    portalDataSection?: string;
    aiReasoningSection?: string;
  }
}

// Use a plain extended type internally
interface InternalDazzaAnswer extends DazzaAnswer {
  portalDataSection?: string;
  aiReasoningSection?: string;
}

// ── Brain lookup — search approved brain entries for this company ──────────────

async function tryBrainLookup(
  question: string,
  companyId: number,
): Promise<BrainEntry | null> {
  try {
    const lq = question.toLowerCase();
    const [rows] = await db.execute(
      sql`SELECT id, title, category, content, source_label, confidence, usage_count
          FROM dazza_brain_entries
          WHERE company_id = ${companyId}
            AND approved = 1
            AND active = 1
          ORDER BY usage_count DESC, created_at DESC
          LIMIT 50`
    ) as unknown as [BrainEntry[], unknown];

    if (!rows?.length) return null;

    // Simple keyword match — find the best matching entry
    let best: BrainEntry | null = null;
    let bestScore = 0;

    for (const entry of rows) {
      const titleWords = entry.title.toLowerCase().split(/\s+/);
      const contentWords = entry.content.toLowerCase().split(/\s+/).slice(0, 30);
      const allWords = [...titleWords, ...contentWords];
      const score = allWords.filter((w) => w.length > 3 && lq.includes(w)).length;
      if (score > bestScore) {
        bestScore = score;
        best = entry;
      }
    }

    // Only return if we have a meaningful match (at least 2 keyword hits)
    return bestScore >= 2 ? best : null;
  } catch {
    return null;
  }
}

// ── Queue a hive pending entry (non-blocking) ─────────────────────────────────

async function queueHivePending(
  companyId: number,
  userId: string,
  question: string,
  suggestedTitle: string,
  suggestedContent: string,
  suggestedCategory: string,
  sourceType: string,
): Promise<void> {
  try {
    // Don't queue if a very similar pending entry already exists
    const [existing] = await db.execute(
      sql`SELECT id FROM dazza_hive_pending
          WHERE company_id = ${companyId}
            AND suggested_title = ${suggestedTitle}
            AND status = 'pending'
          LIMIT 1`
    ) as unknown as [Array<{ id: number }>, unknown];

    if (existing?.length) return; // already queued

    await db.execute(
      sql`INSERT INTO dazza_hive_pending
            (company_id, user_id, question, suggested_title, suggested_content, suggested_category, source_type, status)
          VALUES
            (${companyId}, ${userId}, ${question.slice(0, 500)}, ${suggestedTitle.slice(0, 255)},
             ${suggestedContent.slice(0, 2000)}, ${suggestedCategory.slice(0, 60)}, ${sourceType}, 'pending')`
    );
  } catch {
    // Hive queue failure must never block the response
  }
}

// ── Increment brain entry usage count (non-blocking) ─────────────────────────

async function incrementBrainUsage(entryId: number): Promise<void> {
  try {
    await db.execute(
      sql`UPDATE dazza_brain_entries SET usage_count = usage_count + 1, last_used_at = NOW() WHERE id = ${entryId}`
    );
  } catch { /* non-blocking */ }
}

// ── Log interaction (non-blocking) ───────────────────────────────────────────

async function logInteraction(
  companyId: number,
  userId: string,
  question: string,
  source: AnswerSource,
  modulesUsed: string[],
  confidence: ConfidenceLevel,
  conflictDetected: boolean,
  dollarsIncluded: boolean,
  supportMode: boolean,
  supportCompanyId: number | null,
  tokens: number,
): Promise<void> {
  try {
    await db.execute(
      sql`INSERT INTO dazza_brain_interactions
            (company_id, user_id, question_summary, answer_source, modules_used,
             confidence_level, conflict_detected, dollars_included,
             support_mode, support_company_id, tokens_used)
          VALUES
            (${companyId}, ${userId}, ${question.slice(0, 490)}, ${source},
             ${modulesUsed.join(',')}, ${confidence}, ${conflictDetected ? 1 : 0},
             ${dollarsIncluded ? 1 : 0}, ${supportMode ? 1 : 0}, ${supportCompanyId},
             ${tokens})`
    );
  } catch { /* non-blocking */ }
}

// ── Parse OpenAI structured response into sections ────────────────────────────

interface ParsedOpenAIResponse {
  portalDataSection?: string;
  aiReasoningSection?: string;
  sourceModules?: string;
  confidence?: string;
  confidenceReason?: string;
  suggestedAction?: string;
  verificationReminder?: string;
  rawReply: string;
}

function parseOpenAIResponse(reply: string): ParsedOpenAIResponse {
  const result: ParsedOpenAIResponse = { rawReply: reply };

  const sectionPatterns: Array<{ key: keyof ParsedOpenAIResponse; prefix: string }> = [
    { key: 'portalDataSection',  prefix: '📋 From IWILLBUILD data:' },
    { key: 'aiReasoningSection', prefix: '🧠 AI reasoning:' },
    { key: 'sourceModules',      prefix: '📦 Source modules:' },
    { key: 'confidence',         prefix: '📊 Confidence:' },
    { key: 'suggestedAction',    prefix: '💡 Suggested next action:' },
    { key: 'verificationReminder', prefix: '⚠️ Verification reminder:' },
  ];

  const lines = reply.split('\n');
  let currentKey: keyof ParsedOpenAIResponse | null = null;
  const sectionBodies: Partial<Record<keyof ParsedOpenAIResponse, string[]>> = {};

  for (const line of lines) {
    const trimmed = line.trimStart();
    const matched = sectionPatterns.find((p) => trimmed.startsWith(p.prefix));
    if (matched) {
      currentKey = matched.key;
      sectionBodies[currentKey] = [];
      const remainder = trimmed.slice(matched.prefix.length).trim();
      if (remainder) sectionBodies[currentKey]!.push(remainder);
    } else if (currentKey) {
      sectionBodies[currentKey]!.push(line);
    }
  }

  for (const [key, bodyLines] of Object.entries(sectionBodies)) {
    const body = (bodyLines as string[]).join('\n').trim();
    if (body) {
      (result as Record<string, unknown>)[key] = body;
    }
  }

  // Parse confidence level + reason from "High — because..."
  if (result.confidence) {
    const confMatch = result.confidence.match(/^(High|Medium|Low)\s*[—\-–]?\s*(.*)/i);
    if (confMatch) {
      result.confidence = confMatch[1] as ConfidenceLevel;
      if (confMatch[2]?.trim()) result.confidenceReason = confMatch[2].trim();
    }
  }

  return result;
}

// ── Detect if a question needs a verification reminder ───────────────────────

function needsVerificationReminder(question: string): boolean {
  return /whs|safety|compliance|legal|building code|ncc|legislation|regulation|permit|licence|license|asbestos|hazard|risk|incident|injury|emergency|medical|first aid|fire|electrical|scaffold|height|confined space|explosive|chemical|dangerous goods/i.test(question);
}

// ── Detect if an interaction is a good hive candidate ────────────────────────

function isHiveCandidate(
  question: string,
  source: AnswerSource,
  confidence: ConfidenceLevel,
): boolean {
  // Only queue OpenAI answers with medium/high confidence
  if (!['openai', 'portal+openai', 'brain+openai'].includes(source)) return false;
  if (confidence === 'Low') return false;
  // Skip simple maths / GST
  if (/^\d[\d\s\+\-\*\/\.]*$/.test(question.trim())) return false;
  if (/gst|add gst|remove gst/i.test(question) && question.length < 40) return false;
  return true;
}

// ── Main brain process function ───────────────────────────────────────────────

export async function processDazzaQuestion(
  question: string,
  ctx: DazzaContext,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  internalAnswer: string | null,   // from tryLocalTool or tryContextHandler
  internalSource: 'local_tool' | 'portal_data' | null,
): Promise<InternalDazzaAnswer> {

  const companyId = ctx.companyId;
  const userId = ctx.userId;
  const modulesUsed = detectModulesUsed(ctx);
  const apiKey = getSecret('OPENAI_API_KEY');

  // ── STEP 1: Check brain entries ───────────────────────────────────────────
  const brainEntry = await tryBrainLookup(question, ctx.companyId);

  // ── STEP 2: Determine if we have a complete internal answer ───────────────
  // A "complete" internal answer is one that fully answers the question
  // without needing OpenAI. Local tools (maths/GST) are always complete.
  // Portal data answers are complete for factual lookups.
  const hasCompleteInternal = internalSource === 'local_tool' ||
    (internalSource === 'portal_data' && internalAnswer !== null);

  // ── STEP 3: If no OpenAI key, return best internal answer ─────────────────
  if (!apiKey) {
    if (internalAnswer) {
      const isLocalTool = internalSource === 'local_tool';
      const answer: InternalDazzaAnswer = {
        reply: '',
        source: internalSource ?? 'portal_data',
        modulesUsed,
        confidence: isLocalTool ? 'High' : 'Medium',
        confidenceReason: isLocalTool ? undefined : 'Portal data only — no AI reasoning available (OpenAI key not configured)',
        conflictDetected: false,
        hasVerificationReminder: needsVerificationReminder(question),
        hiveCandidate: false,
        localTool: isLocalTool,
        tokens: 0,
        portalDataSection: internalSource === 'portal_data' ? internalAnswer : undefined,
        aiReasoningSection: internalSource === 'local_tool' ? internalAnswer : undefined,
      };
      answer.reply = formatDazzaAnswer(answer);

      void logInteraction(companyId, userId, question, answer.source, modulesUsed,
        answer.confidence, false, false, ctx.supportMode, ctx.supportCompanyId, 0);
      return answer;
    }

    if (brainEntry) {
      await incrementBrainUsage(brainEntry.id);
      const answer: InternalDazzaAnswer = {
        reply: '',
        source: 'brain_entry',
        modulesUsed,
        confidence: (brainEntry.confidence as ConfidenceLevel) ?? 'Medium',
        confidenceReason: `From approved company brain entry: "${brainEntry.title}"`,
        conflictDetected: false,
        hasVerificationReminder: needsVerificationReminder(question),
        hiveCandidate: false,
        localTool: false,
        tokens: 0,
        portalDataSection: `From company brain (${brainEntry.category}): **${brainEntry.title}**\n${brainEntry.content}`,
      };
      answer.reply = formatDazzaAnswer(answer);
      void logInteraction(companyId, userId, question, answer.source, modulesUsed,
        answer.confidence, false, false, ctx.supportMode, ctx.supportCompanyId, 0);
      return answer;
    }

    // No key, no internal answer — return a helpful message
    const noKeyAnswer: InternalDazzaAnswer = {
      reply: '',
      source: 'no_key',
      modulesUsed,
      confidence: 'Low',
      confidenceReason: 'OpenAI API key not configured — only portal lookups and calculators are available',
      conflictDetected: false,
      hasVerificationReminder: needsVerificationReminder(question),
      hiveCandidate: false,
      localTool: false,
      tokens: 0,
      aiReasoningSection: `I can answer portal lookups and calculators without an AI key, but this question needs general reasoning.\n\nAn Owner or Admin can add an OpenAI API key in **Settings → Dazza AI** to enable full AI responses.`,
    };
    noKeyAnswer.reply = formatDazzaAnswer(noKeyAnswer);
    return noKeyAnswer;
  }

  // ── STEP 4: Call OpenAI ───────────────────────────────────────────────────
  // Import buildSystemPrompt — lazy to avoid circular dep at module load time
  // (chat/POST.ts imports annette-brain.ts; annette-brain.ts imports chat/POST.ts)
  // Dynamic import is safe here because this function is always called at runtime.
  const chatModule = await import('../api/dazza/chat/POST.js') as { buildSystemPrompt: (ctx: DazzaContext) => string };
  const systemPrompt = chatModule.buildSystemPrompt(ctx);

  const recentMessages = messages.slice(-10);
  const payload = {
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      ...recentMessages,
    ],
    max_tokens: 1400,
    temperature: 0.25,
  };

  let openaiReply = '';
  let tokens = 0;

  try {
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
      console.error('[annette-brain] OpenAI error:', openaiRes.status, errText);
      // Fall back to internal answer if available
      if (internalAnswer) {
        const fallback: InternalDazzaAnswer = {
          reply: '',
          source: internalSource ?? 'portal_data',
          modulesUsed,
          confidence: 'Medium',
          confidenceReason: 'OpenAI unavailable — portal data only',
          conflictDetected: false,
          hasVerificationReminder: needsVerificationReminder(question),
          hiveCandidate: false,
          localTool: internalSource === 'local_tool',
          tokens: 0,
          portalDataSection: internalSource === 'portal_data' ? internalAnswer : undefined,
          aiReasoningSection: internalSource === 'local_tool' ? internalAnswer : undefined,
        };
        fallback.reply = formatDazzaAnswer(fallback);
        return fallback;
      }
      throw new Error(`OpenAI ${openaiRes.status}`);
    }

    const data = await openaiRes.json() as {
      choices: Array<{ message: { content: string } }>;
      usage?: { total_tokens: number };
    };
    openaiReply = data.choices?.[0]?.message?.content ?? '';
    tokens = data.usage?.total_tokens ?? 0;
  } catch (e) {
    if (internalAnswer) {
      const fallback: InternalDazzaAnswer = {
        reply: '',
        source: internalSource ?? 'portal_data',
        modulesUsed,
        confidence: 'Medium',
        confidenceReason: 'OpenAI error — portal data only',
        conflictDetected: false,
        hasVerificationReminder: needsVerificationReminder(question),
        hiveCandidate: false,
        localTool: internalSource === 'local_tool',
        tokens: 0,
        portalDataSection: internalSource === 'portal_data' ? internalAnswer : undefined,
        aiReasoningSection: internalSource === 'local_tool' ? internalAnswer : undefined,
      };
      fallback.reply = formatDazzaAnswer(fallback);
      return fallback;
    }
    throw e;
  }

  // ── STEP 5: Parse OpenAI response ─────────────────────────────────────────
  const parsed = parseOpenAIResponse(openaiReply);

  // ── STEP 6: Conflict detection ────────────────────────────────────────────
  let conflictDetected = false;
  let conflictDetail: string | undefined;

  if (internalAnswer && internalSource === 'portal_data' && parsed.portalDataSection) {
    // Check if OpenAI's portal data section contradicts our internal answer
    // Simple heuristic: if OpenAI says "no X" but we found X, flag it
    const internalLower = internalAnswer.toLowerCase();
    const openaiPortalLower = parsed.portalDataSection.toLowerCase();

    const internalHasData = !internalLower.includes('no ') && !internalLower.includes('none ') && !internalLower.includes('0 ');
    const openaiSaysNone = openaiPortalLower.includes('no ') || openaiPortalLower.includes('none ') || openaiPortalLower.includes('0 ');

    if (internalHasData && openaiSaysNone) {
      conflictDetected = true;
      conflictDetail = 'OpenAI suggested no data exists, but IWILLBUILD portal data was found. Portal data is used as the authoritative source.';
    }
  }

  // ── STEP 7: Determine final source + confidence ───────────────────────────
  let source: AnswerSource;
  let confidence: ConfidenceLevel;
  let confidenceReason: string | undefined;

  if (internalSource === 'local_tool') {
    source = 'local_tool';
    confidence = 'High';
  } else if (internalSource === 'portal_data' && parsed.aiReasoningSection) {
    source = 'portal+openai';
    confidence = 'High';
  } else if (brainEntry && parsed.aiReasoningSection) {
    source = 'brain+openai';
    confidence = 'Medium';
    confidenceReason = `Brain entry "${brainEntry.title}" + AI reasoning`;
  } else if (parsed.aiReasoningSection || parsed.portalDataSection) {
    source = 'openai';
    confidence = (parsed.confidence as ConfidenceLevel) ?? 'Medium';
    confidenceReason = parsed.confidenceReason;
  } else {
    source = 'openai';
    confidence = 'Low';
    confidenceReason = 'Response could not be parsed into structured sections';
  }

  // ── STEP 8: Build final portal data section ───────────────────────────────
  // Portal data from our internal check takes precedence over OpenAI's version
  let finalPortalSection: string | undefined;
  if (internalSource === 'portal_data' && internalAnswer) {
    finalPortalSection = internalAnswer;
  } else if (parsed.portalDataSection) {
    finalPortalSection = parsed.portalDataSection;
  }

  // Brain entry gets prepended to portal section if used
  if (brainEntry) {
    await incrementBrainUsage(brainEntry.id);
    const brainNote = `From company brain (${brainEntry.category}): **${brainEntry.title}**\n${brainEntry.content}`;
    finalPortalSection = finalPortalSection
      ? `${brainNote}\n\n${finalPortalSection}`
      : brainNote;
  }

  // ── STEP 9: Assemble final answer ─────────────────────────────────────────
  const hasVerification = needsVerificationReminder(question) ||
    !!parsed.verificationReminder ||
    (parsed.aiReasoningSection ?? '').toLowerCase().includes('verify') ||
    (parsed.aiReasoningSection ?? '').toLowerCase().includes('legislation');

  const hiveCandidate = isHiveCandidate(question, source, confidence);

  const answer: InternalDazzaAnswer = {
    reply: '',
    source,
    modulesUsed,
    confidence,
    confidenceReason,
    conflictDetected,
    conflictDetail,
    hasVerificationReminder: hasVerification,
    suggestedAction: parsed.suggestedAction,
    hiveCandidate,
    localTool: source === 'local_tool',
    tokens,
    portalDataSection: finalPortalSection,
    aiReasoningSection: internalSource === 'local_tool'
      ? internalAnswer ?? parsed.aiReasoningSection
      : parsed.aiReasoningSection,
  };

  // If OpenAI returned a fully-formed structured reply, use it directly
  // (it already has all sections formatted correctly)
  const openaiHasStructure = openaiReply.includes('📋 From IWILLBUILD data:') ||
    openaiReply.includes('🧠 AI reasoning:') ||
    openaiReply.includes('📦 Source modules:');

  if (openaiHasStructure && !conflictDetected) {
    // Use OpenAI's formatted reply but override portal data section with our authoritative version
    if (internalSource === 'portal_data' && internalAnswer && parsed.portalDataSection) {
      // Replace OpenAI's portal section with our authoritative one
      answer.reply = openaiReply.replace(
        parsed.portalDataSection,
        internalAnswer,
      );
    } else {
      answer.reply = openaiReply;
    }
  } else {
    // Build from our parsed sections
    answer.reply = formatDazzaAnswer(answer);
  }

  // ── STEP 10: Queue hive candidate (non-blocking) ──────────────────────────
  if (hiveCandidate && parsed.aiReasoningSection && parsed.aiReasoningSection.length > 50) {
    const suggestedTitle = question.length > 80 ? question.slice(0, 77) + '...' : question;
    const suggestedContent = parsed.aiReasoningSection.slice(0, 1500);
    const suggestedCategory = detectCategory(question);

    void queueHivePending(
      companyId, userId, question,
      suggestedTitle, suggestedContent, suggestedCategory,
      source,
    );

    answer.hiveSuggestedTitle = suggestedTitle;
    answer.hiveSuggestedContent = suggestedContent;
    answer.hiveSuggestedCategory = suggestedCategory;
  }

  // ── STEP 11: Log interaction (non-blocking) ───────────────────────────────
  const dollarsIncluded = ctx.permissions.seeDollars && modulesUsed.includes('Estimates');
  void logInteraction(
    companyId, userId, question, source, modulesUsed,
    confidence, conflictDetected, dollarsIncluded,
    ctx.supportMode, ctx.supportCompanyId, tokens,
  );

  return answer;
}

// ── Category detector for hive entries ───────────────────────────────────────

function detectCategory(question: string): string {
  const q = question.toLowerCase();
  if (/whs|safety|hazard|risk|incident|swms|ppe|scaffold/i.test(q)) return 'Safety & WHS';
  if (/estimate|quote|cost|price|rate|margin|gst/i.test(q)) return 'Estimating';
  if (/fleet|vehicle|plant|prestart|service|rego/i.test(q)) return 'Fleet';
  if (/form|checklist|induction|inspection/i.test(q)) return 'Forms';
  if (/job|project|site|client/i.test(q)) return 'Jobs';
  if (/legal|compliance|code|regulation|permit|licence/i.test(q)) return 'Compliance';
  return 'General';
}

// ── Brain status summary (for admin panel) ────────────────────────────────────

export async function getBrainStatus(companyId: number): Promise<{
  totalEntries: number;
  pendingHive: number;
  totalInteractions: number;
  recentInteractions: Array<{
    question_summary: string;
    answer_source: string;
    confidence_level: string;
    conflict_detected: boolean;
    tokens_used: number;
    created_at: string;
  }>;
  topEntries: Array<{
    id: number;
    title: string;
    category: string;
    usage_count: number;
    confidence: string | null;
  }>;
  pendingEntries: Array<{
    id: number;
    question: string;
    suggested_title: string;
    suggested_category: string;
    source_type: string;
    created_at: string;
  }>;
}> {
  const safeCount = async (q: ReturnType<typeof sql>): Promise<number> => {
    try {
      const [rows] = await db.execute(q) as unknown as [Array<{ cnt: number | string }>, unknown];
      return Number(rows?.[0]?.cnt ?? 0);
    } catch { return 0; }
  };

  const [totalEntries, pendingHive, totalInteractions] = await Promise.all([
    safeCount(sql`SELECT COUNT(*) as cnt FROM dazza_brain_entries WHERE company_id = ${companyId} AND approved = 1 AND active = 1`),
    safeCount(sql`SELECT COUNT(*) as cnt FROM dazza_hive_pending WHERE company_id = ${companyId} AND status = 'pending'`),
    safeCount(sql`SELECT COUNT(*) as cnt FROM dazza_brain_interactions WHERE company_id = ${companyId}`),
  ]);

  let recentInteractions: Array<{
    question_summary: string; answer_source: string; confidence_level: string;
    conflict_detected: boolean; tokens_used: number; created_at: string;
  }> = [];
  try {
    const [rows] = await db.execute(
      sql`SELECT question_summary, answer_source, confidence_level, conflict_detected, tokens_used, created_at
          FROM dazza_brain_interactions
          WHERE company_id = ${companyId}
          ORDER BY created_at DESC LIMIT 20`
    ) as unknown as [typeof recentInteractions, unknown];
    recentInteractions = rows ?? [];
  } catch { /* non-blocking */ }

  let topEntries: Array<{ id: number; title: string; category: string; usage_count: number; confidence: string | null }> = [];
  try {
    const [rows] = await db.execute(
      sql`SELECT id, title, category, usage_count, confidence
          FROM dazza_brain_entries
          WHERE company_id = ${companyId} AND approved = 1 AND active = 1
          ORDER BY usage_count DESC LIMIT 10`
    ) as unknown as [typeof topEntries, unknown];
    topEntries = rows ?? [];
  } catch { /* non-blocking */ }

  let pendingEntries: Array<{
    id: number; question: string; suggested_title: string;
    suggested_category: string; source_type: string; created_at: string;
  }> = [];
  try {
    const [rows] = await db.execute(
      sql`SELECT id, question, suggested_title, suggested_category, source_type, created_at
          FROM dazza_hive_pending
          WHERE company_id = ${companyId} AND status = 'pending'
          ORDER BY created_at DESC LIMIT 50`
    ) as unknown as [typeof pendingEntries, unknown];
    pendingEntries = rows ?? [];
  } catch { /* non-blocking */ }

  return { totalEntries, pendingHive, totalInteractions, recentInteractions, topEntries, pendingEntries };
}
