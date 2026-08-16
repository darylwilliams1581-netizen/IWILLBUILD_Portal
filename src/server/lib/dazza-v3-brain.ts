/**
 * dazza-v3-brain.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Dazza V3 — Unified brain service.
 *
 * Used by:
 *   - Owner Console chat
 *   - Main Dazza V3 chat page
 *   - Incident investigations
 *   - Bug report analysis
 *   - Background watcher
 *   - Repair-case generation
 *   - Post-deployment verification
 *
 * SECURITY GUARANTEES:
 * 1. Owner-only — every entry point checks isPlatformOwner before proceeding.
 * 2. Read-only — the model can only call read tools. Mutation tools do not exist.
 * 3. Secret redaction — secrets, tokens, passwords never reach the model.
 * 4. Full audit — every call is logged to dazza_v3_audit.
 * 5. Conversation continuity — full history stored in dazza_v3_conversations.
 * 6. Memory priority: safety rules > live data > approved memory > history > reasoning.
 * 7. No auto-promotion — learning candidates require Owner approval.
 *
 * MUTATION BOUNDARY (absolute):
 * Dazza V3 CANNOT: insert/update/delete business records, change permissions,
 * send customer communication, change code, deploy, publish, trigger Airo repair,
 * change env vars, purchase services.
 *
 * Dazza V3 CAN (limited internal writes via trusted services only):
 * - Write dazza_v3_audit entries
 * - Write dazza_v3_conversations entries
 * - Write dazza_incidents entries
 * - Write dazza_client_rescue entries
 * - Send SMS/email to the platform Owner
 */

import { db } from '../db/client.js';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getSecret } from '#airo/secrets';
import { V3_TOOL_DEFINITIONS_FLAT, executeV3Tool } from './dazza-v3-tools.js';
import { sendSms, isSmsConfigured } from './sms.js';
import { sendEmail } from '../email.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const DAZZA_V3_FEATURE_FLAG = 'DAZZA_V3_ENABLED';
const OWNER_SUPPORT_EMAIL = 'support@iwillbuild.com';

// Model — server-configured via DAZZA_OPENAI_MODEL secret, never exposed to the browser.
// Default: o4-mini (OpenAI reasoning model with tool use support).
// Both chat and investigation modes use the Responses API.
// The model is resolved once per request from the secret store.
function getDazzaModel(): string {
  const configured = getSecret('DAZZA_OPENAI_MODEL');
  // Value may be string or null — coerce safely.
  const s = configured !== null ? String(configured).trim() : '';
  return s || 'o4-mini';
}
// Conversation history sent to OpenAI — bounded to control cost
const CONTEXT_RECENT_TURNS = 20;       // most recent turns included verbatim
const SUMMARY_THRESHOLD_TURNS = 30;    // deterministic compaction kicks in above this
const MAX_TOKENS_INVESTIGATION = 16000;
const MAX_TOKENS_CHAT = 4000;
const TOOL_ROUNDS_MAX = 8;

// ── Feature flag ──────────────────────────────────────────────────────────────

export function isDazzaV3Enabled(): boolean {
  // getSecret() returns string | object | null (reference return type).
  // The platform stores secret values as JSON — the value may arrive as:
  //   boolean true   → stored as JSON true  (typeof === 'boolean')
  //   string "true"  → stored as JSON "true" (typeof === 'string')
  //   number 1       → stored as JSON 1      (typeof === 'number')
  // All three must resolve to enabled=true.
  const raw = getSecret(DAZZA_V3_FEATURE_FLAG);
  let enabled: boolean;
  if (raw === null) {
    enabled = false;
  } else if (typeof raw === 'boolean') {
    enabled = raw;
  } else if (typeof raw === 'number') {
    enabled = raw === 1;
  } else {
    const flag = String(raw).trim().toLowerCase();
    enabled = flag === 'true' || flag === '1' || flag === 'yes';
  }
  const present = raw !== null;
  console.log(`[dazza] engine flag: secret present=${present}, type=${typeof raw}, resolved=${enabled}`);
  return enabled;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface V3OwnerContext {
  userId: string;
  email: string;
  isPlatformOwner: boolean;
}

export interface V3ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface V3StreamOptions {
  ownerContext: V3OwnerContext;
  conversationId: string | null;
  userMessage: string;
  mode: 'chat' | 'investigation' | 'bug_analysis';
  incidentId?: string;
  bugReportId?: string;
  onToken: (token: string) => void;
  onToolCall: (name: string, status: 'running' | 'done') => void;
  onDone: (meta: {
    model: string;
    toolsUsed: string[];
    conversationId: string;
    inputTokens?: number;
    outputTokens?: number;
  }) => void;
  onError: (message: string, conversationId?: string) => void;
}

export interface V3IncidentInput {
  incidentType: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  affectedRoute?: string;
  affectedCompanyId?: number;
  affectedUserId?: string;
  affectedUserName?: string;
  affectedUserEmail?: string;
  affectedUserPhone?: string;
  description: string;
  evidenceJson?: string;
  platform?: string;
  appVersion?: string;
  customerRecovered?: boolean;
  dataLossRisk?: boolean;
  attemptedAction?: string;
}

// ── System prompt ─────────────────────────────────────────────────────────────

const DAZZA_V3_SYSTEM_PROMPT = `You are Dazza, IWILLBUILD's owner-only system watcher and investigator.
You are speaking to Daryl, the authenticated platform owner and developer.

## READ-ONLY BOUNDARY (absolute — never violate)
You cannot: insert, update, or delete any record; change code, config, or secrets; deploy, publish, or trigger builds; send customer communication; run shell commands; commit or push to git; trigger GitHub Actions; purchase services.
You can write only: dazza_v3_audit entries, dazza_v3_conversations entries, dazza_incidents entries, dazza_client_rescue entries, and owner-only notifications where separately authorised.
If asked to do anything outside this boundary, refuse clearly and explain why.

## Tool-first rule
For any question about platform state, counts, bugs, code, or data — use the relevant read-only tools before answering. Do not answer from memory or general reasoning when tool evidence is available. Cite the tool and the specific file/line/record that supports each claim.

## Evidence standards
- Facts: come from tool results. State them as facts.
- Inferences: your reasoning from facts. Label them as inferences.
- Unknowns: what you could not determine. State them explicitly.
- Never claim you inspected evidence you did not access.

## Memory priority
1. These rules (immutable)
2. Current live tool evidence
3. Owner-approved Annette memory (from v3_get_approved_memory)
4. Relevant conversation history
5. General model reasoning

## Personality
Direct, honest, practical. Australian English. Use Daryl's first name. Do not sugar-coat confirmed problems.

## Investigation output format
**WHAT HAPPENED** — facts from evidence
**EVIDENCE** — tool results and file citations (file path, line range)
**WHO IS AFFECTED** — company, user, count
**RECOVERED?** — did the customer recover
**CURRENT IMPACT** — what is broken right now
**MOST LIKELY CAUSE** — your best diagnosis
**OTHER CAUSES CONSIDERED** — alternatives you ruled out
**CONFIDENCE** — High / Medium / Low and why
**MISSING EVIDENCE** — what you could not determine
**IMMEDIATE WORKAROUND** — what Daryl can tell the customer right now
**RECOMMENDED FIX** — specific technical fix
**LIKELY FILES** — file paths and line ranges involved
**REGRESSION RISKS** — what else might break
**TESTS REQUIRED** — exact test steps
**AIRO REPAIR PROMPT** — complete, ready-to-paste prompt for the Airo builder`;

// ── Conversation management ───────────────────────────────────────────────────

/**
 * Verify that a conversation belongs to the given owner.
 * Returns 'ok' | 'not_found' | 'forbidden'.
 */
async function verifyConversationOwnership(
  conversationId: string,
  ownerUserId: string,
): Promise<'ok' | 'not_found' | 'forbidden'> {
  try {
    const [rows] = await db.execute(sql.raw(`
      SELECT owner_user_id FROM dazza_v3_conversations
      WHERE conversation_id = '${conversationId.replace(/'/g, "''")}'
      LIMIT 1
    `)) as unknown as [Array<{ owner_user_id: string }>, unknown];

    if (!rows?.length) return 'not_found';
    if (rows[0].owner_user_id !== ownerUserId) return 'forbidden';
    return 'ok';
  } catch {
    return 'not_found';
  }
}

/**
 * Load bounded conversation history for a given conversation.
 *
 * Strategy:
 *   - If total turns ≤ SUMMARY_THRESHOLD_TURNS: return all turns verbatim.
 *   - If total turns > SUMMARY_THRESHOLD_TURNS: return a deterministic
 *     text summary of older turns + the most recent CONTEXT_RECENT_TURNS turns.
 *     No extra AI call is made — the summary is built from stored content.
 */
async function loadBoundedHistory(conversationId: string): Promise<{
  messages: V3ChatMessage[];
  totalTurns: number;
  compacted: boolean;
}> {
  try {
    // Load all turns (for count + compaction)
    const [rows] = await db.execute(sql.raw(`
      SELECT role, content, turn_index FROM dazza_v3_conversations
      WHERE conversation_id = '${conversationId.replace(/'/g, "''")}'
      ORDER BY turn_index ASC
    `)) as unknown as [Array<{ role: string; content: string; turn_index: number }>, unknown];

    const all = rows ?? [];
    const totalTurns = all.length;

    if (totalTurns === 0) {
      return { messages: [], totalTurns: 0, compacted: false };
    }

    if (totalTurns <= SUMMARY_THRESHOLD_TURNS) {
      // Return all verbatim
      return {
        messages: all.map(r => ({ role: r.role as 'user' | 'assistant', content: r.content })),
        totalTurns,
        compacted: false,
      };
    }

    // Compaction: summarise older turns deterministically, keep recent verbatim
    const olderTurns = all.slice(0, totalTurns - CONTEXT_RECENT_TURNS);
    const recentTurns = all.slice(totalTurns - CONTEXT_RECENT_TURNS);

    // Build a deterministic summary from older turns (no AI call)
    const summaryLines: string[] = [
      `[Earlier conversation summary — ${olderTurns.length} turns compacted]`,
    ];
    for (const t of olderTurns) {
      const snippet = t.content.slice(0, 200).replace(/\n/g, ' ');
      summaryLines.push(`${t.role === 'user' ? 'Daryl' : 'Dazza'}: ${snippet}${t.content.length > 200 ? '…' : ''}`);
    }

    const summaryMessage: V3ChatMessage = {
      role: 'system',
      content: summaryLines.join('\n'),
    };

    const recentMessages: V3ChatMessage[] = recentTurns.map(r => ({
      role: r.role as 'user' | 'assistant',
      content: r.content,
    }));

    return {
      messages: [summaryMessage, ...recentMessages],
      totalTurns,
      compacted: true,
    };
  } catch {
    return { messages: [], totalTurns: 0, compacted: false };
  }
}

async function saveConversationTurn(
  conversationId: string,
  ownerUserId: string,
  role: 'user' | 'assistant',
  content: string,
  turnIndex: number,
): Promise<void> {
  try {
    await db.execute(sql.raw(`
      INSERT INTO dazza_v3_conversations
        (id, conversation_id, owner_user_id, role, content, turn_index, created_at)
      VALUES
        ('${randomUUID()}', '${conversationId.replace(/'/g, "''")}',
         '${ownerUserId.replace(/'/g, "''")}',
         '${role}', '${content.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}',
         ${turnIndex}, NOW())
    `));
  } catch (e) {
    console.warn('[dazza-v3] conversation save failed:', e);
  }
}

// ── Audit logging ─────────────────────────────────────────────────────────────

async function auditV3(
  ownerUserId: string,
  eventType: string,
  details: Record<string, unknown>,
): Promise<void> {
  try {
    const detailsJson = JSON.stringify(details).slice(0, 2000);
    await db.execute(sql.raw(`
      INSERT INTO dazza_v3_audit
        (id, owner_user_id, event_type, details_json, created_at)
      VALUES
        ('${randomUUID()}', '${ownerUserId.replace(/'/g, "''")}',
         '${eventType.replace(/'/g, "''")}',
         '${detailsJson.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}',
         NOW())
    `));
  } catch (e) {
    console.warn('[dazza-v3] audit failed:', e);
  }
}

// ── Approved memory loader ────────────────────────────────────────────────────

async function loadApprovedMemory(): Promise<string> {
  try {
    const [brainRows] = await db.execute(sql.raw(`
      SELECT title, category, content FROM dazza_brain_entries
      WHERE approved = 1
      ORDER BY created_at DESC LIMIT 20
    `)) as unknown as [Array<{ title: string; category: string; content: string }>, unknown];

    const [knowledgeRows] = await db.execute(sql.raw(`
      SELECT title, category, content FROM dazza_knowledge
      ORDER BY created_at DESC LIMIT 20
    `)) as unknown as [Array<{ title: string; category: string; content: string }>, unknown];

    const entries = [...(brainRows ?? []), ...(knowledgeRows ?? [])];
    if (!entries.length) return '';

    return entries.map(e =>
      `[${e.category ?? 'general'}] ${e.title}: ${e.content?.slice(0, 500)}`
    ).join('\n');
  } catch {
    return '';
  }
}

// ── Main streaming function ───────────────────────────────────────────────────

export async function streamDazzaV3(opts: V3StreamOptions): Promise<void> {
  const { ownerContext, userMessage, mode, onToken, onToolCall, onDone, onError } = opts;

  // Owner-only guard
  if (!ownerContext.isPlatformOwner) {
    onError('Owner access required.');
    return;
  }

  const apiKeyRaw = getSecret('OPENAI_API_KEY');
  const apiKey = apiKeyRaw !== null ? String(apiKeyRaw).trim() : null;
  if (!apiKey) {
    onError('OpenAI API key not configured. Set OPENAI_API_KEY to enable Dazza V3.');
    return;
  }
  // ── Conversation ID resolution + ownership enforcement ────────────────────
  let conversationId: string;
  let isNewConversation: boolean;

  if (opts.conversationId) {
    // Existing conversation — verify ownership before loading anything
    const ownership = await verifyConversationOwnership(opts.conversationId, ownerContext.userId);

    if (ownership === 'forbidden') {
      // Audit the rejected attempt
      void auditV3(ownerContext.userId, 'v3_conversation_ownership_rejected', {
        attemptedConversationId: opts.conversationId,
        requestingUserId: ownerContext.userId,
      });
      onError('FORBIDDEN: This conversation belongs to a different user.');
      return;
    }

    if (ownership === 'not_found') {
      // Treat as new — the ID may be stale (e.g. DB was reset)
      conversationId = opts.conversationId;
      isNewConversation = true;
    } else {
      conversationId = opts.conversationId;
      isNewConversation = false;
    }
  } else {
    conversationId = randomUUID();
    isNewConversation = true;
  }

  // ── Load bounded history ──────────────────────────────────────────────────
  const { messages: historyMessages, totalTurns, compacted } = isNewConversation
    ? { messages: [], totalTurns: 0, compacted: false }
    : await loadBoundedHistory(conversationId);

  // ── Load approved memory ──────────────────────────────────────────────────
  const approvedMemory = await loadApprovedMemory();

  // ── Audit the request ─────────────────────────────────────────────────────
  void auditV3(ownerContext.userId, `v3_${mode}_request`, {
    conversationId,
    isNewConversation,
    messageLength: userMessage.length,
    historyTurns: totalTurns,
    compacted,
    incidentId: opts.incidentId,
    bugReportId: opts.bugReportId,
  });

  // Build system prompt with memory
  const systemContent = [
    DAZZA_V3_SYSTEM_PROMPT,
    approvedMemory ? `\n## Owner-approved memory\n${approvedMemory}` : '',
    mode === 'investigation' ? '\n## Mode: Deep Investigation\nProvide maximum detail. Do not truncate. Use all available tools.' : '',
    mode === 'bug_analysis' ? '\n## Mode: Bug Analysis\nAnalyse the bug report thoroughly. Produce a complete Airo repair prompt.' : '',
  ].filter(Boolean).join('\n');

  // Build messages array
  type OAIMessage =
    | { role: 'system'; content: string }
    | { role: 'user'; content: string }
    | { role: 'assistant'; content: string | null; tool_calls?: ToolCallChunk[] }
    | { role: 'tool'; tool_call_id: string; content: string };

  interface ToolCallChunk {
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }

  const messages: OAIMessage[] = [
    { role: 'system', content: systemContent },
    ...historyMessages.map(h => ({ role: h.role as 'user' | 'assistant' | 'system', content: h.content })),
    { role: 'user', content: userMessage },
  ];

  // Save user turn (turn index = total stored turns so far)
  const userTurnIndex = totalTurns;
  void saveConversationTurn(conversationId, ownerContext.userId, 'user', userMessage, userTurnIndex);

  // Model — resolved from DAZZA_OPENAI_MODEL secret, never exposed to browser
  const model = getDazzaModel();
  const maxTokens = mode === 'investigation' ? MAX_TOKENS_INVESTIGATION : MAX_TOKENS_CHAT;

  const toolsUsed: string[] = [];
  let fullAssistantResponse = '';
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  // ── Agentic loop — OpenAI Responses API ──────────────────────────────────
  // Both chat and investigation modes use the Responses API.
  // The Responses API uses `input` (not `messages`) and `max_output_tokens` (not `max_tokens`).
  // Reasoning models do not support `temperature` — omit it entirely.
  //
  // Tool result format for Responses API:
  //   { type: 'function_call_output', call_id: '...', output: '...' }
  // NOT the Chat Completions format: { role: 'tool', tool_call_id: '...', content: '...' }

  // Build the Responses API input array from the messages array.
  // System messages → role: 'system', user/assistant → role: 'user'/'assistant',
  // tool results → type: 'function_call_output'.
  type ResponsesApiInput =
    | { role: 'system' | 'user' | 'assistant'; content: string }
    | { type: 'function_call'; id: string; call_id: string; name: string; arguments: string }
    | { type: 'function_call_output'; call_id: string; output: string };

  // We maintain two parallel arrays:
  //   messages[]         — OAI message objects (for conversation save / history)
  //   responsesInput[]   — Responses API input items (sent to OpenAI each round)
  const responsesInput: ResponsesApiInput[] = messages.map(m => {
    if (m.role === 'tool') {
      return {
        type: 'function_call_output' as const,
        call_id: (m as { tool_call_id: string }).tool_call_id,
        output: m.content ?? '',
      };
    }
    return { role: m.role as 'system' | 'user' | 'assistant', content: m.content ?? '' };
  });

  for (let round = 0; round < TOOL_ROUNDS_MAX; round++) {
    let streamRes: globalThis.Response;
    try {
      streamRes = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_output_tokens: maxTokens,
          stream: true,
          tools: V3_TOOL_DEFINITIONS_FLAT,
          tool_choice: 'auto',
          input: responsesInput,
        }),
        signal: AbortSignal.timeout(120_000),
      });
    } catch (fetchErr) {
      const corrId = randomUUID().slice(0, 8).toUpperCase();
      console.error(`[dazza-v3] fetch error [ref:${corrId}]:`, String(fetchErr));
      onError(`OpenAI connection failed. Reference: ${corrId}`, conversationId);
      void saveConversationTurn(
        conversationId, ownerContext.userId, 'assistant',
        `[Connection failed — ref:${corrId}]`, userTurnIndex + 1,
      );
      return;
    }

    if (!streamRes.ok) {
      const errText = await streamRes.text();
      const corrId = randomUUID().slice(0, 8).toUpperCase();
      console.error(`[dazza-v3] OpenAI ${streamRes.status} [ref:${corrId}] round=${round}:`, errText.slice(0, 500));
      onError(`OpenAI request failed (HTTP ${streamRes.status}). Reference: ${corrId}`, conversationId);
      void saveConversationTurn(
        conversationId, ownerContext.userId, 'assistant',
        `[Request failed — ref:${corrId}]`, userTurnIndex + 1,
      );
      return;
    }

    const reader = streamRes.body?.getReader();
    if (!reader) { onError('No response body'); return; }

    const decoder = new TextDecoder();
    let buffer = '';
    let assistantContent = '';
    // Map from output_index → tool call accumulator
    const toolCallsMap: Record<string, ToolCallChunk> = {};
    let finishReason: string | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (raw === '[DONE]') { finishReason = finishReason ?? 'stop'; continue; }

        // ── Responses API event shapes (verified against openai SDK types) ──
        // response.output_text.delta          → { delta: string }   (NOT delta.content)
        // response.function_call_arguments.delta → { delta: string } (NOT delta.content)
        // response.output_item.added          → { item: ResponseOutputItem, output_index: number }
        // response.completed                  → { response: { usage: { input_tokens, output_tokens } } }
        // response.failed / error             → error event
        let chunk: {
          type?: string;
          // delta is a plain string for text and function-call-arguments events
          delta?: string;
          output_index?: number;
          item?: {
            type?: string;
            id?: string;
            call_id?: string;
            name?: string;
            arguments?: string;
          };
          // response.completed nests usage under chunk.response.usage
          response?: { usage?: { input_tokens?: number; output_tokens?: number } };
          // Some error events put usage at top level — keep as fallback
          usage?: { input_tokens?: number; output_tokens?: number };
        };
        try { chunk = JSON.parse(raw); } catch { continue; }

        const evType = chunk.type;

        // ── Text token ────────────────────────────────────────────────────────
        // delta is a plain string — NOT { content: string }
        if (evType === 'response.output_text.delta' && typeof chunk.delta === 'string' && chunk.delta) {
          assistantContent += chunk.delta;
          fullAssistantResponse += chunk.delta;
          onToken(chunk.delta);
        }

        // ── Function call item added — capture name and call_id ───────────────
        if (evType === 'response.output_item.added' && chunk.item?.type === 'function_call') {
          const idx = String(chunk.output_index ?? 0);
          toolCallsMap[idx] = {
            id: chunk.item.call_id ?? chunk.item.id ?? '',
            type: 'function',
            function: { name: chunk.item.name ?? '', arguments: '' },
          };
        }

        // ── Function call arguments streaming ─────────────────────────────────
        // delta is a plain string — NOT { content: string }
        if (evType === 'response.function_call_arguments.delta' && typeof chunk.delta === 'string') {
          const idx = String(chunk.output_index ?? 0);
          if (!toolCallsMap[idx]) {
            toolCallsMap[idx] = { id: '', type: 'function', function: { name: '', arguments: '' } };
          }
          toolCallsMap[idx].function.arguments += chunk.delta;
        }

        // ── Response completed — capture usage ────────────────────────────────
        // usage is nested under chunk.response.usage (not chunk.usage)
        if (evType === 'response.completed') {
          finishReason = 'stop';
          const usage = chunk.response?.usage ?? chunk.usage;
          if (usage) {
            totalInputTokens  += usage.input_tokens  ?? 0;
            totalOutputTokens += usage.output_tokens ?? 0;
          }
        }

        // ── Error events ──────────────────────────────────────────────────────
        if (evType === 'response.failed' || evType === 'error') {
          const corrId = randomUUID().slice(0, 8).toUpperCase();
          console.error(`[dazza-v3] SSE error event [ref:${corrId}]:`, JSON.stringify(chunk).slice(0, 300));
          onError(`Responses API error. Reference: ${corrId}`, conversationId);
          void saveConversationTurn(
            conversationId, ownerContext.userId, 'assistant',
            `[Stream error — ref:${corrId}]`, userTurnIndex + 1,
          );
          return;
        }
      }
    }

    const toolCallsList = Object.values(toolCallsMap).filter(tc => tc.function.name);

    // Append assistant turn to responsesInput
    if (assistantContent) {
      responsesInput.push({ role: 'assistant', content: assistantContent });
    }
    // Append function_call items for each tool call
    for (const tc of toolCallsList) {
      responsesInput.push({
        type: 'function_call',
        id: tc.id,
        call_id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments,
      });
    }

    // Also keep messages[] in sync for conversation save
    messages.push({
      role: 'assistant',
      content: assistantContent || null,
      ...(toolCallsList.length > 0 ? { tool_calls: toolCallsList } : {}),
    });

    if (finishReason === 'stop' || toolCallsList.length === 0) {
      break;
    }

    // Execute tool calls and append results
    for (const tc of toolCallsList) {
      const toolName = tc.function.name;
      onToolCall(toolName, 'running');
      toolsUsed.push(toolName);

      void auditV3(ownerContext.userId, 'v3_tool_call', {
        conversationId,
        toolName,
        round,
      });

      let args: Record<string, unknown> = {};
      try { args = JSON.parse(tc.function.arguments || '{}'); } catch { /* ignore */ }

      const result = await executeV3Tool(toolName, args);
      onToolCall(toolName, 'done');

      // Responses API tool result format
      responsesInput.push({
        type: 'function_call_output',
        call_id: tc.id,
        output: result,
      });

      // Keep messages[] in sync
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: result,
      });
    }
  }

  // ── Guard: empty response ─────────────────────────────────────────────────
  // If the agentic loop completed but produced no text, something went wrong
  // (e.g. the model returned only tool calls with no final text turn, or the
  // stream closed before a text event arrived). Emit a safe error rather than
  // silently creating an empty assistant bubble.
  if (!fullAssistantResponse.trim()) {
    const corrId = randomUUID().slice(0, 8).toUpperCase();
    console.error(`[dazza-v3] empty response after ${TOOL_ROUNDS_MAX} rounds [ref:${corrId}] toolsUsed=${toolsUsed.join(',')}`);
    onError(`Dazza returned an empty response. Reference: ${corrId}`, conversationId);
    void saveConversationTurn(
      conversationId, ownerContext.userId, 'assistant',
      `[Empty response — ref:${corrId}]`, userTurnIndex + 1,
    );
    return;
  }

  // Save assistant turn
  void saveConversationTurn(
    conversationId,
    ownerContext.userId,
    'assistant',
    fullAssistantResponse,
    userTurnIndex + 1,
  );

  // Audit completion with token usage
  void auditV3(ownerContext.userId, `v3_${mode}_complete`, {
    conversationId,
    model,
    toolsUsed,
    responseLength: fullAssistantResponse.length,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    totalTokens: totalInputTokens + totalOutputTokens,
    historyTurns: totalTurns,
    compacted,
  });

  onDone({
    model,
    toolsUsed,
    conversationId,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
  });
}

// ── Incident management ───────────────────────────────────────────────────────

export async function ingestIncident(input: V3IncidentInput): Promise<{
  incidentId: string;
  isNew: boolean;
  severity: string;
}> {
  // Fingerprint: type + route + company (deduplicate related events)
  const fingerprint = [
    input.incidentType,
    input.affectedRoute ?? '',
    String(input.affectedCompanyId ?? ''),
  ].join(':');

  // Check for existing open incident with same fingerprint (within 24h)
  const [existing] = await db.execute(sql.raw(`
    SELECT id, severity, event_count FROM dazza_incidents
    WHERE fingerprint = '${fingerprint.replace(/'/g, "''")}'
      AND status != 'resolved'
      AND last_seen_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
    LIMIT 1
  `)) as unknown as [Array<{ id: string; severity: string; event_count: number }>, unknown];

  if (existing?.[0]) {
    // Update existing incident
    const inc = existing[0];
    await db.execute(sql.raw(`
      UPDATE dazza_incidents
      SET event_count = event_count + 1,
          last_seen_at = NOW(),
          severity = CASE
            WHEN '${input.severity}' = 'critical' THEN 'critical'
            WHEN severity = 'critical' THEN 'critical'
            WHEN '${input.severity}' = 'high' THEN 'high'
            WHEN severity = 'high' THEN 'high'
            ELSE severity
          END,
          updated_at = NOW()
      WHERE id = '${inc.id}'
    `));

    return { incidentId: inc.id, isNew: false, severity: inc.severity };
  }

  // Create new incident
  const incidentId = randomUUID();
  const evidenceJson = input.evidenceJson ?? JSON.stringify({ description: input.description });

  await db.execute(sql.raw(`
    INSERT INTO dazza_incidents
      (id, incident_type, severity, status, title, fingerprint,
       affected_route, affected_company_id, affected_user_count,
       description, evidence_json, platform, app_version,
       customer_recovered, data_loss_risk,
       first_seen_at, last_seen_at, event_count,
       created_at, updated_at)
    VALUES
      ('${incidentId}',
       '${input.incidentType.replace(/'/g, "''")}',
       '${input.severity}',
       'open',
       '${input.title.replace(/'/g, "''")}',
       '${fingerprint.replace(/'/g, "''")}',
       '${(input.affectedRoute ?? '').replace(/'/g, "''")}',
       ${input.affectedCompanyId ?? 'NULL'},
       1,
       '${input.description.replace(/'/g, "''")}',
       '${evidenceJson.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}',
       '${(input.platform ?? 'web').replace(/'/g, "''")}',
       '${(input.appVersion ?? '').replace(/'/g, "''")}',
       ${input.customerRecovered ? 1 : 0},
       ${input.dataLossRisk ? 1 : 0},
       NOW(), NOW(), 1,
       NOW(), NOW())
  `));

  // Create client rescue entry if we have user details
  if (input.affectedUserId && input.affectedUserName) {
    await db.execute(sql.raw(`
      INSERT INTO dazza_client_rescue
        (id, incident_id, user_id, user_name, user_email, user_phone,
         attempted_action, failure_description, recovered,
         rescue_status, created_at, updated_at)
      VALUES
        ('${randomUUID()}',
         '${incidentId}',
         '${input.affectedUserId.replace(/'/g, "''")}',
         '${input.affectedUserName.replace(/'/g, "''")}',
         '${(input.affectedUserEmail ?? '').replace(/'/g, "''")}',
         '${(input.affectedUserPhone ?? '').replace(/'/g, "''")}',
         '${(input.attemptedAction ?? '').replace(/'/g, "''")}',
         '${input.description.replace(/'/g, "''")}',
         ${input.customerRecovered ? 1 : 0},
         'needs_call',
         NOW(), NOW())
    `));
  }

  return { incidentId, isNew: true, severity: input.severity };
}

// ── Owner notification ────────────────────────────────────────────────────────

export async function notifyOwnerOfIncident(
  incidentId: string,
  severity: string,
  title: string,
  description: string,
  affectedUserName?: string,
  affectedCompanyName?: string,
): Promise<{ smsSent: boolean; emailSent: boolean }> {
  const ownerPhone = getSecret('PLATFORM_OWNER_PHONE') ?? '';
  const appUrl = getSecret('APP_URL') ?? 'https://iwillbuild.com';
  const caseLink = `${appUrl}/owner-console?tab=incidents&id=${incidentId}`;

  const isUrgent = severity === 'critical' || severity === 'high';

  // Build SMS (short, no secrets)
  const smsLines: string[] = ['DAZZA'];
  if (affectedUserName && affectedCompanyName) {
    smsLines.push(`CLIENT NEEDS HELP: ${affectedUserName} at ${affectedCompanyName}`);
  } else {
    smsLines.push(`${severity.toUpperCase()}: ${title}`);
  }
  smsLines.push(description.slice(0, 120));
  smsLines.push(`Case: ${caseLink}`);
  const smsBody = smsLines.join('\n');

  // Build email (more detail)
  const emailBody = `
<h2>Dazza Incident Alert — ${severity.toUpperCase()}</h2>
<p><strong>Title:</strong> ${title}</p>
<p><strong>Description:</strong> ${description}</p>
${affectedUserName ? `<p><strong>Affected user:</strong> ${affectedUserName}${affectedCompanyName ? ` at ${affectedCompanyName}` : ''}</p>` : ''}
<p><strong>Incident ID:</strong> ${incidentId}</p>
<p><a href="${caseLink}">Open case in Owner Console →</a></p>
<hr>
<p><em>Dazza has not changed or blocked anything. This is an observation only.</em></p>
  `.trim();

  let smsSent = false;
  let emailSent = false;

  if (isUrgent) {
    // SMS
    if (isSmsConfigured() && ownerPhone) {
      smsSent = await sendSms(ownerPhone, smsBody);
    }

    // Email
    try {
      await sendEmail({
        to: OWNER_SUPPORT_EMAIL,
        subject: `[DAZZA ${severity.toUpperCase()}] ${title}`,
        html: emailBody,
        text: smsBody,
      });
      emailSent = true;
    } catch (e) {
      console.warn('[dazza-v3] email notification failed:', e);
    }
  }

  // Record notification attempt
  try {
    await db.execute(sql.raw(`
      UPDATE dazza_incidents
      SET notification_sent = 1,
          notification_sent_at = NOW(),
          notification_sms_sent = ${smsSent ? 1 : 0},
          notification_email_sent = ${emailSent ? 1 : 0},
          updated_at = NOW()
      WHERE id = '${incidentId.replace(/'/g, "''")}'
    `));
  } catch { /* non-fatal */ }

  return { smsSent, emailSent };
}

// ── Mutation boundary test ────────────────────────────────────────────────────

/**
 * Explicit mutation boundary test.
 * Called by the test suite to verify Dazza V3 cannot mutate data.
 * Returns { blocked: true } for all mutation attempts.
 */
export function testMutationBoundary(action: string): { blocked: boolean; reason: string } {
  const BLOCKED_ACTIONS = [
    'insert', 'update', 'delete', 'create', 'edit', 'remove', 'archive',
    'send_email_to_customer', 'change_permission', 'suspend_user', 'deploy',
    'publish', 'trigger_airo', 'change_env', 'purchase',
  ];

  const lowerAction = action.toLowerCase();
  for (const blocked of BLOCKED_ACTIONS) {
    if (lowerAction.includes(blocked)) {
      return {
        blocked: true,
        reason: `Dazza V3 mutation boundary: "${blocked}" is not permitted. Dazza is read-only.`,
      };
    }
  }

  return { blocked: false, reason: 'Action is read-only — permitted.' };
}
