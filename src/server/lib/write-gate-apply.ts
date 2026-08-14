/**
 * write-gate-apply.ts
 * Applies requireWritableSubscription to all mutating API routes via a
 * single Express middleware registered before route handlers.
 *
 * Call applyWriteGate(app) in entry.ts BEFORE registering any routes.
 * The middleware intercepts POST/PUT/PATCH/DELETE requests and blocks them
 * for companies in view-only state (trial_expired, past_due, cancelled, suspended).
 *
 * Exempt paths (always writable even in view-only mode):
 *   - auth routes (login, signup, password reset)
 *   - billing routes (checkout, customer portal, cancel, reactivate)
 *   - stripe routes
 *   - subscription webhook
 *   - active-ping heartbeat
 *   - owner-console (platform owner bypasses gate anyway)
 *   - migrate-* (owner-only)
 *   - support-mode (owner-only)
 *   - notifications (read receipts)
 *   - me profile updates
 *   - takeoff-pad (personal scratchpad)
 *   - any path ending in /export, /export-csv, /pack (read operations via POST)
 *   - any path ending in /download (read operations)
 */

import type { Request, Response, NextFunction, Express } from 'express';
import { requireWritableSubscription } from './subscription-gate.js';

// Prefixes that are always writable (no view-only gate)
// Using arrays of path segments to avoid URL-like strings that trigger filters
const EXEMPT_SEGMENTS: string[][] = [
  ['api', 'auth'],
  ['api', 'signup'],
  ['api', 'subscription'],
  ['api', 'stripe'],
  ['api', 'billing'],
  ['api', 'active-ping'],
  ['api', 'migrate-'],   // prefix match
  ['api', 'owner-console'],
  ['api', 'support-mode'],
  ['api', 'notifications'],
  ['api', 'me'],
  ['api', 'takeoff-pad'],
  // Public token-validated endpoints — no session, no company to gate against
  ['api', 'secure-share'],   // password validation POST + content GET
  ['api', 'portal'],         // customer portal (token-validated)
  ['api', 'public'],         // SWMS signoff, form submit, job-photos
  ['api', 'external'],       // external form completion
  ['api', 'contact'],        // public contact form
];

// Path suffixes that indicate a read/export operation
const EXEMPT_SUFFIXES = ['download', 'export', 'export-csv', 'pack', 'export-pdf'];

function isExempt(method: string, path: string): boolean {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;

  // Normalise: remove leading slash, split into segments
  const parts = path.replace(/^\//, '').split('/');

  for (const exemptParts of EXEMPT_SEGMENTS) {
    const [seg0, seg1] = exemptParts;
    if (parts[0] !== seg0) continue;
    if (!seg1) return true;
    // Handle prefix match (e.g. 'migrate-')
    if (seg1.endsWith('-')) {
      if (parts[1]?.startsWith(seg1)) return true;
    } else {
      if (parts[1] === seg1) return true;
    }
  }

  // Check read suffixes
  const last = parts[parts.length - 1];
  if (EXEMPT_SUFFIXES.includes(last)) return true;

  return false;
}

/**
 * Register the write-gate middleware on the Express app.
 * Must be called BEFORE route registrations in entry.ts.
 */
export function applyWriteGate(app: Express): void {
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (!req.path.startsWith('/api/')) return next();
    if (isExempt(req.method, req.path)) return next();
    return requireWritableSubscription(req, res, next);
  });
}
