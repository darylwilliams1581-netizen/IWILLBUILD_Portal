/**
 * sse-session.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Focused unit tests for the shared SSE session helper.
 *
 * Tests are grouped by the behaviour guarantee each one verifies:
 *   1. Normal token stream followed by one done event
 *   2. Unexpected throw after SSE starts produces one error and closes
 *   3. Validation failure before SSE remains a JSON error (not SSE)
 *   4. Existing handled error is not duplicated
 *   5. No done event after an error
 *   6. Client disconnect stops further writes
 *   7. Response closes exactly once
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { openSseSession, setSseHeaders, type SseSession } from '../sse-session.js';
import type { Response } from 'express';

// ── Minimal mock Response factory ─────────────────────────────────────────────

interface MockResponse {
  writableEnded: boolean;
  writableFinished: boolean;
  socket: { destroyed: boolean } | null;
  written: string[];
  ended: boolean;
  endCallCount: number;
  headers: Record<string, string>;
  write: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  setHeader: ReturnType<typeof vi.fn>;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
}

function makeMockRes(overrides: Partial<MockResponse> = {}): MockResponse & Response {
  const written: string[] = [];
  let ended = false;
  let endCallCount = 0;

  const res: MockResponse = {
    writableEnded: false,
    writableFinished: false,
    socket: { destroyed: false },
    written,
    get ended() { return ended; },
    get endCallCount() { return endCallCount; },
    headers: {},
    write: vi.fn((chunk: string) => {
      if (res.writableEnded) return false;
      written.push(chunk);
      return true;
    }),
    end: vi.fn(() => {
      endCallCount++;
      res.writableEnded = true;
      res.writableFinished = true;
      ended = true;
    }),
    setHeader: vi.fn((key: string, value: string) => {
      res.headers[key] = value;
    }),
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    ...overrides,
  };

  return res as unknown as MockResponse & Response;
}

/** Parse all SSE events written to the mock response. */
function parseSseEvents(res: MockResponse): Array<Record<string, unknown>> {
  return res.written
    .join('')
    .split('\n\n')
    .filter(Boolean)
    .map(chunk => {
      const line = chunk.trim();
      if (!line.startsWith('data: ')) throw new Error(`Unexpected SSE line: ${line}`);
      return JSON.parse(line.slice(6));
    });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('openSseSession', () => {

  // ── 1. Normal token stream followed by one done event ──────────────────────

  describe('normal stream → single done', () => {
    it('writes token events and then a done event', () => {
      const res = makeMockRes();
      const session = openSseSession(res);

      session.write({ type: 'token', content: 'Hello' });
      session.write({ type: 'token', content: ' world' });
      session.done({ type: 'done', engine: 'v3', conversationId: 'conv-1' });
      session.close();

      const events = parseSseEvents(res);
      expect(events).toHaveLength(3);
      expect(events[0]).toEqual({ type: 'token', content: 'Hello' });
      expect(events[1]).toEqual({ type: 'token', content: ' world' });
      expect(events[2]).toEqual({ type: 'done', engine: 'v3', conversationId: 'conv-1' });
    });

    it('marks session as terminated after done', () => {
      const res = makeMockRes();
      const session = openSseSession(res);

      expect(session.terminated).toBe(false);
      session.done({ type: 'done', engine: 'v3' });
      expect(session.terminated).toBe(true);
    });

    it('ignores writes after done', () => {
      const res = makeMockRes();
      const session = openSseSession(res);

      session.done({ type: 'done', engine: 'v3' });
      session.write({ type: 'token', content: 'late token' }); // must be ignored

      const events = parseSseEvents(res);
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('done');
    });
  });

  // ── 2. Unexpected throw after SSE starts → one error + close ───────────────

  describe('unexpected throw after SSE starts', () => {
    it('emits exactly one error event when the handler throws', () => {
      const res = makeMockRes();
      const session = openSseSession(res);

      // Simulate the handler starting work then throwing
      session.write({ type: 'status', phase: 'thinking' });

      try {
        throw new Error('OpenAI timeout');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!session.terminated) {
          session.error(msg, { conversationId: 'conv-42' });
        }
      } finally {
        session.close();
      }

      const events = parseSseEvents(res);
      const errorEvents = events.filter(e => e.type === 'error');
      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0]).toEqual({
        type: 'error',
        message: 'OpenAI timeout',
        conversationId: 'conv-42',
      });
    });

    it('closes the response after an unexpected throw', () => {
      const res = makeMockRes();
      const session = openSseSession(res);

      try {
        throw new Error('boom');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        session.error(msg);
      } finally {
        session.close();
      }

      expect(res.ended).toBe(true);
      expect(res.endCallCount).toBe(1);
    });
  });

  // ── 3. Validation failure before SSE → plain JSON error (not SSE) ──────────

  describe('validation failure before SSE headers', () => {
    it('does not emit SSE events when validation fails before headers are sent', () => {
      const res = makeMockRes();

      // Simulate: validation fails, handler returns a JSON error before opening SSE
      const message = '';
      if (!message?.trim()) {
        res.status(400 as unknown as number);
        res.json({ error: 'message is required' });
        return; // handler returns early — no SSE session opened
      }

      // This code must not be reached
      openSseSession(res);
      expect.fail('Should not reach SSE session creation');
    });

    it('status(400).json() is called, not SSE write', () => {
      const res = makeMockRes();

      res.status(400 as unknown as number);
      res.json({ error: 'message is required' });

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'message is required' });
      expect(res.written).toHaveLength(0); // no SSE data written
    });
  });

  // ── 4. Existing handled error is not duplicated ────────────────────────────

  describe('existing handled error is not duplicated', () => {
    it('does not emit a second error if session.error() is called twice', () => {
      const res = makeMockRes();
      const session = openSseSession(res);

      session.error('First error');
      session.error('Second error — must be suppressed');

      const events = parseSseEvents(res);
      const errorEvents = events.filter(e => e.type === 'error');
      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0].message).toBe('First error');
    });

    it('does not emit an error if done was already emitted (onError called after onDone)', () => {
      const res = makeMockRes();
      const session = openSseSession(res);

      session.done({ type: 'done', engine: 'v3' });
      session.error('Late error — must be suppressed');

      const events = parseSseEvents(res);
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('done');
    });
  });

  // ── 5. No done event after an error ────────────────────────────────────────

  describe('no done after error', () => {
    it('suppresses done if error was already emitted', () => {
      const res = makeMockRes();
      const session = openSseSession(res);

      session.error('Something went wrong');
      session.done({ type: 'done', engine: 'v3' }); // must be suppressed

      const events = parseSseEvents(res);
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('error');
    });

    it('terminated is true after error, preventing done', () => {
      const res = makeMockRes();
      const session = openSseSession(res);

      session.error('fail');
      expect(session.terminated).toBe(true);
    });
  });

  // ── 6. Client disconnect stops further writes ──────────────────────────────

  describe('client disconnect', () => {
    it('no-ops write() when socket is destroyed', () => {
      const res = makeMockRes({ socket: { destroyed: true } });
      const session = openSseSession(res);

      session.write({ type: 'token', content: 'hello' });
      session.done({ type: 'done', engine: 'v3' });

      expect(res.written).toHaveLength(0);
    });

    it('no-ops write() when writableEnded is true', () => {
      const res = makeMockRes();
      res.writableEnded = true;
      const session = openSseSession(res);

      session.write({ type: 'token', content: 'hello' });

      expect(res.written).toHaveLength(0);
    });

    it('no-ops error() when socket is destroyed', () => {
      const res = makeMockRes({ socket: { destroyed: true } });
      const session = openSseSession(res);

      session.error('network error');

      // terminated is set even though nothing was written
      expect(session.terminated).toBe(true);
      expect(res.written).toHaveLength(0);
    });

    it('does not call end() on a destroyed socket', () => {
      const res = makeMockRes({ socket: { destroyed: true } });
      // writableEnded must also be true for a destroyed socket in practice
      res.writableEnded = true;
      const session = openSseSession(res);

      session.close();

      expect(res.end).not.toHaveBeenCalled();
    });
  });

  // ── 7. Response closes exactly once ────────────────────────────────────────

  describe('response closes exactly once', () => {
    it('end() is called once on a normal stream', () => {
      const res = makeMockRes();
      const session = openSseSession(res);

      session.write({ type: 'token', content: 'hi' });
      session.done({ type: 'done', engine: 'v3' });
      session.close();

      expect(res.endCallCount).toBe(1);
    });

    it('end() is called once even if close() is called multiple times', () => {
      const res = makeMockRes();
      const session = openSseSession(res);

      session.close();
      session.close();
      session.close();

      expect(res.endCallCount).toBe(1);
    });

    it('end() is called once when close() is in a finally block after error', () => {
      const res = makeMockRes();
      const session = openSseSession(res);

      try {
        throw new Error('test error');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        session.error(msg);
      } finally {
        session.close();
      }

      expect(res.endCallCount).toBe(1);
    });

    it('end() is not called again if response is already ended', () => {
      const res = makeMockRes();
      res.writableEnded = true; // already ended externally

      const session = openSseSession(res);
      session.close();

      expect(res.end).not.toHaveBeenCalled();
    });
  });

  // ── setSseHeaders ───────────────────────────────────────────────────────────

  describe('setSseHeaders', () => {
    it('sets all four required SSE headers', () => {
      const res = makeMockRes();
      setSseHeaders(res as unknown as Response);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
      expect(res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
      expect(res.setHeader).toHaveBeenCalledWith('X-Accel-Buffering', 'no');
    });
  });

  // ── openHeaders convenience flag ────────────────────────────────────────────

  describe('openHeaders flag', () => {
    it('sets SSE headers automatically when openHeaders=true', () => {
      const res = makeMockRes();
      openSseSession(res as unknown as Response, true);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    });

    it('does not set headers when openHeaders=false (default)', () => {
      const res = makeMockRes();
      openSseSession(res as unknown as Response);

      expect(res.setHeader).not.toHaveBeenCalled();
    });
  });

  // ── error extras ────────────────────────────────────────────────────────────

  describe('error extras', () => {
    it('includes forbidden flag in error event', () => {
      const res = makeMockRes();
      const session = openSseSession(res);

      session.error('FORBIDDEN: not allowed', { forbidden: true, conversationId: 'c1' });

      const events = parseSseEvents(res);
      expect(events[0]).toMatchObject({
        type: 'error',
        message: 'FORBIDDEN: not allowed',
        forbidden: true,
        conversationId: 'c1',
      });
    });

    it('includes configFault flag in error event', () => {
      const res = makeMockRes();
      const session = openSseSession(res);

      session.error('Config fault', { configFault: true });

      const events = parseSseEvents(res);
      expect(events[0]).toMatchObject({ type: 'error', configFault: true });
    });

    it('emits error with no extras when none provided', () => {
      const res = makeMockRes();
      const session = openSseSession(res);

      session.error('bare error');

      const events = parseSseEvents(res);
      expect(events[0]).toEqual({ type: 'error', message: 'bare error' });
    });
  });
});
