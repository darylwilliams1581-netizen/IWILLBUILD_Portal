/**
 * dazza-builder/conversation — tool-message sequencing tests
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests:
 * 1.  Fresh conversation with attachment — no history, user message only
 * 2.  One tool call and result — assistant+tool_calls followed by tool result
 * 3.  Multiple tool calls in one round — all results follow the assistant msg
 * 4.  Persist, reload and continue — only text turns survive the round-trip
 * 5.  History truncation across tool-call boundaries — groups are indivisible
 * 6.  Legacy conversation containing an orphan tool message — orphan removed
 * 7.  Tool failure followed by another user message — conversation stays usable
 */

import { describe, it, expect } from 'vitest';
import { sanitiseHistory } from '../conversation.js';
import type { OAIMessage } from '../conversation.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function user(content: string): OAIMessage {
  return { role: 'user', content };
}

function assistant(content: string | null, tool_calls?: OAIMessage extends { role: 'assistant' } ? OAIMessage['tool_calls'] : never): OAIMessage {
  return tool_calls?.length
    ? { role: 'assistant', content, tool_calls }
    : { role: 'assistant', content: content ?? '' };
}

function toolCall(id: string, name: string, args = '{}'): NonNullable<Extract<OAIMessage, { role: 'assistant' }>['tool_calls']>[number] {
  return { id, type: 'function', function: { name, arguments: args } };
}

function toolResult(tool_call_id: string, content: string): OAIMessage {
  return { role: 'tool', tool_call_id, content };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('sanitiseHistory — tool-message sequencing', () => {

  // ── Test 1: Fresh conversation with attachment ─────────────────────────────
  it('1. Fresh conversation: empty history returns empty array', () => {
    expect(sanitiseHistory([])).toEqual([]);
  });

  it('1b. Fresh conversation: single user message passes through unchanged', () => {
    const history: OAIMessage[] = [user('Hello, can you help me?')];
    expect(sanitiseHistory(history)).toEqual(history);
  });

  it('1c. Attachment evidence in user message is treated as plain user turn', () => {
    const msg = user('Review this doc.\n\n[UNTRUSTED_EVIDENCE]\nfilename: plan.docx\ncontent: ...\n[/UNTRUSTED_EVIDENCE]');
    expect(sanitiseHistory([msg])).toEqual([msg]);
  });

  // ── Test 2: One tool call and result ──────────────────────────────────────
  it('2. One tool call + result: complete group passes through unchanged', () => {
    const history: OAIMessage[] = [
      user('List all templates'),
      {
        role: 'assistant',
        content: null,
        tool_calls: [toolCall('call_abc', 'builder_list_templates', '{"builderType":"document"}')],
      },
      toolResult('call_abc', '{"ok":true,"data":[]}'),
      assistant('I found 0 templates.'),
    ];
    const result = sanitiseHistory(history);
    expect(result).toHaveLength(4);
    expect(result[1]).toMatchObject({ role: 'assistant', tool_calls: expect.arrayContaining([expect.objectContaining({ id: 'call_abc' })]) });
    expect(result[2]).toMatchObject({ role: 'tool', tool_call_id: 'call_abc' });
  });

  it('2b. Tool result tool_call_id is preserved exactly', () => {
    const id = 'call_exact_id_123';
    const history: OAIMessage[] = [
      user('Get template'),
      { role: 'assistant', content: null, tool_calls: [toolCall(id, 'builder_get_template', '{"templateId":1,"builderType":"document"}')]},
      toolResult(id, '{"ok":true,"data":{"id":1}}'),
    ];
    const result = sanitiseHistory(history);
    const toolMsg = result.find((m) => m.role === 'tool') as Extract<OAIMessage, { role: 'tool' }> | undefined;
    expect(toolMsg?.tool_call_id).toBe(id);
  });

  // ── Test 3: Multiple tool calls in one round ───────────────────────────────
  it('3. Multiple tool calls: all results must follow the assistant message', () => {
    const history: OAIMessage[] = [
      user('Get template and list versions'),
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          toolCall('call_1', 'builder_get_template', '{"templateId":1,"builderType":"document"}'),
          toolCall('call_2', 'builder_get_versions', '{"templateId":1,"builderType":"document"}'),
        ],
      },
      toolResult('call_1', '{"ok":true,"data":{"id":1}}'),
      toolResult('call_2', '{"ok":true,"data":[]}'),
      assistant('Here is the template and its versions.'),
    ];
    const result = sanitiseHistory(history);
    expect(result).toHaveLength(5);
    // Assistant tool_calls message is at index 1
    expect(result[1]).toMatchObject({ role: 'assistant' });
    expect((result[1] as Extract<OAIMessage, { role: 'assistant' }>).tool_calls).toHaveLength(2);
    // Tool results immediately follow
    expect(result[2]).toMatchObject({ role: 'tool', tool_call_id: 'call_1' });
    expect(result[3]).toMatchObject({ role: 'tool', tool_call_id: 'call_2' });
    // Final assistant text
    expect(result[4]).toMatchObject({ role: 'assistant', content: 'Here is the template and its versions.' });
  });

  it('3b. Partial tool results: incomplete group is removed entirely', () => {
    // call_2 result is missing — the whole group should be dropped.
    const history: OAIMessage[] = [
      user('Get template and list versions'),
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          toolCall('call_1', 'builder_get_template'),
          toolCall('call_2', 'builder_get_versions'),
        ],
      },
      toolResult('call_1', '{"ok":true}'),
      // call_2 result is absent
      assistant('Here is what I found.'),
    ];
    const result = sanitiseHistory(history);
    // The incomplete group (assistant+tool_calls + only one result) is dropped.
    // The final assistant text summary is kept.
    const toolMsgs = result.filter((m) => m.role === 'tool');
    const assistantToolCallMsgs = result.filter(
      (m) => m.role === 'assistant' && (m as Extract<OAIMessage, { role: 'assistant' }>).tool_calls?.length,
    );
    expect(toolMsgs).toHaveLength(0);
    expect(assistantToolCallMsgs).toHaveLength(0);
    // The plain user and final assistant text messages are retained.
    expect(result.some((m) => m.role === 'user')).toBe(true);
    expect(result.some((m) => m.role === 'assistant' && (m as Extract<OAIMessage, { role: 'assistant' }>).content === 'Here is what I found.')).toBe(true);
  });

  // ── Test 4: Persist, reload and continue ──────────────────────────────────
  it('4. After persist+reload, only plain user/assistant text turns remain', () => {
    // Simulate what loadHistory returns: only role+content rows from the DB.
    // Tool-call exchanges are never persisted.
    const reloaded: OAIMessage[] = [
      user('List templates'),
      assistant('I found 3 templates.'),
      user('Now add a heading block'),
    ];
    const result = sanitiseHistory(reloaded);
    // All three plain messages pass through unchanged.
    expect(result).toHaveLength(3);
    expect(result.every((m) => m.role === 'user' || m.role === 'assistant')).toBe(true);
    // No tool messages.
    expect(result.some((m) => m.role === 'tool')).toBe(false);
  });

  it('4b. Reloaded history can be extended with new tool-call group in-memory', () => {
    const reloaded: OAIMessage[] = [
      user('List templates'),
      assistant('I found 3 templates.'),
    ];
    const sanitised = sanitiseHistory(reloaded);
    // Simulate the orchestrator adding a new tool-call group in-memory.
    const extended: OAIMessage[] = [
      ...sanitised,
      user('Add a heading block'),
      {
        role: 'assistant',
        content: null,
        tool_calls: [toolCall('call_new', 'builder_propose_changes', '{}')],
      },
      toolResult('call_new', '{"ok":true}'),
    ];
    // sanitiseHistory on the extended array should keep everything.
    const result = sanitiseHistory(extended);
    expect(result).toHaveLength(5);
    expect(result[3]).toMatchObject({ role: 'assistant', tool_calls: expect.any(Array) });
    expect(result[4]).toMatchObject({ role: 'tool', tool_call_id: 'call_new' });
  });

  // ── Test 5: History truncation across tool-call boundaries ────────────────
  it('5. Truncation: tool-call groups are treated as indivisible units', () => {
    // Build a history that exceeds maxTurns when groups are counted individually.
    // maxTurns = 4 means we can fit at most 4 messages.
    // Group A: assistant(tool_calls) + tool_result = 2 messages
    // Group B: assistant(tool_calls) + tool_result = 2 messages
    // Plus 2 plain user messages = 6 total.
    // With maxTurns=4, we should get the last 4 messages as a valid sequence.
    const history: OAIMessage[] = [
      user('Turn 1'),
      {
        role: 'assistant',
        content: null,
        tool_calls: [toolCall('c1', 'builder_list_templates')],
      },
      toolResult('c1', '{"ok":true}'),
      user('Turn 2'),
      {
        role: 'assistant',
        content: null,
        tool_calls: [toolCall('c2', 'builder_get_template')],
      },
      toolResult('c2', '{"ok":true}'),
    ];
    const result = sanitiseHistory(history, 4);
    // The result must never start with a tool message.
    expect(result[0]?.role).not.toBe('tool');
    // Every tool message must be immediately preceded by an assistant tool_calls message.
    for (let i = 0; i < result.length; i++) {
      if (result[i].role === 'tool') {
        const prev = result[i - 1];
        expect(prev?.role).toBe('assistant');
        const toolCallId = (result[i] as Extract<OAIMessage, { role: 'tool' }>).tool_call_id;
        expect(
          (prev as Extract<OAIMessage, { role: 'assistant' }>).tool_calls?.some((tc) => tc.id === toolCallId),
        ).toBe(true);
      }
    }
  });

  it('5b. Truncation never splits an assistant+tool group', () => {
    // 3 plain messages + 1 group (2 msgs) = 5 total; maxTurns=3
    // Walking backwards: toolResult(cx) + assistant(tool_calls) = group of 2.
    // Then user C = 1 plain. Total kept = 3 (fits exactly).
    // The group IS included because 2 + 1 = 3 ≤ maxTurns.
    // The key invariant is that the group is never split — either both
    // assistant+tool are included or neither is.
    const history: OAIMessage[] = [
      user('A'),
      assistant('B'),
      user('C'),
      {
        role: 'assistant',
        content: null,
        tool_calls: [toolCall('cx', 'builder_get_template')],
      },
      toolResult('cx', '{"ok":true}'),
    ];
    const result = sanitiseHistory(history, 3);
    // The result must be a valid sequence — no orphaned tool messages.
    for (let i = 0; i < result.length; i++) {
      if (result[i].role === 'tool') {
        const prev = result[i - 1];
        expect(prev?.role).toBe('assistant');
        expect(
          (prev as Extract<OAIMessage, { role: 'assistant' }>).tool_calls?.some(
            (tc) => tc.id === (result[i] as Extract<OAIMessage, { role: 'tool' }>).tool_call_id,
          ),
        ).toBe(true);
      }
    }
    // The group is never split: if the tool result is present, the assistant
    // tool_calls message must also be present immediately before it.
    const hasToolResult = result.some((m) => m.role === 'tool');
    const hasAssistantToolCalls = result.some(
      (m) => m.role === 'assistant' && (m as Extract<OAIMessage, { role: 'assistant' }>).tool_calls?.length,
    );
    expect(hasToolResult).toBe(hasAssistantToolCalls);
  });

  // ── Test 6: Legacy orphan tool message ────────────────────────────────────
  it('6. Orphaned tool message (no preceding assistant tool_calls) is removed', () => {
    // Simulate a legacy row that somehow has role=tool without a preceding
    // assistant tool_calls message.
    const history: OAIMessage[] = [
      user('Hello'),
      assistant('Hi there!'),
      // Orphaned tool message — no preceding assistant tool_calls.
      toolResult('orphan_id', '{"ok":true}'),
      user('Can you help?'),
    ];
    const result = sanitiseHistory(history);
    expect(result.some((m) => m.role === 'tool')).toBe(false);
    // User and assistant text messages are preserved.
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ role: 'user', content: 'Hello' });
    expect(result[1]).toMatchObject({ role: 'assistant', content: 'Hi there!' });
    expect(result[2]).toMatchObject({ role: 'user', content: 'Can you help?' });
  });

  it('6b. Multiple orphaned tool messages are all removed', () => {
    const history: OAIMessage[] = [
      toolResult('o1', 'orphan 1'),
      toolResult('o2', 'orphan 2'),
      user('Start fresh'),
    ];
    const result = sanitiseHistory(history);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ role: 'user', content: 'Start fresh' });
  });

  it('6c. Tool message after plain assistant (no tool_calls) is treated as orphan', () => {
    const history: OAIMessage[] = [
      user('Question'),
      assistant('Answer'),          // plain assistant — no tool_calls
      toolResult('x', 'orphan'),    // this is an orphan
      user('Follow-up'),
    ];
    const result = sanitiseHistory(history);
    expect(result.some((m) => m.role === 'tool')).toBe(false);
    expect(result).toHaveLength(3);
  });

  // ── Test 7: Tool failure followed by another user message ─────────────────
  it('7. Tool failure result is kept when the assistant tool_calls message is present', () => {
    // A tool can return an error payload — that's still a valid tool result.
    const history: OAIMessage[] = [
      user('Get template 999'),
      {
        role: 'assistant',
        content: null,
        tool_calls: [toolCall('call_fail', 'builder_get_template', '{"templateId":999,"builderType":"document"}')],
      },
      toolResult('call_fail', '{"ok":false,"error":"Template not found"}'),
      assistant('I could not find template 999. Please check the ID.'),
      user('Try template 1 instead'),
    ];
    const result = sanitiseHistory(history);
    // The failed tool result is a valid result — the group is complete.
    expect(result).toHaveLength(5);
    expect(result[2]).toMatchObject({ role: 'tool', tool_call_id: 'call_fail', content: '{"ok":false,"error":"Template not found"}' });
    // Conversation continues normally.
    expect(result[4]).toMatchObject({ role: 'user', content: 'Try template 1 instead' });
  });

  it('7b. After tool failure, a new user message can start a fresh tool exchange', () => {
    const history: OAIMessage[] = [
      user('Get template 999'),
      {
        role: 'assistant',
        content: null,
        tool_calls: [toolCall('call_fail', 'builder_get_template')],
      },
      toolResult('call_fail', '{"ok":false,"error":"Not found"}'),
      assistant('Template 999 not found.'),
      user('Get template 1'),
      {
        role: 'assistant',
        content: null,
        tool_calls: [toolCall('call_ok', 'builder_get_template')],
      },
      toolResult('call_ok', '{"ok":true,"data":{"id":1}}'),
      assistant('Here is template 1.'),
    ];
    const result = sanitiseHistory(history);
    expect(result).toHaveLength(8);
    // Both tool exchanges are intact.
    const toolMsgs = result.filter((m) => m.role === 'tool');
    expect(toolMsgs).toHaveLength(2);
    // Verify sequencing: each tool message follows an assistant tool_calls message.
    for (let i = 0; i < result.length; i++) {
      if (result[i].role === 'tool') {
        const prev = result[i - 1];
        expect(prev?.role).toBe('assistant');
        expect((prev as Extract<OAIMessage, { role: 'assistant' }>).tool_calls?.length).toBeGreaterThan(0);
      }
    }
  });

  // ── Additional invariant checks ───────────────────────────────────────────
  it('Invariant: result never starts with a tool message', () => {
    const histories: OAIMessage[][] = [
      [toolResult('x', 'orphan')],
      [toolResult('x', 'orphan'), user('hello')],
      [
        { role: 'assistant', content: null, tool_calls: [toolCall('y', 'builder_list_templates')] },
        toolResult('y', '{}'),
      ],
    ];
    for (const h of histories) {
      const result = sanitiseHistory(h);
      if (result.length > 0) {
        expect(result[0].role, `First message role should not be 'tool'`).not.toBe('tool');
      }
    }
  });

  it('Invariant: every tool message follows an assistant tool_calls message with a matching id', () => {
    // OpenAI requires: all tool results for a given assistant tool_calls message
    // must appear consecutively after that assistant message.  The assistant
    // tool_calls message is immediately before the FIRST tool result of the group;
    // subsequent tool results in the same group are preceded by other tool results.
    const history: OAIMessage[] = [
      user('A'),
      { role: 'assistant', content: null, tool_calls: [toolCall('c1', 'builder_list_templates'), toolCall('c2', 'builder_get_template')] },
      toolResult('c1', '{}'),
      toolResult('c2', '{}'),
      assistant('Done.'),
      user('B'),
      { role: 'assistant', content: null, tool_calls: [toolCall('c3', 'builder_get_versions')] },
      toolResult('c3', '{}'),
    ];
    const result = sanitiseHistory(history);
    expect(result).toHaveLength(8);

    // For each tool message, find the nearest preceding assistant tool_calls
    // message and verify it contains a matching tool_call_id.
    for (let i = 0; i < result.length; i++) {
      if (result[i].role !== 'tool') continue;
      const toolCallId = (result[i] as Extract<OAIMessage, { role: 'tool' }>).tool_call_id;

      // Walk backwards to find the nearest assistant with tool_calls.
      let found = false;
      for (let j = i - 1; j >= 0; j--) {
        const m = result[j];
        if (m.role === 'assistant') {
          const tcs = (m as Extract<OAIMessage, { role: 'assistant' }>).tool_calls;
          if (tcs?.length) {
            expect(tcs.some((tc) => tc.id === toolCallId),
              `tool_call_id ${toolCallId} must be in the preceding assistant tool_calls`).toBe(true);
            found = true;
            break;
          }
          // Plain assistant message — stop searching (no tool_calls group here).
          break;
        }
        if (m.role === 'user') break; // crossed a turn boundary
      }
      expect(found, `tool message with id ${toolCallId} must have a matching assistant tool_calls`).toBe(true);
    }
  });
});
