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

// ── Activity indicator — onStatus / onHeartbeat callbacks ─────────────────────

describe('dazza-v3-brain — activity indicator callbacks', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * Extended runStream that also captures onStatus and onHeartbeat events.
   */
  async function runStreamWithActivity(
    fetchResponses: Array<() => Response>,
    toolResult = 'tool result text',
  ): Promise<{
    tokens: string;
    statuses: Array<{ phase: string; label: string }>;
    heartbeats: number[];
    done: { model: string; toolsUsed: string[]; conversationId: string } | null;
    error: string | null;
  }> {
    const tokens: string[] = [];
    const statuses: Array<{ phase: string; label: string }> = [];
    const heartbeats: number[] = [];
    let done: { model: string; toolsUsed: string[]; conversationId: string } | null = null;
    let error: string | null = null;

    let callIndex = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      const factory = fetchResponses[callIndex++];
      if (!factory) throw new Error(`Unexpected fetch call #${callIndex}`);
      return Promise.resolve(factory());
    }));
    vi.mocked(executeV3Tool).mockResolvedValue(toolResult);

    const streamPromise = streamDazzaV3({
      ownerContext: OWNER,
      conversationId: null,
      userMessage: 'test message',
      mode: 'chat',
      onToken: (t) => tokens.push(t),
      onToolCall: () => {},
      onDone: (meta) => { done = meta; },
      onError: (msg) => { error = msg; },
      onStatus: (phase, label) => statuses.push({ phase, label }),
      onHeartbeat: (elapsedMs) => heartbeats.push(elapsedMs),
    });

    // Advance fake timers to trigger heartbeats
    await vi.runAllTimersAsync();
    await streamPromise;

    vi.unstubAllGlobals();
    return { tokens: tokens.join(''), statuses, heartbeats, done, error };
  }

  // ── A1. thinking status emitted before first token ─────────────────────────

  it('emits thinking status before first token arrives', async () => {
    const { statuses, error } = await runStreamWithActivity([
      () => sseResponse([
        textDelta('Hello from Dazza.'),
        completedEvent(),
      ]),
    ]);

    expect(error).toBeNull();
    const phases = statuses.map((s) => s.phase);
    // thinking must appear before writing
    const thinkingIdx = phases.indexOf('thinking');
    const writingIdx  = phases.indexOf('writing');
    expect(thinkingIdx).toBeGreaterThanOrEqual(0);
    expect(writingIdx).toBeGreaterThan(thinkingIdx);
  });

  // ── A2. writing status emitted on first token ──────────────────────────────

  it('emits writing status when first token arrives', async () => {
    const { statuses, tokens, error } = await runStreamWithActivity([
      () => sseResponse([
        textDelta('Token one.'),
        completedEvent(),
      ]),
    ]);

    expect(error).toBeNull();
    expect(tokens).toContain('Token one');
    expect(statuses.some((s) => s.phase === 'writing')).toBe(true);
  });

  // ── A3. using_tool status emitted around tool calls ────────────────────────

  it('emits using_tool then thinking around a tool call', async () => {
    vi.mocked(executeV3Tool).mockResolvedValue('tool output');

    const { statuses, error } = await runStreamWithActivity([
      // Round 0: tool call
      () => sseResponse([
        fnCallAdded('v3_get_job', 'call-001'),
        fnCallDone('v3_get_job', 'call-001', { jobId: '1' }),
        completedEvent('resp-001'),
      ]),
      // Round 1: synthesis
      () => sseResponse([
        textDelta('Job found.'),
        completedEvent('resp-002'),
      ]),
    ]);

    expect(error).toBeNull();
    const phases = statuses.map((s) => s.phase);
    expect(phases).toContain('using_tool');
    // After tool result, thinking must appear again before writing
    const toolIdx    = phases.lastIndexOf('using_tool');
    const thinkAfter = phases.slice(toolIdx + 1).indexOf('thinking');
    expect(thinkAfter).toBeGreaterThanOrEqual(0);
  });

  // ── A4. Heartbeats fire every 10 s ────────────────────────────────────────

  it('fires heartbeats every 10 seconds while active', async () => {
    // Use a slow stream that takes time — we advance fake timers
    let resolveStream!: () => void;
    const slowStream = new ReadableStream<Uint8Array>({
      start(controller) {
        const enc = new TextEncoder();
        // Emit one token immediately
        controller.enqueue(enc.encode(`data: ${JSON.stringify(textDelta('Hi'))}\n\n`));
        // Hold the stream open until resolveStream() is called
        new Promise<void>((res) => { resolveStream = res; }).then(() => {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(completedEvent())}\n\n`));
          controller.close();
        });
      },
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(slowStream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
    ));
    vi.mocked(executeV3Tool).mockResolvedValue('');

    const heartbeats: number[] = [];
    const streamPromise = streamDazzaV3({
      ownerContext: OWNER,
      conversationId: null,
      userMessage: 'slow test',
      mode: 'chat',
      onToken: () => {},
      onToolCall: () => {},
      onDone: () => {},
      onError: () => {},
      onHeartbeat: (ms) => heartbeats.push(ms),
    });

    // Advance 25 s — should produce 2 heartbeats (at 10 s and 20 s)
    await vi.advanceTimersByTimeAsync(25_000);
    resolveStream();
    await streamPromise;
    vi.unstubAllGlobals();

    expect(heartbeats.length).toBeGreaterThanOrEqual(2);
  });

  // ── A5. Heartbeat timer cleared after completion ───────────────────────────

  it('heartbeat timer is cleared after done — no extra heartbeats fire', async () => {
    const heartbeats: number[] = [];

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      sseResponse([textDelta('Done.'), completedEvent()])
    ));
    vi.mocked(executeV3Tool).mockResolvedValue('');

    await streamDazzaV3({
      ownerContext: OWNER,
      conversationId: null,
      userMessage: 'quick test',
      mode: 'chat',
      onToken: () => {},
      onToolCall: () => {},
      onDone: () => {},
      onError: () => {},
      onHeartbeat: (ms) => heartbeats.push(ms),
    });

    const countAfterDone = heartbeats.length;
    // Advance another 30 s — no new heartbeats should fire
    await vi.advanceTimersByTimeAsync(30_000);
    expect(heartbeats.length).toBe(countAfterDone);

    vi.unstubAllGlobals();
  });

  // ── A6. Status callbacks never include prompts or secrets ─────────────────

  it('status labels never include the user message or tool result contents', async () => {
    vi.mocked(executeV3Tool).mockResolvedValue('SECRET_TOOL_RESULT_CONTENT');

    const { statuses } = await runStreamWithActivity([
      () => sseResponse([
        fnCallAdded('v3_get_job', 'call-002'),
        fnCallDone('v3_get_job', 'call-002', { jobId: '42' }),
        completedEvent('resp-003'),
      ]),
      () => sseResponse([
        textDelta('Answer.'),
        completedEvent('resp-004'),
      ]),
    ]);

    for (const s of statuses) {
      expect(s.label).not.toContain('SECRET_TOOL_RESULT_CONTENT');
      expect(s.label).not.toContain('test message');
      expect(s.label).not.toContain('jobId');
    }
  });

  // ── A7. Normal non-tool chat still works (no regression) ──────────────────

  it('normal non-tool chat produces thinking → writing and no using_tool', async () => {
    const { statuses, tokens, error } = await runStreamWithActivity([
      () => sseResponse([
        textDelta('Simple answer.'),
        completedEvent(),
      ]),
    ]);

    expect(error).toBeNull();
    expect(tokens).toBe('Simple answer.');
    const phases = statuses.map((s) => s.phase);
    expect(phases).toContain('thinking');
    expect(phases).toContain('writing');
    expect(phases).not.toContain('using_tool');
  });

});
