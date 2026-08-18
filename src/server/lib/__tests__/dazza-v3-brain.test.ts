/**
 * dazza-v3-brain.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Regression tests for the Dazza V3 agentic loop.
 *
 * These tests exercise the SSE stream processor, forced synthesis path, and
 * repeated-call dedup logic without making real network calls.
 *
 * All external dependencies are mocked:
 *   - fetch (global) — returns controlled SSE streams
 *   - #airo/secrets  — returns a fake API key
 *   - db             — no-ops
 *   - dazza-v3-tools — returns controlled tool results
 *   - sms / email    — no-ops
 *   - dazza-attachment-service — no-ops
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Module mocks (hoisted before imports) ─────────────────────────────────────

vi.mock('#airo/secrets', () => ({
  getSecret: (key: string) => {
    if (key === 'OPENAI_API_KEY') return 'sk-test-key';
    if (key === 'DAZZA_V3_ENABLED') return 'true';
    return null;
  },
}));

vi.mock('../db/client.js', () => ({
  db: {
    execute: vi.fn().mockResolvedValue([[], {}]),
  },
}));

vi.mock('drizzle-orm', () => ({
  sql: { raw: (s: string) => s },
}));

vi.mock('../dazza-v3-tools.js', () => ({
  V3_TOOL_DEFINITIONS_FLAT: [],
  executeV3Tool: vi.fn(),
}));

vi.mock('../sms.js', () => ({
  sendSms: vi.fn().mockResolvedValue(true),
  isSmsConfigured: vi.fn().mockReturnValue(false),
}));

vi.mock('../../email.js', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../dazza-attachment-service.js', () => ({
  buildUntrustedEvidenceBlock: vi.fn().mockReturnValue(''),
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { streamDazzaV3 } from '../dazza-v3-brain.js';
import { executeV3Tool } from '../dazza-v3-tools.js';

// ── SSE stream builder helpers ────────────────────────────────────────────────

/**
 * Encode a list of SSE event objects into a ReadableStream<Uint8Array>.
 * Each object is serialised as:
 *   data: <JSON>\n\n
 * A final [DONE] line is appended.
 *
 * @param events  Array of SSE event payloads (will be JSON-stringified)
 * @param noTrailingNewline  If true, the last event has no trailing \n (tests buffer flush)
 */
function makeSseStream(
  events: object[],
  noTrailingNewline = false,
): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const lines = events.map(e => `data: ${JSON.stringify(e)}\n\n`);
  lines.push('data: [DONE]\n\n');

  let raw = lines.join('');
  if (noTrailingNewline) {
    // Strip the final \n so the last event sits in the buffer without a newline
    raw = raw.trimEnd();
  }

  const bytes = enc.encode(raw);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

/** Build a minimal response.completed event */
function completedEvent(responseId = 'resp-001'): object {
  return {
    type: 'response.completed',
    response: {
      id: responseId,
      usage: { input_tokens: 10, output_tokens: 5 },
    },
  };
}

/** Build a text delta event */
function textDelta(delta: string, outputIndex = 0): object {
  return { type: 'response.output_text.delta', delta, output_index: outputIndex };
}

/** Build a function_call item-added event */
function fnCallAdded(name: string, callId: string, outputIndex = 0): object {
  return {
    type: 'response.output_item.added',
    output_index: outputIndex,
    item: { type: 'function_call', id: `item-${callId}`, call_id: callId, name },
  };
}

/** Build a function_call item-done event */
function fnCallDone(name: string, callId: string, args: object, outputIndex = 0): object {
  return {
    type: 'response.output_item.done',
    output_index: outputIndex,
    item: {
      type: 'function_call',
      id: `item-${callId}`,
      call_id: callId,
      name,
      arguments: JSON.stringify(args),
    },
  };
}

// ── Owner context fixture ─────────────────────────────────────────────────────

const OWNER: import('../dazza-v3-brain.js').V3OwnerContext = {
  userId: 'owner-001',
  email: 'daryl@iwillbuild.com',
  isPlatformOwner: true,
};

// ── Test helpers ──────────────────────────────────────────────────────────────

/**
 * Run streamDazzaV3 and collect tokens, tool calls, done meta, and error.
 * fetch is replaced with the provided response factory.
 */
async function runStream(
  fetchResponses: Array<() => Response>,
  toolResult = 'tool result text',
): Promise<{
  tokens: string;
  toolCalls: Array<{ name: string; status: 'running' | 'done' }>;
  done: { model: string; toolsUsed: string[]; conversationId: string } | null;
  error: string | null;
}> {
  const tokens: string[] = [];
  const toolCalls: Array<{ name: string; status: 'running' | 'done' }> = [];
  let done: { model: string; toolsUsed: string[]; conversationId: string } | null = null;
  let error: string | null = null;

  // Replace global fetch with a queue of responses
  let callIndex = 0;
  const fetchMock = vi.fn().mockImplementation(() => {
    const factory = fetchResponses[callIndex++];
    if (!factory) throw new Error(`Unexpected fetch call #${callIndex}`);
    return Promise.resolve(factory());
  });
  vi.stubGlobal('fetch', fetchMock);

  // Mock tool execution
  vi.mocked(executeV3Tool).mockResolvedValue(toolResult);

  await streamDazzaV3({
    ownerContext: OWNER,
    conversationId: null,
    userMessage: 'test message',
    mode: 'chat',
    onToken: (t) => tokens.push(t),
    onToolCall: (name, status) => toolCalls.push({ name, status }),
    onDone: (meta) => { done = meta; },
    onError: (msg) => { error = msg; },
  });

  vi.unstubAllGlobals();

  return { tokens: tokens.join(''), toolCalls, done, error };
}

/** Build a Response with an SSE body */
function sseResponse(events: object[], noTrailingNewline = false): Response {
  return new Response(makeSseStream(events, noTrailingNewline), {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('dazza-v3-brain — agentic loop', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. Normal one-round chat ───────────────────────────────────────────────

  it('normal one-round chat produces text and calls onDone', async () => {
    const { tokens, done, error } = await runStream([
      () => sseResponse([
        textDelta('Hello, Daryl.'),
        completedEvent(),
      ]),
    ]);

    expect(error).toBeNull();
    expect(tokens).toBe('Hello, Daryl.');
    expect(done).not.toBeNull();
    expect(done!.toolsUsed).toHaveLength(0);
  });

  // ── 2. Tool call followed by normal final text ─────────────────────────────

  it('tool call followed by final text produces text and records tool', async () => {
    const { tokens, toolCalls, done, error } = await runStream([
      // Round 0: model requests a tool call
      () => sseResponse([
        fnCallAdded('search_anatomy', 'call-001'),
        fnCallDone('search_anatomy', 'call-001', { query: 'test' }),
        completedEvent('resp-001'),
      ]),
      // Round 1: model writes final text after receiving tool output
      () => sseResponse([
        textDelta('Found the anatomy entry.'),
        completedEvent('resp-002'),
      ]),
    ]);

    expect(error).toBeNull();
    expect(tokens).toBe('Found the anatomy entry.');
    expect(toolCalls.some(tc => tc.name === 'search_anatomy' && tc.status === 'running')).toBe(true);
    expect(toolCalls.some(tc => tc.name === 'search_anatomy' && tc.status === 'done')).toBe(true);
    expect(done!.toolsUsed).toContain('search_anatomy');
  });

  // ── 3. Tool call on round 7 (last permitted) triggers forced synthesis ──────

  it('tool call on the eighth round triggers forced synthesis and returns text', async () => {
    // Build 8 rounds of tool calls (rounds 0–7), then a synthesis round
    const toolRounds: Array<() => Response> = [];

    for (let i = 0; i < 8; i++) {
      const callId = `call-${i.toString().padStart(3, '0')}`;
      const respId = `resp-${i.toString().padStart(3, '0')}`;
      // Each round uses a different query arg so dedup doesn't fire early
      toolRounds.push(() => sseResponse([
        fnCallAdded('search_anatomy', callId),
        fnCallDone('search_anatomy', callId, { query: `query-${i}` }),
        completedEvent(respId),
      ]));
    }

    // Forced synthesis round (tool_choice: none)
    toolRounds.push(() => sseResponse([
      textDelta('I reached the tool limit. Here is what I found.'),
      completedEvent('resp-synth'),
    ]));

    const { tokens, error } = await runStream(toolRounds);

    expect(error).toBeNull();
    expect(tokens).toContain('I reached the tool limit');
  });

  // ── 4. Unavailable anatomy snapshot produces a written explanation ─────────

  it('unavailable anatomy snapshot produces a written explanation', async () => {
    vi.mocked(executeV3Tool).mockResolvedValue('No active anatomy snapshot found.');

    const { tokens, error } = await runStream([
      // Round 0: model calls search_anatomy
      () => sseResponse([
        fnCallAdded('search_anatomy', 'call-001'),
        fnCallDone('search_anatomy', 'call-001', { query: 'dazza brain' }),
        completedEvent('resp-001'),
      ]),
      // Round 1: model writes explanation after receiving the "no snapshot" result
      () => sseResponse([
        textDelta('No active anatomy snapshot is available. Please upload one first.'),
        completedEvent('resp-002'),
      ]),
    ]);

    expect(error).toBeNull();
    expect(tokens).toContain('No active anatomy snapshot');
  });

  // ── 5. Repeated identical failed tool call stops safely ───────────────────

  it('repeated identical tool call triggers forced synthesis after second occurrence', async () => {
    // Both rounds call search_anatomy with identical args — dedup fires on round 1
    const { tokens, error } = await runStream([
      // Round 0: first call
      () => sseResponse([
        fnCallAdded('search_anatomy', 'call-001'),
        fnCallDone('search_anatomy', 'call-001', { query: 'same-query' }),
        completedEvent('resp-001'),
      ]),
      // Round 1: identical call — dedup fires, executes once more then forces synthesis
      () => sseResponse([
        fnCallAdded('search_anatomy', 'call-002'),
        fnCallDone('search_anatomy', 'call-002', { query: 'same-query' }),
        completedEvent('resp-002'),
      ]),
      // Forced synthesis
      () => sseResponse([
        textDelta('I detected a repeated tool call and stopped the loop.'),
        completedEvent('resp-synth'),
      ]),
    ]);

    expect(error).toBeNull();
    expect(tokens).toContain('repeated tool call');
  });

  // ── 6. Final SSE event without trailing newline is processed ──────────────

  it('final SSE event without trailing newline is processed via buffer flush', async () => {
    const { tokens, error } = await runStream([
      () => sseResponse([
        textDelta('Flushed from buffer.'),
        completedEvent(),
      ], /* noTrailingNewline= */ true),
    ]);

    expect(error).toBeNull();
    expect(tokens).toContain('Flushed from buffer');
  });

  // ── 7. Genuinely empty upstream completion returns a traceable error ───────

  it('genuinely empty upstream completion returns a traceable error reference', async () => {
    // OpenAI returns no text and no tool calls — the empty-response guard fires
    const { tokens, error } = await runStream([
      () => sseResponse([
        completedEvent(), // no text delta, no function call
      ]),
    ]);

    expect(tokens).toBe('');
    expect(error).not.toBeNull();
    // Error must contain a reference code (8 hex chars uppercase)
    expect(error).toMatch(/Reference: [0-9A-F]{8}/);
  });

});
