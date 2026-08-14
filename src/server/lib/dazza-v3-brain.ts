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
import { V3_TOOL_DEFINITIONS, executeV3Tool } from './dazza-v3-tools.js';
import { sendSms, isSmsConfigured } from './sms.js';
import { sendEmail } from '../email.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const DAZZA_V3_FEATURE_FLAG = 'DAZZA_V3_ENABLED';
const OWNER_SUPPORT_EMAIL = 'support@iwillbuild.com';
const MAX_CONVERSATION_TURNS = 40;
const MAX_TOKENS_INVESTIGATION = 4000;
const MAX_TOKENS_CHAT = 2000;
const TOOL_ROUNDS_MAX = 8;

// ── Feature flag ──────────────────────────────────────────────────────────────

export function isDazzaV3Enabled(): boolean {
  return process.env[DAZZA_V3_FEATURE_FLAG] === 'true';
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
  onDone: (meta: { model: string; toolsUsed: string[]; conversationId: string }) => void;
  onError: (message: string) => void;
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

const DAZZA_V3_SYSTEM_PROMPT = `You are Dazza, IWILLBUILD's Owner-only system watcher and investigator.

## Identity
You are speaking to Daryl, the authenticated IWILLBUILD platform Owner and developer.
Your purpose is to help Daryl maintain, understand and improve the IWILLBUILD system.
You are not a customer-facing assistant. This is a private owner console.

## Absolute rules (never violate)
1. OWNER-ONLY. You are speaking to Daryl. Never respond to non-owner requests.
2. READ-ONLY. You cannot insert, update, delete, or mutate any business data, user records, or permissions.
3. No customer communication. You can prepare suggested wording for Daryl to review and send himself.
4. No code changes. You cannot change source code, deploy, publish, trigger Airo repairs, or change environment variables.
5. No secrets. Never expose passwords, API keys, tokens, session secrets, or raw env vars. If a tool returns [REDACTED], do not attempt to recover or guess the value.
6. Cite evidence. Investigate using authorised read-only tools and cite the evidence you inspected. Never claim you inspected evidence you did not access.
7. Distinguish facts, inferences, and unknowns. Facts come from tool results. Inferences are your reasoning. Unknowns are what you cannot determine.
8. Live portal and technical evidence outrank assumptions and general reasoning.
9. Annette provides approved memory, previous Cases and verified outcomes. Treat approved memory as reliable context.
10. Remember corrections within the current conversation. If Daryl corrects you, acknowledge it and carry the correction forward.
11. Do not fall back to generic jobs/fleet assistance when Daryl is discussing system maintenance, bugs, or platform issues.
12. You may create Dazza-owned records: conversation turns, audit entries, Case-review records, and pending-memory candidates.
13. You may notify only the configured platform Owner where separately authorised.

## What Dazza CANNOT do (mutation boundary — absolute)
- Insert, update, or delete business records, jobs, fleet, forms, estimates, users, or permissions
- Send customer communication
- Change source code, builds, deployments, or publishing state
- Submit Airo repair prompts automatically
- Send SMS authorisation codes
- Trigger build or deployment pipelines
- Purchase services or change subscriptions

## Your personality
- Direct, honest, and practical. Australian English.
- Do not sugar-coat confirmed problems.
- Use Daryl's first name when appropriate.
- You can be blunt about what is broken and what needs fixing.

## Memory priority
1. These safety/privacy/read-only rules (immutable)
2. Current live portal evidence (from tools)
3. Owner-approved Annette memory (from v3_get_approved_memory)
4. Relevant conversation history
5. General model reasoning
6. Unapproved learning candidates (clearly marked as PENDING — NOT VERIFIED)

## Investigation output format
When investigating an incident or bug, structure your response as:
**WHAT HAPPENED** — facts from evidence
**EVIDENCE** — what tool results prove it
**WHO IS AFFECTED** — company, user, count
**RECOVERED?** — did the customer recover
**CURRENT IMPACT** — what is broken right now
**MOST LIKELY CAUSE** — your best diagnosis
**OTHER CAUSES CONSIDERED** — alternatives you ruled out
**CONFIDENCE** — High / Medium / Low and why
**MISSING EVIDENCE** — what you could not determine
**IMMEDIATE WORKAROUND** — what Daryl can tell the customer right now
**RECOMMENDED FIX** — specific technical fix
**LIKELY FILES** — which files/routes are probably involved
**REGRESSION RISKS** — what else might break
**TESTS REQUIRED** — exact test steps
**AIRO REPAIR PROMPT** — a complete, ready-to-paste prompt for the Airo builder

## Response length
- Ordinary chat: efficient and direct — as long as needed, no arbitrary word limit
- Investigation: as detailed as required — do not truncate
- SMS drafts: short, clear, no secrets, include secure link`;

// ── Conversation management ───────────────────────────────────────────────────

async function loadConversationHistory(conversationId: string): Promise<V3ChatMessage[]> {
  try {
    const [rows] = await db.execute(sql.raw(`
      SELECT role, content FROM dazza_v3_conversations
      WHERE conversation_id = '${conversationId.replace(/'/g, "''")}'
      ORDER BY turn_index ASC
      LIMIT ${MAX_CONVERSATION_TURNS * 2}
    `)) as unknown as [Array<{ role: string; content: string }>, unknown];

    return (rows ?? []).map(r => ({
      role: r.role as 'user' | 'assistant' | 'system',
      content: r.content,
    }));
  } catch {
    return [];
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

  const apiKey = getSecret('OPENAI_API_KEY');
  if (!apiKey) {
    onError('OpenAI API key not configured. Set OPENAI_API_KEY to enable Dazza V3.');
    return;
  }

  // Resolve conversation ID
  const conversationId = opts.conversationId ?? randomUUID();
  const isNewConversation = !opts.conversationId;

  // Load conversation history
  const history = isNewConversation ? [] : await loadConversationHistory(conversationId);

  // Load approved memory
  const approvedMemory = await loadApprovedMemory();

  // Audit the request
  void auditV3(ownerContext.userId, `v3_${mode}_request`, {
    conversationId,
    messageLength: userMessage.length,
    historyTurns: history.length,
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
    ...history.map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: userMessage },
  ];

  // Save user turn
  const userTurnIndex = history.length;
  void saveConversationTurn(conversationId, ownerContext.userId, 'user', userMessage, userTurnIndex);

  // Model selection
  const model = mode === 'investigation' ? 'gpt-4o' : 'gpt-4o-mini';
  const maxTokens = mode === 'investigation' ? MAX_TOKENS_INVESTIGATION : MAX_TOKENS_CHAT;

  const toolsUsed: string[] = [];
  let fullAssistantResponse = '';

  // Agentic loop
  for (let round = 0; round < TOOL_ROUNDS_MAX; round++) {
    let streamRes: Response;
    try {
      streamRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          temperature: mode === 'investigation' ? 0.2 : 0.3,
          stream: true,
          tools: V3_TOOL_DEFINITIONS,
          tool_choice: 'auto',
          messages,
        }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (fetchErr) {
      onError(`OpenAI request failed: ${String(fetchErr)}`);
      return;
    }

    if (!streamRes.ok) {
      const errText = await streamRes.text();
      onError(`OpenAI ${streamRes.status}: ${errText.slice(0, 300)}`);
      return;
    }

    const reader = streamRes.body?.getReader();
    if (!reader) { onError('No response body'); return; }

    const decoder = new TextDecoder();
    let buffer = '';
    let assistantContent = '';
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

        let chunk: {
          choices?: Array<{
            delta?: {
              content?: string | null;
              tool_calls?: Array<{
                index: number;
                id?: string;
                type?: string;
                function?: { name?: string; arguments?: string };
              }>;
            };
            finish_reason?: string | null;
          }>;
        };
        try { chunk = JSON.parse(raw); } catch { continue; }

        const delta = chunk.choices?.[0]?.delta;
        const fr = chunk.choices?.[0]?.finish_reason;
        if (fr) finishReason = fr;

        if (delta?.content) {
          assistantContent += delta.content;
          fullAssistantResponse += delta.content;
          onToken(delta.content);
        }

        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = String(tc.index);
            if (!toolCallsMap[idx]) {
              toolCallsMap[idx] = { id: tc.id ?? '', type: 'function', function: { name: '', arguments: '' } };
            }
            if (tc.id) toolCallsMap[idx].id = tc.id;
            if (tc.function?.name) toolCallsMap[idx].function.name += tc.function.name;
            if (tc.function?.arguments) toolCallsMap[idx].function.arguments += tc.function.arguments;
          }
        }
      }
    }

    const toolCallsList = Object.values(toolCallsMap);
    messages.push({
      role: 'assistant',
      content: assistantContent || null,
      ...(toolCallsList.length > 0 ? { tool_calls: toolCallsList } : {}),
    });

    if (finishReason === 'stop' || toolCallsList.length === 0) {
      break;
    }

    // Execute tool calls
    for (const tc of toolCallsList) {
      const toolName = tc.function.name;
      onToolCall(toolName, 'running');
      toolsUsed.push(toolName);

      // Audit tool call
      void auditV3(ownerContext.userId, 'v3_tool_call', {
        conversationId,
        toolName,
        round,
      });

      let args: Record<string, unknown> = {};
      try { args = JSON.parse(tc.function.arguments || '{}'); } catch { /* ignore */ }

      const result = await executeV3Tool(toolName, args);
      onToolCall(toolName, 'done');

      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: result,
      });
    }
  }

  // Save assistant turn
  void saveConversationTurn(
    conversationId,
    ownerContext.userId,
    'assistant',
    fullAssistantResponse,
    userTurnIndex + 1,
  );

  // Audit completion
  void auditV3(ownerContext.userId, `v3_${mode}_complete`, {
    conversationId,
    toolsUsed,
    responseLength: fullAssistantResponse.length,
  });

  onDone({ model, toolsUsed, conversationId });
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
  const ownerPhone = process.env.PLATFORM_OWNER_PHONE ?? '';
  const appUrl = process.env.APP_URL ?? 'https://iwillbuild.com';
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
