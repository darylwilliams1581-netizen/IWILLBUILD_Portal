/**
 * drayl/stream.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Streaming AI response with OpenAI function-calling tool-use.
 *
 * Flow:
 *   1. Send system prompt + user message + tool definitions to OpenAI
 *   2. Stream tokens back to the client via SSE as they arrive
 *   3. If the model calls a tool, execute it server-side and continue streaming
 *   4. Repeat until the model produces a final text response (finish_reason=stop)
 *
 * SSE event format (newline-delimited):
 *   data: {"type":"token","content":"..."}
 *   data: {"type":"tool_call","name":"lookup_jobs","status":"running"}
 *   data: {"type":"tool_result","name":"lookup_jobs","status":"done"}
 *   data: {"type":"done","mode":"ai","usedOpenAI":true}
 *   data: {"type":"error","message":"..."}
 */

import type { Response } from 'express';
import type { DazzaContext } from './types.js';
import type { AnnetteFinding } from './types.js';
import { TOOL_DEFINITIONS, executeTool } from './tools.js';

const SYSTEM_PROMPT = `You are Dazza, the IWIllBUILD portal AI assistant for Australian construction companies.

RULES:
- You have access to live portal tools. Use them when the user asks about jobs, fleet, estimates, costs, or to-dos.
- Portal data ALWAYS wins over your training knowledge on factual matters.
- Never invent job names, fleet assets, form data, or financial figures. If the data is not in the context or tool results, say so.
- Never expose API keys, tokens, passwords, raw SQL, or internal file paths.
- Safety/WHS/legal answers are guidance only — always recommend a competent person on site.
- Be practical, direct, and use Australian English. Keep it professional but plain.
- If Annette findings are provided, explain them clearly and suggest concrete next actions.
- Do not repeat the raw data back verbatim — synthesise and explain.
- Keep responses concise — under 400 words unless the question genuinely needs more.
- Format responses with clear headings (##), bullet points (-), and bold (**text**) where helpful.`;

interface StreamOptions {
  apiKey: string;
  model?: string;
  userMessage: string;
  context: DazzaContext;
  findings?: AnnetteFinding[];
  companyId: number;
  seeDollars: boolean;
  res: Response;
}

function buildContextSummary(context: DazzaContext): string {
  return [
    `Company: ${context.companyName}`,
    `User: ${context.user.name} (${context.user.role})`,
    `Jobs loaded: ${context.modules.jobs.data.length}`,
    `Open to-dos: ${context.modules.jobTodos.data.length}`,
    `Fleet assets: ${context.modules.fleet.data.length}`,
    `Forms: ${context.modules.forms.data.length}`,
    `Estimates: ${context.modules.estimates.data.length}`,
    `Files: ${context.modules.files.data.length}`,
    context.warnings.length > 0 ? `Module warnings: ${context.warnings.join('; ')}` : '',
  ].filter(Boolean).join('\n');
}

function buildFindingsSummary(findings: AnnetteFinding[]): string {
  if (!findings.length) return '';
  return findings.map((f) =>
    `[${f.severity.toUpperCase()}] ${f.title}: ${f.detail} → ${f.recommendedAction}`
  ).join('\n');
}

function sseWrite(res: Response, data: Record<string, unknown>) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// ── Main streaming function ───────────────────────────────────────────────────

export async function streamDazzaResponse(opts: StreamOptions): Promise<void> {
  const { apiKey, model = 'gpt-4o', userMessage, context, findings, companyId, seeDollars, res } = opts;

  const contextSummary = buildContextSummary(context);
  const findingsSummary = findings ? buildFindingsSummary(findings) : '';

  const userContent = [
    `Portal context:\n${contextSummary}`,
    findingsSummary ? `Annette findings:\n${findingsSummary}` : '',
    `Question: ${userMessage}`,
  ].filter(Boolean).join('\n\n');

  // Build the messages array — will grow as tool calls are made
  type OAIMessage =
    | { role: 'system'; content: string }
    | { role: 'user'; content: string }
    | { role: 'assistant'; content: string | null; tool_calls?: ToolCallChunk[] }
    | { role: 'tool'; tool_call_id: string; content: string };

  const messages: OAIMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userContent },
  ];

  interface ToolCallChunk {
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }

  // Try models in order
  const models = model === 'gpt-4o' ? ['gpt-4o', 'gpt-4o-mini'] : [model, 'gpt-4o-mini'];
  let chosenModel = models[0];

  for (const m of models) {
    try {
      await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: m, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] }),
      }).then(async (r) => {
        if (r.status === 404) throw new Error('model not found');
        await r.text(); // drain
      });
      chosenModel = m;
      break;
    } catch {
      if (m === models[models.length - 1]) throw new Error('No available OpenAI model');
    }
  }

  // Agentic loop — up to 5 tool-call rounds
  for (let round = 0; round < 5; round++) {
    const streamRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: chosenModel,
        max_tokens: 800,
        temperature: 0.3,
        stream: true,
        tools: TOOL_DEFINITIONS,
        tool_choice: 'auto',
        messages,
      }),
    });

    if (!streamRes.ok) {
      const errText = await streamRes.text();
      throw new Error(`OpenAI ${streamRes.status}: ${errText.slice(0, 200)}`);
    }

    // Accumulate the streamed response
    const reader = streamRes.body?.getReader();
    if (!reader) throw new Error('No response body');

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
          sseWrite(res, { type: 'token', content: delta.content });
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

    // Add assistant message to history
    const toolCallsList = Object.values(toolCallsMap);
    messages.push({
      role: 'assistant',
      content: assistantContent || null,
      ...(toolCallsList.length > 0 ? { tool_calls: toolCallsList } : {}),
    });

    // If no tool calls, we're done
    if (finishReason === 'stop' || toolCallsList.length === 0) {
      sseWrite(res, { type: 'done', mode: 'ai', usedOpenAI: true, model: chosenModel });
      return;
    }

    // Execute tool calls and add results
    for (const tc of toolCallsList) {
      sseWrite(res, { type: 'tool_call', name: tc.function.name, status: 'running' });

      let args: Record<string, unknown> = {};
      try { args = JSON.parse(tc.function.arguments || '{}'); } catch { /* ignore */ }

      const result = await executeTool(tc.function.name, args, companyId, seeDollars);

      sseWrite(res, { type: 'tool_result', name: tc.function.name, status: 'done' });

      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: result,
      });
    }

    // Continue to next round with tool results in context
  }

  // Exceeded max rounds
  sseWrite(res, { type: 'done', mode: 'ai', usedOpenAI: true, model: chosenModel });
}

// ── Anthropic Claude 3.5 Sonnet streaming (no tool-use, plain streaming) ──────

export async function streamClaudeResponse(opts: Omit<StreamOptions, 'companyId' | 'seeDollars'> & {
  anthropicApiKey: string;
}): Promise<void> {
  const { anthropicApiKey, userMessage, context, findings, res } = opts;

  const contextSummary = buildContextSummary(context);
  const findingsSummary = findings ? buildFindingsSummary(findings) : '';

  const userContent = [
    `Portal context:\n${contextSummary}`,
    findingsSummary ? `Annette findings:\n${findingsSummary}` : '',
    `Question: ${userMessage}`,
  ].filter(Boolean).join('\n\n');

  const streamRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': anthropicApiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 800,
      stream: true,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
    }),
  });

  if (!streamRes.ok) {
    const errText = await streamRes.text();
    throw new Error(`Anthropic ${streamRes.status}: ${errText.slice(0, 200)}`);
  }

  const reader = streamRes.body?.getReader();
  if (!reader) throw new Error('No response body');

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
      const raw = line.slice(6).trim();

      let event: { type?: string; delta?: { type?: string; text?: string } };
      try { event = JSON.parse(raw); } catch { continue; }

      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta' && event.delta.text) {
        sseWrite(res, { type: 'token', content: event.delta.text });
      }

      if (event.type === 'message_stop') {
        sseWrite(res, { type: 'done', mode: 'ai', usedOpenAI: false, model: 'claude-3-5-sonnet' });
        return;
      }
    }
  }

  sseWrite(res, { type: 'done', mode: 'ai', usedOpenAI: false, model: 'claude-3-5-sonnet' });
}
