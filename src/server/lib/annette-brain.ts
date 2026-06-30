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

// ── Detect if a string is already a fully-formatted Dazza response ────────────
// tryContextHandler returns pre-formatted strings with section headers already
// embedded. We must NOT re-wrap them through formatDazzaAnswer.

function isPreFormattedAnswer(s: string): boolean {
  return (
    s.includes('📦 Source modules:') &&
    s.includes('📊 Confidence:')
  );
}

// ── Strip section headers from a pre-formatted answer to get raw portal data ──
// Used when we need to pass the data content (not the headers) to formatDazzaAnswer.

function extractPortalDataContent(s: string): string {
  // Remove the "📋 From IWILLBUILD data:\n" prefix if present
  const withoutHeader = s.replace(/^📋 From IWILLBUILD data:\n/, '');
  // Take only the content before the first section separator (📦 or 📊 or 💡 or ⚠️)
  const sectionBreak = withoutHeader.search(/\n\n(?:📦|📊|💡|⚠️)/);
  return sectionBreak >= 0 ? withoutHeader.slice(0, sectionBreak).trim() : withoutHeader.trim();
}

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

// ── Brain lookup — TF-IDF style scoring + category boost ─────────────────────

/** Stop words to exclude from scoring */
const STOP_WORDS = new Set([
  'the','a','an','and','or','but','in','on','at','to','for','of','with','by',
  'from','is','are','was','were','be','been','being','have','has','had','do',
  'does','did','will','would','could','should','may','might','can','this','that',
  'these','those','it','its','we','our','you','your','they','their','what','how',
  'when','where','who','which','why','not','no','yes','all','any','some','more',
  'most','also','just','about','up','out','if','so','as','into','than','then',
  'there','here','my','me','him','her','us','them','i','he','she','his','hers',
]);

/** Category keywords for boosting brain entries that match the question topic */
const CATEGORY_KEYWORDS: Record<string, RegExp> = {
  'Safety & WHS':  /whs|safety|hazard|risk|incident|swms|ppe|scaffold|height|confined|asbestos|silica|chemical|dangerous/i,
  'Estimating':    /estimate|quote|cost|price|rate|margin|markup|gst|labour|material|subcontract/i,
  'Fleet':         /fleet|vehicle|plant|prestart|service|rego|truck|excavator|asset/i,
  'Forms':         /form|checklist|induction|inspection|sign.?off|template/i,
  'Jobs':          /job|project|site|client|work.?order|schedule|supervisor|crew/i,
  'Compliance':    /legal|compliance|code|regulation|permit|licence|license|ncc|bca|standard/i,
  'General':       /.*/,
};

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
          LIMIT 100`
    ) as unknown as [BrainEntry[], unknown];

    if (!rows?.length) return null;

    // Tokenise question — remove stop words, keep meaningful terms
    const qTokens = lq
      .split(/\W+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

    if (qTokens.length === 0) return null;

    // Detect question category for boosting
    const qCategory = Object.entries(CATEGORY_KEYWORDS).find(([, re]) => re.test(question))?.[0] ?? 'General';

    let best: BrainEntry | null = null;
    let bestScore = 0;

    for (const entry of rows) {
      const titleTokens = entry.title.toLowerCase().split(/\W+/).filter((w) => w.length > 2 && !STOP_WORDS.has(w));
      const contentTokens = entry.content.toLowerCase().split(/\W+/).filter((w) => w.length > 2 && !STOP_WORDS.has(w)).slice(0, 80);

      // TF-IDF style: title matches worth 3x, content matches worth 1x
      let score = 0;
      for (const qt of qTokens) {
        const inTitle   = titleTokens.filter((t) => t === qt || t.startsWith(qt) || qt.startsWith(t)).length;
        const inContent = contentTokens.filter((t) => t === qt || t.startsWith(qt) || qt.startsWith(t)).length;
        score += inTitle * 3 + Math.min(inContent, 3); // cap content contribution
      }

      // Category boost: +4 if entry category matches question category
      if (entry.category === qCategory) score += 4;

      // Usage boost: popular entries get a small lift
      score += Math.min(entry.usage_count * 0.2, 2);

      if (score > bestScore) {
        bestScore = score;
        best = entry;
      }
    }

    // Require a meaningful match — at least 3 points (1 strong title hit or 3 content hits)
    return bestScore >= 3 ? best : null;
  } catch {
    return null;
  }
}

// ── Queue a hive pending entry (non-blocking) ─────────────────────────────────

/** Compute a simple Jaccard similarity between two strings (0–1) */
function jaccardSimilarity(a: string, b: string): number {
  const tokA = new Set(a.toLowerCase().split(/\W+/).filter((w) => w.length > 2 && !STOP_WORDS.has(w)));
  const tokB = new Set(b.toLowerCase().split(/\W+/).filter((w) => w.length > 2 && !STOP_WORDS.has(w)));
  if (tokA.size === 0 || tokB.size === 0) return 0;
  let intersection = 0;
  for (const t of tokA) { if (tokB.has(t)) intersection++; }
  return intersection / (tokA.size + tokB.size - intersection);
}

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
    // Semantic dedup: check recent pending entries for similarity
    const [existing] = await db.execute(
      sql`SELECT id, suggested_title, question FROM dazza_hive_pending
          WHERE company_id = ${companyId}
            AND status = 'pending'
          ORDER BY created_at DESC
          LIMIT 30`
    ) as unknown as [Array<{ id: number; suggested_title: string; question: string }>, unknown];

    if (existing?.length) {
      for (const row of existing) {
        // Exact title match
        if (row.suggested_title.toLowerCase() === suggestedTitle.toLowerCase()) return;
        // Semantic similarity > 0.6 — too similar, skip
        const titleSim = jaccardSimilarity(row.suggested_title, suggestedTitle);
        const questionSim = jaccardSimilarity(row.question, question);
        if (titleSim > 0.6 || questionSim > 0.7) return;
      }
    }

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

  // ── Resolve API key: company key takes priority over platform key ─────────
  let apiKey = getSecret('OPENAI_API_KEY'); // platform fallback
  try {
    const [keyRows] = await db.execute(
      sql`SELECT openai_api_key FROM company_settings WHERE company_id = ${companyId} LIMIT 1`
    ) as unknown as [Array<{ openai_api_key: string | null }>, unknown];
    const companyKey = keyRows?.[0]?.openai_api_key?.trim();
    if (companyKey) {
      apiKey = companyKey; // company key wins
    }
  } catch {
    // If lookup fails, fall back to platform key silently
  }

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
      // If the context handler already returned a fully-formatted answer, use it directly
      if (isPreFormattedAnswer(internalAnswer)) {
        const answer: InternalDazzaAnswer = {
          reply: internalAnswer,
          source: 'portal_data',
          modulesUsed,
          confidence: 'High',
          conflictDetected: false,
          hasVerificationReminder: needsVerificationReminder(question),
          hiveCandidate: false,
          localTool: false,
          tokens: 0,
          portalDataSection: extractPortalDataContent(internalAnswer),
        };
        void logInteraction(companyId, userId, question, answer.source, modulesUsed,
          answer.confidence, false, false, ctx.supportMode, ctx.supportCompanyId, 0);
        return answer;
      }
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
  const chatModule = await import('../api/dazza/chat/POST.js') as { buildSystemPrompt: (ctx: DazzaContext) => string };
  const systemPrompt = chatModule.buildSystemPrompt(ctx);

  // Build conversation history — last 12 turns for better multi-turn memory
  const recentMessages = messages.slice(-12);

  // ── Model selection: gpt-4o preferred, gpt-4o-mini as fallback ───────────
  // Use gpt-4o for complex questions (safety, estimates, multi-module)
  // Use gpt-4o-mini for simple portal lookups and short questions
  const isComplexQuestion = (
    /whs|safety|swms|ncc|compliance|legal|estimate|quote|cost|margin|markup|budget|profit|revenue/i.test(question) ||
    question.length > 120 ||
    modulesUsed.length >= 3 ||
    (internalSource === 'portal_data' && internalAnswer !== null && internalAnswer.length > 300)
  );
  const preferredModel = isComplexQuestion ? 'gpt-4o' : 'gpt-4o-mini';

  const payload = {
    model: preferredModel,
    messages: [
      { role: 'system', content: systemPrompt },
      ...recentMessages,
    ],
    max_tokens: isComplexQuestion ? 2000 : 1200,
    temperature: 0.2,
  };

  let openaiReply = '';
  let tokens = 0;
  let modelUsed = preferredModel;

  try {
    let openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    // ── gpt-4o model not available → fall back to gpt-4o-mini ────────────
    if (!openaiRes.ok && openaiRes.status === 404 && preferredModel === 'gpt-4o') {
      console.warn('[annette-brain] gpt-4o not available, falling back to gpt-4o-mini');
      modelUsed = 'gpt-4o-mini';
      openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ ...payload, model: 'gpt-4o-mini', max_tokens: 1400 }),
      });
    }

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.error('[annette-brain] OpenAI error:', openaiRes.status, errText);

      // ── 429 Rate limit / quota exceeded ──────────────────────────────────
      if (openaiRes.status === 429) {
        // If we have portal data, return it with a note that AI reasoning is unavailable
        if (internalAnswer) {
          if (isPreFormattedAnswer(internalAnswer)) {
            const fallback: InternalDazzaAnswer = {
              reply: internalAnswer,
              source: 'portal_data',
              modulesUsed,
              confidence: 'High',
              conflictDetected: false,
              hasVerificationReminder: needsVerificationReminder(question),
              hiveCandidate: false,
              localTool: false,
              tokens: 0,
              portalDataSection: extractPortalDataContent(internalAnswer),
            };
            return fallback;
          }
          const fallback: InternalDazzaAnswer = {
            reply: '',
            source: internalSource ?? 'portal_data',
            modulesUsed,
            confidence: 'Medium',
            confidenceReason: 'AI reasoning temporarily unavailable (rate limit) — portal data only',
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
        // No portal data either — return a clean user-facing message, not a 500
        const rateLimitAnswer: InternalDazzaAnswer = {
          reply: [
            `🧠 AI reasoning:\nDazza's AI is temporarily unavailable due to a rate limit on the OpenAI API. This usually resolves within a minute — please try again shortly.`,
            `📦 Source modules:\nNo portal data used.`,
            `📊 Confidence:\nLow — AI unavailable.`,
          ].join('\n\n'),
          source: 'no_key',
          modulesUsed: [],
          confidence: 'Low',
          conflictDetected: false,
          hasVerificationReminder: false,
          hiveCandidate: false,
          localTool: false,
          tokens: 0,
        };
        return rateLimitAnswer;
      }

      // ── Other OpenAI errors — fall back to internal answer if available ──
      if (internalAnswer) {
        if (isPreFormattedAnswer(internalAnswer)) {
          const fallback: InternalDazzaAnswer = {
            reply: internalAnswer,
            source: 'portal_data',
            modulesUsed,
            confidence: 'High',
            conflictDetected: false,
            hasVerificationReminder: needsVerificationReminder(question),
            hiveCandidate: false,
            localTool: false,
            tokens: 0,
            portalDataSection: extractPortalDataContent(internalAnswer),
          };
          return fallback;
        }
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
    const errMsg = String((e as Error)?.message ?? e);
    // 429 rate limit — never surface as a 500
    if (errMsg.includes('429')) {
      const rateLimitAnswer: InternalDazzaAnswer = {
        reply: [
          `🧠 AI reasoning:\nDazza's AI is temporarily unavailable due to a rate limit on the OpenAI API. This usually resolves within a minute — please try again shortly.`,
          `📦 Source modules:\nNo portal data used.`,
          `📊 Confidence:\nLow — AI unavailable.`,
        ].join('\n\n'),
        source: 'no_key',
        modulesUsed: [],
        confidence: 'Low',
        conflictDetected: false,
        hasVerificationReminder: false,
        hiveCandidate: false,
        localTool: false,
        tokens: 0,
      };
      return rateLimitAnswer;
    }
    if (internalAnswer) {
      if (isPreFormattedAnswer(internalAnswer)) {
        const fallback: InternalDazzaAnswer = {
          reply: internalAnswer,
          source: 'portal_data',
          modulesUsed,
          confidence: 'High',
          conflictDetected: false,
          hasVerificationReminder: needsVerificationReminder(question),
          hiveCandidate: false,
          localTool: false,
          tokens: 0,
          portalDataSection: extractPortalDataContent(internalAnswer),
        };
        return fallback;
      }
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
    // If pre-formatted, extract just the data content (strip section headers)
    finalPortalSection = isPreFormattedAnswer(internalAnswer)
      ? extractPortalDataContent(internalAnswer)
      : internalAnswer;
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
      // Replace OpenAI's portal section with our authoritative one (stripped of headers)
      const authoritativeContent = isPreFormattedAnswer(internalAnswer)
        ? extractPortalDataContent(internalAnswer)
        : internalAnswer;
      answer.reply = openaiReply.replace(
        parsed.portalDataSection,
        authoritativeContent,
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

  // Attach model used for debug/audit (non-blocking, best-effort)
  try {
    void db.execute(
      sql`UPDATE dazza_brain_interactions
          SET answer_source = CONCAT(${source}, ' [', ${modelUsed}, ']')
          WHERE company_id = ${companyId} AND user_id = ${userId}
          ORDER BY created_at DESC LIMIT 1`
    );
  } catch { /* non-blocking */ }

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
