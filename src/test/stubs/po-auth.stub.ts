/**
 * Test stub for src/server/lib/po-auth.ts
 *
 * Replaces the real po-auth module in Vitest runs so that handler unit tests
 * can control auth/permission outcomes without a live DB or auth service.
 *
 * Usage in tests:
 *   import { __setMockProfile } from '@/test/stubs/po-auth.stub';
 *   __setMockProfile(null);           // → 401
 *   __setMockProfile({ canFinance: false, ... }); // → 403 from requireFinance
 */

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

let _profile: POProfile | null = null;

/** Called by tests to set the profile returned by resolvePOProfile. */
export function __setMockProfile(p: POProfile | null) {
  _profile = p;
}

export async function resolvePOProfile(
  _req: unknown,
  res: { status: (n: number) => { json: (b: unknown) => unknown } },
): Promise<POProfile | null> {
  if (!_profile) {
    res.status(401).json({ error: 'Unauthorised' });
    return null;
  }
  return _profile;
}

export function requireFinance(
  profile: POProfile,
  res: { status: (n: number) => { json: (b: unknown) => unknown } },
): boolean {
  if (!profile.canFinance) {
    res.status(403).json({ error: 'Finance permission required' });
    return false;
  }
  return true;
}

export function requireFinanceAndDollars(
  profile: POProfile,
  res: { status: (n: number) => { json: (b: unknown) => unknown } },
): boolean {
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

export function requireFinanceAndDelete(
  profile: POProfile,
  res: { status: (n: number) => { json: (b: unknown) => unknown } },
): boolean {
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

export function validateTransition(
  current: string,
  next: string,
): { code: number; message: string } | null {
  const VALID = ['draft', 'sent', 'completed', 'cancelled', 'paid'];
  if (!VALID.includes(next)) return { code: 422, message: `Invalid status: ${next}` };
  if (next === current) return null;
  const TRANSITIONS: Record<string, string[]> = {
    draft: ['sent', 'cancelled'],
    sent: ['completed', 'cancelled'],
    completed: ['cancelled'],
    cancelled: [],
    paid: [],
  };
  if (!(TRANSITIONS[current] ?? []).includes(next)) {
    return { code: 409, message: `Cannot transition from '${current}' to '${next}'` };
  }
  return null;
}

export const ALLOWED_TRANSITIONS: Record<string, Set<string>> = {
  draft: new Set(['sent', 'cancelled']),
  sent: new Set(['completed', 'cancelled']),
  completed: new Set(['cancelled']),
  cancelled: new Set([]),
  paid: new Set([]),
};

export const MAX_LINES = 200;

export function validateLines(lines: unknown[]): {
  errors?: Array<{ index: number; message: string }>;
  lines?: Array<{ progressLineId: unknown; description: string; qty: number; unit: null; rate: number; amount: number }>;
} {
  if (!lines.length) return { errors: [{ index: -1, message: 'At least one line required' }] };
  return {
    lines: lines.map((l: unknown) => {
      const r = l as Record<string, unknown>;
      const qty = Number(r.qty ?? 1);
      const rate = Number(r.rate ?? 0);
      return {
        progressLineId: r.progressLineId ?? null,
        description: String(r.description ?? ''),
        qty,
        unit: null,
        rate,
        amount: Math.round(qty * rate * 100) / 100,
      };
    }),
  };
}

export function computeTotals(lines: Array<{ amount: number }>): {
  subtotal: number; gst: number; total: number;
} {
  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  const gst = Math.round(subtotal * 0.1 * 100) / 100;
  return { subtotal, gst, total: subtotal + gst };
}
