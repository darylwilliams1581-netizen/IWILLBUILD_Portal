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
 *
 * Public token-validated endpoints (no session, no company to gate against):
 *   - POST /api/secure-share/:token  — password validation only (NOT /api/secure-share which creates links)
 *   - POST /api/public/swms/:token/signoff
 *   - POST /api/public/form/:token/submit
 *   - POST /api/external/form/:token
 *   - POST /api/portal/**
 *   - POST /api/contact
 */

import type { Request, Response, NextFunction, Express } from 'express';
import { requireWritableSubscription } from './subscription-gate.js';

// ── Prefix-based exemptions ───────────────────────────────────────────────────
// These exempt ALL methods under the given /api/<seg1> prefix.
// Only add a prefix here when EVERY write route under it is either
// authenticated-but-subscription-exempt, or is also covered by a specific
// regex exemption below.
const EXEMPT_PREFIXES: string[] = [
  'auth',
  'signup',
  'subscription',
  'stripe',
  'billing',
  'active-ping',
  'owner-console',
  'support-mode',
  'notifications',
  'me',
  'takeoff-pad',
  'developer',   // seed / test endpoints — no session, no company to gate
];

// ── Specific public-POST exemptions ───────────────────────────────────────────
// These are unauthenticated endpoints that have no session and therefore no
// company subscription to gate against. Each entry is a regex tested against
// the full path (e.g. /api/secure-share/TOKEN).
//
// IMPORTANT: POST /api/secure-share (link creation) is NOT listed here —
// it requires authentication and subscription access.
const PUBLIC_POST_PATTERNS: RegExp[] = [
  // Password validation for a specific share token — NOT the create-link endpoint
  /^\/api\/secure-share\/[^/]{20,}$/,
  // SWMS public sign-off
  /^\/api\/public\/swms\/[^/]+\/signoff$/,
  // Public form submission
  /^\/api\/public\/form\/[^/]+\/submit$/,
  // Legacy external form completion
  /^\/api\/external\/form\/[^/]+$/,
  // Customer portal (token-validated, no staff session)
  /^\/api\/portal\//,
  // Public contact form
  /^\/api\/contact$/,
];

// Path suffixes that indicate a read/export operation delivered via POST
const EXEMPT_SUFFIXES = ['download', 'export', 'export-csv', 'pack', 'export-pdf'];

function isExempt(method: string, path: string): boolean {
  // GET/HEAD/OPTIONS are never write-gated
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;

  // Normalise: remove leading slash, split into segments
  // path here is the full Express path e.g. /api/secure-share/TOKEN
  const parts = path.replace(/^\//, '').split('/');
  // parts[0] === 'api', parts[1] === first segment after /api/

  // Prefix exemptions — check parts[1]
  const seg1 = parts[1] ?? '';
  for (const prefix of EXEMPT_PREFIXES) {
    if (prefix.endsWith('-')) {
      if (seg1.startsWith(prefix)) return true;
    } else {
      if (seg1 === prefix) return true;
    }
  }
  // Handle migrate- prefix (owner-only)
  if (seg1.startsWith('migrate-')) return true;

  // Read-suffix exemptions
  const last = parts[parts.length - 1];
  if (EXEMPT_SUFFIXES.includes(last)) return true;

  // Specific public-POST exemptions — only for POST/PUT/PATCH/DELETE
  if (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE') {
    for (const pattern of PUBLIC_POST_PATTERNS) {
      if (pattern.test(path)) return true;
    }
  }

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
