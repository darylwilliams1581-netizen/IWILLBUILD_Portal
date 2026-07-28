/**
 * write-gate.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Wraps any Express handler with requireWritableSubscription so that the
 * handler is only reached when the company is in a writable state.
 *
 * Usage in entry.ts:
 *   import { gated } from './lib/write-gate.js';
 *   app.post('/api/jobs', gated(jobs_post_handler));
 *
 * This avoids the need to list requireWritableSubscription inline on every
 * route registration (which would require touching 50+ lines in entry.ts).
 */
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { requireWritableSubscription } from './subscription-gate.js';

/**
 * Wrap a handler so it is only called when the company is writable.
 * Expired / cancelled / past_due companies receive HTTP 402.
 */
export function gated(handler: RequestHandler): RequestHandler[] {
  return [requireWritableSubscription, handler];
}
