/**
 * sse-session.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Minimal shared helper for Server-Sent Events (SSE) response sessions.
 *
 * Responsibilities:
 *   - Open the SSE connection (set headers)
 *   - Write structured JSON events
 *   - Guarantee at most one terminal event (done OR error — never both, never twice)
 *   - Close the response exactly once
 *   - Silently no-op after the client disconnects or the response has ended
 *
 * What this module does NOT do:
 *   - Auth, validation, or request parsing — those stay in the handler
 *   - Dazza reasoning, tool execution, heartbeat, or activity-state logic
 *   - Any business logic whatsoever
 *
 * Usage:
 *   const session = openSseSession(res);
 *   session.write({ type: 'token', content: '...' });
 *   session.done({ type: 'done', engine: 'v3', ... });
 *   // or on failure:
 *   session.error('Something went wrong', { conversationId: '...' });
 *   // finally block:
 *   session.close();
 */

import type { Response } from 'express';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Any structured SSE payload. */
export type SsePayload = Record<string, unknown>;

/**
 * Optional extras that can be merged into an error event.
 * All fields are optional — only include what is known at the call site.
 */
export interface SseErrorExtras {
  forbidden?: boolean;
  conversationId?: string;
  configFault?: boolean;
  [key: string]: unknown;
}

/** The handle returned by openSseSession. */
export interface SseSession {
  /**
   * Write any non-terminal SSE event.
   * No-ops if the connection is already closed or the client has disconnected.
   */
  write(payload: SsePayload): void;

  /**
   * Emit a terminal `done` event and mark the session as terminated.
   * No-ops if a terminal event has already been emitted.
   * The payload must include `type: 'done'` — callers supply the full shape.
   */
  done(payload: SsePayload): void;

  /**
   * Emit a terminal `error` event and mark the session as terminated.
   * No-ops if a terminal event has already been emitted.
   */
  error(message: string, extras?: SseErrorExtras): void;

  /**
   * Close the underlying response exactly once.
   * Safe to call multiple times — subsequent calls are no-ops.
   * Always call this from a `finally` block.
   */
  close(): void;

  /** True once a terminal event (done or error) has been emitted. */
  readonly terminated: boolean;
}

// ── Implementation ────────────────────────────────────────────────────────────

/**
 * Set the standard SSE response headers.
 * Must be called before any writes; must not be called after headers are sent.
 */
export function setSseHeaders(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
}

/**
 * Returns true when the response can no longer accept writes.
 * Checks both the writable-ended flag and the destroyed/closed socket state.
 */
function isResponseDead(res: Response): boolean {
  if (res.writableEnded || res.writableFinished) return true;
  // Express wraps a net.Socket; check destroyed as a belt-and-braces guard
  const socket = (res as unknown as { socket?: { destroyed?: boolean } }).socket;
  if (socket?.destroyed) return true;
  return false;
}

/**
 * Write a single structured SSE event to the response.
 * Returns false and no-ops if the response is dead.
 */
function rawWrite(res: Response, payload: SsePayload): boolean {
  if (isResponseDead(res)) return false;
  try {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
    return true;
  } catch {
    // Socket closed between the guard check and the write — swallow silently
    return false;
  }
}

/**
 * Open an SSE session on an already-authenticated, already-validated response.
 *
 * Preconditions (caller's responsibility):
 *   - Auth and request validation are complete
 *   - SSE headers have NOT yet been sent (call setSseHeaders first, or pass
 *     openHeaders: true to have this function set them)
 *
 * @param res          Express Response object
 * @param openHeaders  If true, setSseHeaders() is called automatically (default: false)
 */
export function openSseSession(res: Response, openHeaders = false): SseSession {
  if (openHeaders) {
    setSseHeaders(res);
  }

  let _terminated = false;

  return {
    get terminated() {
      return _terminated;
    },

    write(payload: SsePayload): void {
      if (_terminated) return;
      rawWrite(res, payload);
    },

    done(payload: SsePayload): void {
      if (_terminated) return;
      _terminated = true;
      rawWrite(res, payload);
    },

    error(message: string, extras: SseErrorExtras = {}): void {
      if (_terminated) return;
      _terminated = true;
      const payload: SsePayload = { type: 'error', message, ...extras };
      rawWrite(res, payload);
    },

    close(): void {
      if (!isResponseDead(res)) {
        try {
          res.end();
        } catch {
          // Already closed — swallow
        }
      }
    },
  };
}
