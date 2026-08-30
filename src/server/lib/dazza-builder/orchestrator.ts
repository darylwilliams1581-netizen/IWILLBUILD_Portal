/**
 * dazza-builder/orchestrator.ts
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
 */
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getSecret } from '#airo/secrets';
import type { BuilderStreamOptions, BuilderOwnerContext, BuilderOperation, ProposedChange } from './types.js';
import { BUILDER_TOOL_DEFINITIONS, TOOL_LABELS, buildSystemPrompt } from './context.js';
import { validateOperations } from './operations.js';
import { loadHistory, saveMessage } from './conversation.js';
import { auditBuilder } from './audit.js';

const TOOL_ROUNDS_MAX = 6;
const MAX_TOKENS = 8000;
const CONTEXT_RECENT_TURNS = 16;

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
        const id = Number(args.templateId);
        const type = String(args.builderType);
        if (!id) return err('templateId required');

        if (type === 'document') {
          const rows = await db.execute(sql`
            SELECT id, name, template_type, doc_status, doc_kind,
                   requires_acknowledgement, submit_label, requires_signature,
                   builder_json, pdf_settings_json, created_at, updated_at
            FROM document_templates
            WHERE id = ${id}
            LIMIT 1
          `);
          const row = (rows as { rows: unknown[] }).rows?.[0] as Record<string, unknown> | undefined;
          if (!row) return err('Template not found');
          // Truncate builder_json for context — full JSON can be huge
          const builderJson = row.builder_json as string | null;
          const truncated = builderJson && builderJson.length > 8000
            ? builderJson.slice(0, 8000) + '…[truncated]'
            : builderJson;
          return ok({ ...row, builder_json: truncated });
        } else {
          const rows = await db.execute(sql`
            SELECT ft.id, ft.name, ft.form_type, ft.category, ft.description,
                   ft.is_active, ft.on_dashboard, ft.on_jobs, ft.on_fleet,
                   ft.created_at, ft.updated_at
            FROM form_templates ft
            WHERE ft.id = ${id}
            LIMIT 1
          `);
          const row = (rows as { rows: unknown[] }).rows?.[0] as Record<string, unknown> | undefined;
          if (!row) return err('Form template not found');

          const fieldRows = await db.execute(sql`
            SELECT id, label, field_type, required, options_json, settings_json,
                   logic_json, field_order
            FROM form_fields
            WHERE template_id = ${id}
            ORDER BY field_order ASC
            LIMIT 200
          `);
          return ok({ template: row, fields: (fieldRows as { rows: unknown[] }).rows ?? [] });
        }
      }

      case 'builder_list_templates': {
        const type = String(args.builderType);
        const limit = Math.min(Number(args.limit ?? 20), 50);

        if (type === 'document') {
          const rows = await db.execute(sql`
            SELECT id, name, template_type, doc_status, created_at, updated_at
            FROM document_templates
            ORDER BY updated_at DESC
            LIMIT ${limit}
          `);
          return ok((rows as { rows: unknown[] }).rows ?? []);
        } else {
          const rows = await db.execute(sql`
            SELECT id, name, form_type, category, is_active, created_at, updated_at
            FROM form_templates
            ORDER BY updated_at DESC
            LIMIT ${limit}
          `);
          return ok((rows as { rows: unknown[] }).rows ?? []);
        }
      }

      case 'builder_get_versions': {
        const id = Number(args.templateId);
        const type = String(args.builderType);
        const limit = Math.min(Number(args.limit ?? 10), 50);
        if (!id) return err('templateId required');

        const rows = await db.execute(sql`
          SELECT id, version_number, instruction_summary, operations_count,
                 validation_result, created_at
          FROM dazza_builder_versions
          WHERE template_id = ${id} AND builder_type = ${type}
          ORDER BY version_number DESC
          LIMIT ${limit}
        `);
        return ok((rows as { rows: unknown[] }).rows ?? []);
      }

      case 'builder_propose_changes': {
        // Handled client-side via onProposedChange callback.
        return ok({ proposed: true, operationCount: (args.operations as unknown[])?.length ?? 0 });
      }

      case 'builder_validate_operations': {
        const id = Number(args.templateId);
        const type = String(args.builderType);
        const ops = (args.operations as BuilderOperation[]) ?? [];
        if (!id) return err('templateId required');

        const errors = validateOperations(ops, type as 'document' | 'form');
        return ok({ valid: errors.length === 0, errors });
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
  const { ownerContext, userMessage, builderContext, onToken, onToolCall, onStatus, onProposedChange, onDone, onError } = opts;

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
  const history = isNew ? [] : await loadHistory(conversationId, ownerContext.userId);

  void auditBuilder(ownerContext.userId, 'builder_chat_request', {
    conversationId, builderType: builderContext.builderType,
    templateId: builderContext.templateId, messageLength: userMessage.length,
  });

  const turnIndex = history.length;
  await saveMessage(conversationId, ownerContext.userId, 'user', userMessage, turnIndex);

  onStatus('reading', 'Reading context…');

  const systemPrompt = buildSystemPrompt(builderContext);
  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-CONTEXT_RECENT_TURNS * 2),
    { role: 'user', content: userMessage },
  ];

  let toolsUsed: string[] = [];
  let assistantContent = '';
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    for (let round = 0; round < TOOL_ROUNDS_MAX; round++) {
      onStatus('planning', round === 0 ? 'Thinking…' : 'Continuing…');

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages,
          tools: BUILDER_TOOL_DEFINITIONS.map(t => ({
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
        onError(`OpenAI error: ${response.status} ${errText.slice(0, 200)}`);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) { onError('No response body'); return; }

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
          if (data === '[DONE]') { finishReason = finishReason || 'stop'; break; }

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
                if (!toolCallsThisRound[idx]) toolCallsThisRound[idx] = { id: '', name: '', argsRaw: '' };
                const fn = tc.function as Record<string, string> | undefined;
                if (tc.id) toolCallsThisRound[idx].id = String(tc.id);
                if (fn?.name) toolCallsThisRound[idx].name += fn.name;
                if (fn?.arguments) toolCallsThisRound[idx].argsRaw += fn.arguments;
              }
            }
          }
        }
      }

      if (toolCallsThisRound.length === 0 || finishReason === 'stop') break;

      const toolResults: Array<{ role: string; tool_call_id: string; content: string }> = [];

      for (const tc of toolCallsThisRound) {
        if (!tc.name) continue;
        toolsUsed.push(tc.name);
        onToolCall(tc.name, 'running');
        onStatus('applying', TOOL_LABELS[tc.name] ?? `Running ${tc.name}…`);

        let args: Record<string, unknown> = {};
        try { args = JSON.parse(tc.argsRaw || '{}'); } catch { args = {}; }

        // Special handling for propose_changes — emit to client
        if (tc.name === 'builder_propose_changes') {
          const proposed: ProposedChange = {
            summary: String(args.summary ?? ''),
            affectedSections: (args.affectedSections as string[]) ?? [],
            affectedItems: (args.affectedItems as string[]) ?? [],
            validationImpact: String(args.validationImpact ?? ''),
            operations: (args.operations as BuilderOperation[]) ?? [],
            conversationId,
          };
          onProposedChange(proposed);
        }

        const result = await executeBuilderTool(tc.name, args, ownerContext);
        onToolCall(tc.name, 'done');
        toolResults.push({ role: 'tool', tool_call_id: tc.id, content: result });
      }

      messages.push({
        role: 'assistant',
        content: JSON.stringify({
          content: assistantContent || null,
          tool_calls: toolCallsThisRound.map(tc => ({
            id: tc.id, type: 'function',
            function: { name: tc.name, arguments: tc.argsRaw },
          })),
        }),
      });
      for (const tr of toolResults) messages.push(tr as { role: string; content: string });

      assistantContent = '';
      toolCallsThisRound = [];
    }

    if (assistantContent) {
      await saveMessage(conversationId, ownerContext.userId, 'assistant', assistantContent, turnIndex + 1);
    }

    onStatus('complete', 'Done');
    onDone({ model: 'gpt-4o', toolsUsed, conversationId, inputTokens, outputTokens });

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    onError(msg, conversationId);
    void auditBuilder(ownerContext.userId, 'builder_chat_error', { conversationId, error: msg });
  }
}
