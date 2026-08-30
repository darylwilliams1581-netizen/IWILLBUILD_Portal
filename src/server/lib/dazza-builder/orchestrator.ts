/**
 * dazza-builder/orchestrator.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Main streaming orchestrator for the Dazza Builder Assistant.
 *
 * SECURITY GUARANTEES:
 * 1. Owner-only — isPlatformOwner checked before any work begins.
 * 2. API key stays server-side — never sent to client or logged.
 * 3. AI output is treated as untrusted input — every operation is validated
 *    by validateOperations before being passed to the adapters.
 * 4. Template IDs and owner IDs are resolved server-side.
 * 5. Tool results never include secrets, tokens, or passwords.
 * 6. Full audit trail via auditBuilder on every request and error.
 * 7. Conversation scoped by owner_user_id — no cross-user history leakage.
 *
 * TOOL-MESSAGE SEQUENCING GUARANTEE:
 * - The in-memory messages array uses OAIMessage (the full OpenAI shape).
 * - Assistant tool_calls messages are pushed with tool_calls as a top-level
 *   field (not serialised into content).
 * - Tool result messages are pushed immediately after their assistant message.
 * - sanitiseHistory() removes any orphaned tool messages from persisted
 *   history before the first request, preventing cross-request sequencing
 *   errors.
 * - Only plain user/assistant text turns are persisted to the DB.
 */
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getSecret } from '#airo/secrets';
import type { BuilderStreamOptions, BuilderOwnerContext, BuilderOperation, ProposedChange } from './types.js';
import { BUILDER_TOOL_DEFINITIONS, TOOL_LABELS, buildSystemPrompt } from './context.js';
import { validateOperations } from './operations.js';
import type { OAIMessage, OAIToolCall } from './conversation.js';
import { loadHistory, saveMessage, sanitiseHistory, CONTEXT_RECENT_TURNS } from './conversation.js';
import { auditBuilder } from './audit.js';
import { resolveAndExtractEvidence, buildUntrustedEvidenceBlock } from '../../lib/dazza-attachment-service.js';

const TOOL_ROUNDS_MAX = 6;
const MAX_TOKENS = 8000;

// ── Friendly error formatting ─────────────────────────────────────────────────

/**
 * Convert a raw OpenAI error response body into a single friendly message.
 * Extracts the error.message field if present; otherwise returns a generic
 * message with the HTTP status code.  Never exposes raw JSON to the client.
 */
function friendlyOpenAIError(status: number, rawText: string, requestId: string): string {
  try {
    const parsed = JSON.parse(rawText) as { error?: { message?: string; code?: string } };
    const msg = parsed?.error?.message;
    if (msg) {
      // Sanitise: strip any internal IDs or stack traces from the message.
      const safe = msg.replace(/org-[A-Za-z0-9]+/g, '[org]').slice(0, 300);
      return `AI service error (ref: ${requestId}): ${safe}`;
    }
  } catch {
    // Not JSON — fall through.
  }
  return `AI service returned an unexpected response (HTTP ${status}, ref: ${requestId}). Please try again.`;
}

// ── Tool executor ─────────────────────────────────────────────────────────────

async function executeBuilderTool(
  name: string,
  args: Record<string, unknown>,
  ownerContext: BuilderOwnerContext,
): Promise<string> {
  function ok(data: unknown): string { return JSON.stringify({ ok: true, data }); }
  function err(msg: string): string { return JSON.stringify({ ok: false, error: msg }); }

  try {
    switch (name) {
      case 'builder_get_template': {
        const id = Number(args.templateId) || null;
        const type = String(args.builderType);
        if (!id) return ok({ note: 'No template is currently open (list-page context). Use createNewTemplate as the first operation to create one.' });

        if (type === 'document') {
          // db.execute returns [RowDataPacket[], FieldPacket[]] — rows at index [0].
          const [docData] = await db.execute(sql`
            SELECT id, name, template_type, doc_status, doc_kind,
                   requires_acknowledgement, submit_label, requires_signature,
                   builder_json, pdf_settings_json, created_at, updated_at
            FROM document_templates
            WHERE id = ${id}
            LIMIT 1
          `) as unknown as [Array<Record<string, unknown>>, unknown];
          const row = docData?.[0];
          if (!row) return err('Template not found');
          const builderJson = row.builder_json as string | null;
          const truncated = builderJson && builderJson.length > 8000
            ? builderJson.slice(0, 8000) + '…[truncated]'
            : builderJson;
          return ok({ ...row, builder_json: truncated });
        } else {
          const [formData] = await db.execute(sql`
            SELECT ft.id, ft.name, ft.form_type, ft.category, ft.description,
                   ft.is_active, ft.on_dashboard, ft.on_jobs, ft.on_fleet,
                   ft.created_at, ft.updated_at
            FROM form_templates ft
            WHERE ft.id = ${id}
            LIMIT 1
          `) as unknown as [Array<Record<string, unknown>>, unknown];
          const row = formData?.[0];
          if (!row) return err('Form template not found');

          const [fieldData] = await db.execute(sql`
            SELECT id, label, field_type, required, options_json, settings_json,
                   logic_json, field_order
            FROM form_fields
            WHERE template_id = ${id}
            ORDER BY field_order ASC
            LIMIT 200
          `) as unknown as [Array<Record<string, unknown>>, unknown];
          return ok({ template: row, fields: fieldData ?? [] });
        }
      }

      case 'builder_list_templates': {
        const type = String(args.builderType);
        const limit = Math.min(Number(args.limit ?? 20), 50);

        if (type === 'document') {
          const [listData] = await db.execute(sql`
            SELECT id, name, template_type, doc_status, created_at, updated_at
            FROM document_templates
            ORDER BY updated_at DESC
            LIMIT ${limit}
          `) as unknown as [Array<Record<string, unknown>>, unknown];
          return ok(listData ?? []);
        } else {
          const [listData] = await db.execute(sql`
            SELECT id, name, form_type, category, is_active, created_at, updated_at
            FROM form_templates
            ORDER BY updated_at DESC
            LIMIT ${limit}
          `) as unknown as [Array<Record<string, unknown>>, unknown];
          return ok(listData ?? []);
        }
      }

      case 'builder_get_versions': {
        const id = Number(args.templateId);
        const type = String(args.builderType);
        const limit = Math.min(Number(args.limit ?? 10), 50);
        if (!id) return err('templateId required');

        const [versionList] = await db.execute(sql`
          SELECT id, version_number, instruction_summary, operations_count,
                 validation_result, created_at
          FROM dazza_builder_versions
          WHERE template_id = ${id} AND builder_type = ${type}
          ORDER BY version_number DESC
          LIMIT ${limit}
        `) as unknown as [Array<Record<string, unknown>>, unknown];
        return ok(versionList ?? []);
      }

      case 'builder_propose_changes': {
        // Handled client-side via onProposedChange callback.
        return ok({ proposed: true, operationCount: (args.operations as unknown[])?.length ?? 0 });
      }

      case 'builder_validate_operations': {
        const id = Number(args.templateId) || null;
        const type = String(args.builderType);
        const ops = (args.operations as BuilderOperation[]) ?? [];

        // When templateId is null (creating a new template), skip the ID check.
        // The createNewTemplate op is always valid as the first op; validate the rest.
        const opsToCheck = ops.filter(op => (op as { op?: string }).op !== 'createNewTemplate');
        const errors = validateOperations(opsToCheck, type as 'document' | 'form');
        return ok({ valid: errors.length === 0, errors, note: id ? undefined : 'templateId is null — createNewTemplate path, server-side validation will run on apply' });
      }

      default:
        return err(`Unknown tool: ${name}`);
    }
  } catch (e) {
    return err(`Tool error: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ── Main stream function ──────────────────────────────────────────────────────

export async function streamBuilderAssistant(opts: BuilderStreamOptions): Promise<void> {
  const {
    ownerContext,
    userMessage,
    builderContext,
    onToken,
    onToolCall,
    onStatus,
    onProposedChange,
    onDone,
    onError,
  } = opts;

  if (!ownerContext.isPlatformOwner) {
    onError('Owner access required.');
    return;
  }

  const apiKeyRaw = getSecret('OPENAI_API_KEY');
  const apiKey = apiKeyRaw !== null ? String(apiKeyRaw).trim() : null;
  if (!apiKey) {
    onError('OpenAI API key not configured.');
    return;
  }

  const conversationId = opts.conversationId ?? randomUUID();
  const isNew = !opts.conversationId;

  // Load persisted history (plain user/assistant text only) and sanitise it
  // before use.  sanitiseHistory removes any orphaned tool messages that could
  // have been introduced by legacy data or partial writes.
  const rawHistory = isNew ? [] : await loadHistory(conversationId, ownerContext.userId);
  const history = sanitiseHistory(rawHistory as OAIMessage[]);

  void auditBuilder(ownerContext.userId, 'builder_chat_request', {
    conversationId,
    builderType: builderContext.builderType,
    templateId: builderContext.templateId,
    messageLength: userMessage.length,
  });

  // ── Resolve attachments ──────────────────────────────────────────────────
  let effectiveUserMessage = userMessage;
  if (opts.attachmentIds?.length) {
    onStatus('reading', 'Reading attachments…');
    const { evidence, errors } = await resolveAndExtractEvidence(
      opts.attachmentIds,
      ownerContext.userId,
    );
    const evidenceBlock = buildUntrustedEvidenceBlock(evidence);
    if (evidenceBlock) {
      effectiveUserMessage = `${userMessage}\n\n${evidenceBlock}`;
    }
    if (errors.length) {
      void auditBuilder(ownerContext.userId, 'builder_attachment_errors', {
        conversationId,
        errors,
      });
    }
  }

  // Persist the effective user message — including the evidence block when
  // attachments were provided.  This ensures follow-up turns (e.g. "just
  // insert on this doc") can still reference the attachment content from
  // history, rather than losing it after the first turn.
  const turnIndex = history.filter((m) => m.role !== 'system').length;
  await saveMessage(conversationId, ownerContext.userId, 'user', effectiveUserMessage, turnIndex);

  onStatus('reading', 'Reading context…');

  const systemPrompt = buildSystemPrompt(builderContext);

  // Build the messages array with the full OAIMessage type so tool_calls
  // and tool result messages can be pushed without casts.
  const messages: OAIMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-CONTEXT_RECENT_TURNS * 2),
    { role: 'user', content: effectiveUserMessage },
  ];

  let toolsUsed: string[] = [];
  let assistantContent = '';
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    for (let round = 0; round < TOOL_ROUNDS_MAX; round++) {
      onStatus('planning', round === 0 ? 'Thinking…' : 'Continuing…');

      const requestId = randomUUID().slice(0, 8);

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages,
          tools: BUILDER_TOOL_DEFINITIONS.map((t) => ({
            type: 'function',
            function: { name: t.name, description: t.description, parameters: t.parameters },
          })),
          tool_choice: 'auto',
          max_tokens: MAX_TOKENS,
          stream: true,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        onError(friendlyOpenAIError(response.status, errText, requestId), conversationId);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        onError(`No response body from AI service (ref: ${requestId}).`, conversationId);
        return;
      }

      // ── Stream parsing ─────────────────────────────────────────────────
      let toolCallsThisRound: Array<{ id: string; name: string; argsRaw: string }> = [];
      let finishReason = '';
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') {
            finishReason = finishReason || 'stop';
            break;
          }

          let chunk: Record<string, unknown>;
          try { chunk = JSON.parse(data); } catch { continue; }

          const usage = chunk.usage as Record<string, number> | undefined;
          if (usage) {
            inputTokens += usage.prompt_tokens ?? 0;
            outputTokens += usage.completion_tokens ?? 0;
          }

          const choices = (chunk.choices as Array<Record<string, unknown>>) ?? [];
          for (const choice of choices) {
            const delta = choice.delta as Record<string, unknown> | undefined;
            if (!delta) continue;
            finishReason = String(choice.finish_reason ?? finishReason);

            if (typeof delta.content === 'string' && delta.content) {
              assistantContent += delta.content;
              onToken(delta.content);
            }

            const toolCallDeltas = delta.tool_calls as Array<Record<string, unknown>> | undefined;
            if (toolCallDeltas) {
              for (const tc of toolCallDeltas) {
                const idx = Number(tc.index ?? 0);
                if (!toolCallsThisRound[idx]) {
                  toolCallsThisRound[idx] = { id: '', name: '', argsRaw: '' };
                }
                const fn = tc.function as Record<string, string> | undefined;
                if (tc.id) toolCallsThisRound[idx].id = String(tc.id);
                if (fn?.name) toolCallsThisRound[idx].name += fn.name;
                if (fn?.arguments) toolCallsThisRound[idx].argsRaw += fn.arguments;
              }
            }
          }
        }
      }

      // No tool calls this round — we're done.
      if (toolCallsThisRound.length === 0 || finishReason === 'stop') break;

      // ── Execute tools ──────────────────────────────────────────────────
      // Collect all results before pushing to messages so the assistant
      // message and all its tool results are pushed atomically.
      const toolResults: Array<{ role: 'tool'; tool_call_id: string; content: string }> = [];

      for (const tc of toolCallsThisRound) {
        if (!tc.name || !tc.id) continue;
        toolsUsed.push(tc.name);
        onToolCall(tc.name, 'running');
        onStatus('applying', TOOL_LABELS[tc.name] ?? `Running ${tc.name}…`);

        let args: Record<string, unknown> = {};
        try { args = JSON.parse(tc.argsRaw || '{}'); } catch { args = {}; }

        // Special handling for propose_changes — emit to client.
        if (tc.name === 'builder_propose_changes') {
          const proposed: ProposedChange = {
            summary: String(args.summary ?? ''),
            affectedSections: (args.affectedSections as string[]) ?? [],
            affectedItems: (args.affectedItems as string[]) ?? [],
            validationImpact: String(args.validationImpact ?? ''),
            operations: (args.operations as BuilderOperation[]) ?? [],
            conversationId,
            // Stamp the effective template ID server-side — never from AI args.
            // Prefer canonicalTemplateId (from the URL route param, always
            // authoritative) over templateId (from the Zustand store, which may
            // still be null on first render when the store hasn't loaded yet).
            targetTemplateId: builderContext.canonicalTemplateId ?? builderContext.templateId,
            targetBuilderType: builderContext.builderType,
          };
          onProposedChange(proposed);
        }

        const result = await executeBuilderTool(tc.name, args, ownerContext);
        onToolCall(tc.name, 'done');
        toolResults.push({ role: 'tool', tool_call_id: tc.id, content: result });
      }

      // ── Push assistant + tool results as an indivisible group ──────────
      // The assistant message MUST have tool_calls as a top-level field
      // (not serialised into content) so OpenAI can match the tool results.
      const assistantMsg: OAIMessage = {
        role: 'assistant',
        content: assistantContent || null,
        tool_calls: toolCallsThisRound
          .filter((tc) => tc.id && tc.name)
          .map((tc): OAIToolCall => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: tc.argsRaw },
          })),
      };
      messages.push(assistantMsg);
      for (const tr of toolResults) {
        messages.push(tr);
      }

      // Reset for next round.
      assistantContent = '';
      toolCallsThisRound = [];
    }

    // Persist the final assistant text response (if any).
    if (assistantContent) {
      await saveMessage(
        conversationId,
        ownerContext.userId,
        'assistant',
        assistantContent,
        turnIndex + 1,
      );
    }

    onStatus('complete', 'Done');
    onDone({ model: 'gpt-4o', toolsUsed, conversationId, inputTokens, outputTokens });

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    onError(msg, conversationId);
    void auditBuilder(ownerContext.userId, 'builder_chat_error', {
      conversationId,
      error: msg,
    });
  }
}
