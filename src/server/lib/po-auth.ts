/**
 * po-auth.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared authorisation and validation helpers for Purchase Order handlers.
 *
 * Permission matrix (Gate 1):
 *
 *   Action          | owner | admin | staff (permInvoices=true) | staff (permInvoices=false)
 *   ─────────────────────────────────────────────────────────────────────────
 *   List POs        |  ✓    |  ✓    |  ✓ (no $ if !seeDollars)  |  ✗ 403
 *   Get PO detail   |  ✓    |  ✓    |  ✓ (no $ if !seeDollars)  |  ✗ 403
 *   Create PO       |  ✓    |  ✓    |  ✓                        |  ✗ 403
 *   Update PO       |  ✓    |  ✓    |  ✓                        |  ✗ 403
 *   Delete PO       |  ✓    |  ✓    |  ✗ (needs permDeleteRecords) |  ✗ 403
 *   Print/PDF       |  ✓    |  ✓    |  ✓ (needs seeDollars)     |  ✗ 403
 *
 * Dollar visibility:
 *   - permSeeDollars=false → 403 on detail GET and PDF (financial data)
 *   - List GET returns POs but strips rate/amount/subtotal/gst/total if !seeDollars
 *     (Gate 2 will implement the strip; Gate 1 returns 403 on detail)
 */

import type { Request, Response } from 'express';
import { db } from '../db/client.js';
import { profiles } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../lib/auth/auth.js';

export interface POProfile {
  id: number;
  userId: string;
  role: string;
  companyId: number;
  isOwner: boolean;
  isAdmin: boolean;
  canFinance: boolean;
  canSeeDollars: boolean;
  canDelete: boolean;
}

/**
 * Resolve the authenticated session and profile.
 * Returns null and writes the appropriate error response if auth fails.
 */
export async function resolvePOProfile(
  req: Request,
  res: Response,
): Promise<POProfile | null> {
  const auth = getAuth();
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
  }
  const session = await auth.api.getSession({ headers });
  if (!session?.user) {
    res.status(401).json({ error: 'Unauthorised' });
    return null;
  }

  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.userId, session.user.id),
  });
  if (!profile?.companyId) {
    res.status(403).json({ error: 'No company' });
    return null;
  }

  const isOwner = profile.role === 'owner';
  const isAdmin = isOwner || profile.role === 'admin' || profile.permAdmin === true;
  const canFinance = isAdmin || profile.permInvoices !== false;
  const canSeeDollars = isAdmin || profile.permSeeDollars !== false;
  const canDelete = isAdmin || profile.permDeleteRecords === true;

  return {
    id: profile.id,
    userId: session.user.id,
    role: profile.role,
    companyId: profile.companyId,
    isOwner,
    isAdmin,
    canFinance,
    canSeeDollars,
    canDelete,
  };
}

/**
 * Require Finance permission. Returns false and writes 403 if not allowed.
 */
export function requireFinance(profile: POProfile, res: Response): boolean {
  if (!profile.canFinance) {
    res.status(403).json({ error: 'Finance permission required' });
    return false;
  }
  return true;
}

/**
 * Require Finance + dollar-visibility permission (for detail/PDF endpoints).
 * Returns false and writes 403 if not allowed.
 */
export function requireFinanceAndDollars(profile: POProfile, res: Response): boolean {
  if (!profile.canFinance) {
    res.status(403).json({ error: 'Finance permission required' });
    return false;
  }
  if (!profile.canSeeDollars) {
    res.status(403).json({ error: 'Dollar visibility permission required' });
    return false;
  }
  return true;
}

/**
 * Require Finance + delete permission.
 * Returns false and writes 403 if not allowed.
 */
export function requireFinanceAndDelete(profile: POProfile, res: Response): boolean {
  if (!profile.canFinance) {
    res.status(403).json({ error: 'Finance permission required' });
    return false;
  }
  if (!profile.canDelete) {
    res.status(403).json({ error: 'Delete permission required' });
    return false;
  }
  return true;
}

// ── Status transition table ───────────────────────────────────────────────────

/**
 * Canonical status values for new operations.
 * Legacy 'paid' is readable but not a valid target for new transitions.
 */
export const VALID_STATUSES = ['draft', 'sent', 'completed', 'cancelled', 'paid'] as const;
export type POStatus = typeof VALID_STATUSES[number];

/**
 * Allowed transitions: from → Set<to>
 * 'paid' is a legacy read-only status — no transitions out of it.
 */
export const ALLOWED_TRANSITIONS: Record<string, Set<string>> = {
  draft:     new Set(['sent', 'cancelled']),
  sent:      new Set(['completed', 'cancelled']),
  completed: new Set(['cancelled']),
  cancelled: new Set([]),
  paid:      new Set([]),   // legacy — readable, no new transitions
};

/**
 * Validate a requested status transition.
 * Returns null if valid, or an error object with status code + message.
 */
export function validateTransition(
  currentStatus: string,
  newStatus: string,
): { code: 409 | 422; message: string } | null {
  if (!VALID_STATUSES.includes(newStatus as POStatus)) {
    return { code: 422, message: `Invalid status: ${newStatus}` };
  }
  if (newStatus === currentStatus) return null; // no-op, allowed
  const allowed = ALLOWED_TRANSITIONS[currentStatus] ?? new Set();
  if (!allowed.has(newStatus)) {
    return {
      code: 409,
      message: `Cannot transition from '${currentStatus}' to '${newStatus}'`,
    };
  }
  return null;
}

// ── Input validation helpers ──────────────────────────────────────────────────

export const MAX_LINES = 200;
export const MAX_DESCRIPTION_LEN = 1000;
export const MAX_UNIT_LEN = 50;

export interface ValidatedLine {
  progressLineId: number | null;
  description: string;
  qty: number;
  unit: string | null;
  rate: number;
  /** Server-computed: qty × rate (rounded to 2dp) */
  amount: number;
}

export interface LineValidationError {
  index: number;
  message: string;
}

/**
 * Validate and normalise PO line items.
 * Returns validated lines or an array of errors.
 */
export function validateLines(
  rawLines: unknown[],
): { lines: ValidatedLine[] } | { errors: LineValidationError[] } {
  if (!Array.isArray(rawLines) || rawLines.length === 0) {
    return { errors: [{ index: -1, message: 'At least one line item is required' }] };
  }
  if (rawLines.length > MAX_LINES) {
    return { errors: [{ index: -1, message: `Maximum ${MAX_LINES} line items allowed` }] };
  }

  const errors: LineValidationError[] = [];
  const lines: ValidatedLine[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i] as Record<string, unknown>;

    const desc = String(raw.description ?? '').trim();
    if (!desc) {
      errors.push({ index: i, message: 'Description is required' });
      continue;
    }
    if (desc.length > MAX_DESCRIPTION_LEN) {
      errors.push({ index: i, message: `Description too long (max ${MAX_DESCRIPTION_LEN} chars)` });
      continue;
    }

    const qty = Number(raw.qty ?? 1);
    if (!isFinite(qty) || qty < 0) {
      errors.push({ index: i, message: 'Quantity must be a non-negative finite number' });
      continue;
    }

    const rate = Number(raw.rate ?? 0);
    if (!isFinite(rate) || rate < 0) {
      errors.push({ index: i, message: 'Rate must be a non-negative finite number' });
      continue;
    }

    const unit = raw.unit != null ? String(raw.unit).trim().slice(0, MAX_UNIT_LEN) || null : null;

    // Server-computed amount — never trust browser value
    const amount = Math.round(qty * rate * 100) / 100;

    const progressLineId = raw.progressLineId != null
      ? parseInt(String(raw.progressLineId), 10)
      : null;
    if (progressLineId !== null && isNaN(progressLineId)) {
      errors.push({ index: i, message: 'Invalid progressLineId' });
      continue;
    }

    lines.push({ progressLineId, description: desc, qty, unit, rate, amount });
  }

  if (errors.length > 0) return { errors };
  return { lines };
}

/**
 * Compute PO totals from validated lines.
 * Returns subtotal (ex GST), GST (10%), and total (inc GST).
 */
export function computeTotals(lines: ValidatedLine[]): {
  subtotal: number;
  gst: number;
  total: number;
} {
  const subtotal = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
  const gst = Math.round(subtotal * 0.1 * 100) / 100;
  const total = Math.round((subtotal + gst) * 100) / 100;
  return { subtotal, gst, total };
}
