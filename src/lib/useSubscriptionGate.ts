/**
 * useSubscriptionGate
 * ─────────────────────────────────────────────────────────────────────────────
 * Fetches the company's subscription status and exposes:
 *
 *   isViewOnly   — true when the company is in trial_expired, past_due,
 *                  cancelled, or suspended state
 *   status       — the raw subscription status string
 *   isLoading    — true while the initial fetch is in flight
 *
 * The hook caches the result in module-level state so multiple components
 * can call it without triggering duplicate requests.
 *
 * Usage:
 *   const { isViewOnly, status } = useSubscriptionGate();
 *   <button disabled={isViewOnly} title={isViewOnly ? 'Subscribe to continue' : undefined}>
 *     Create Job
 *   </button>
 */

import { useState, useEffect } from 'react';

export type SubscriptionStatus =
  | 'active'
  | 'trial'
  | 'trial_expired'
  | 'cancelled'
  | 'past_due'
  | 'cancel_pending'
  | 'suspended'
  | 'no_company';

export interface SubscriptionGateResult {
  isViewOnly: boolean;
  status: SubscriptionStatus | null;
  isLoading: boolean;
  daysLeft: number | null;
  plan: string | null;
}

const VIEW_ONLY_STATUSES: ReadonlySet<string> = new Set([
  'trial_expired',
  'past_due',
  'cancelled',
  'suspended',
]);

// ── Module-level cache ────────────────────────────────────────────────────────
// Shared across all hook instances so we only fetch once per page load.

interface CacheEntry {
  status: SubscriptionStatus;
  isViewOnly: boolean;
  daysLeft: number | null;
  plan: string | null;
  fetchedAt: number;
}

let _cache: CacheEntry | null = null;
let _inflight: Promise<CacheEntry> | null = null;
const CACHE_TTL_MS = 60_000; // 1 minute

async function fetchStatus(): Promise<CacheEntry> {
  if (_inflight) return _inflight;

  _inflight = fetch('/api/subscription/status', { credentials: 'include' })
    .then((r) => (r.ok ? r.json() : null))
    .then((data: { status?: string; daysLeft?: number | null; plan?: string } | null) => {
      const status = (data?.status ?? 'active') as SubscriptionStatus;
      const entry: CacheEntry = {
        status,
        isViewOnly: VIEW_ONLY_STATUSES.has(status),
        daysLeft: data?.daysLeft ?? null,
        plan: data?.plan ?? null,
        fetchedAt: Date.now(),
      };
      _cache = entry;
      _inflight = null;
      return entry;
    })
    .catch(() => {
      _inflight = null;
      const fallback: CacheEntry = {
        status: 'active',
        isViewOnly: false,
        daysLeft: null,
        plan: null,
        fetchedAt: Date.now(),
      };
      return fallback;
    });

  return _inflight;
}

/** Invalidate the cache (call after a successful subscription change). */
export function invalidateSubscriptionCache(): void {
  _cache = null;
  _inflight = null;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useSubscriptionGate(): SubscriptionGateResult {
  const [result, setResult] = useState<SubscriptionGateResult>({
    isViewOnly: false,
    status: null,
    isLoading: true,
    daysLeft: null,
    plan: null,
  });

  useEffect(() => {
    // Use cache if fresh
    if (_cache && Date.now() - _cache.fetchedAt < CACHE_TTL_MS) {
      setResult({
        isViewOnly: _cache.isViewOnly,
        status: _cache.status,
        isLoading: false,
        daysLeft: _cache.daysLeft,
        plan: _cache.plan,
      });
      return;
    }

    fetchStatus().then((entry) => {
      setResult({
        isViewOnly: entry.isViewOnly,
        status: entry.status,
        isLoading: false,
        daysLeft: entry.daysLeft,
        plan: entry.plan,
      });
    });
  }, []);

  return result;
}
