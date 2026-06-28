/**
 * useSubscriptionGate
 * ─────────────────────────────────────────────────────────────────────────────
 * Fetches the company's subscription status and exposes:
 *
 *   isViewOnly        — true when writes are blocked (trial_expired, cancelled,
 *                       suspended, past_due after grace)
 *   isCancelScheduled — true when cancel_at_period_end (full access, warning only)
 *   isPastDueWarning  — true when past_due within grace period (full access, warning)
 *   status            — the raw subscription status string
 *   isLoading         — true while the initial fetch is in flight
 *   currentPeriodEnd  — ISO string of when the billing period / access ends
 *   graceDaysLeft     — days left in past-due grace period (null when not past_due)
 *
 * Results are cached for 60 seconds so multiple components don't hammer the API.
 */

import { useState, useEffect } from 'react';

export type SubscriptionStatus =
  | 'active'
  | 'trial'
  | 'trial_expired'
  | 'cancel_at_period_end'
  | 'cancelled'
  | 'past_due'
  | 'suspended'
  | 'no_company';

export interface SubscriptionGateResult {
  isViewOnly: boolean;
  /** Cancellation is scheduled but period hasn't ended — full access, show warning */
  isCancelScheduled: boolean;
  /** Past due within 7-day grace period — full access, show warning */
  isPastDueWarning: boolean;
  status: SubscriptionStatus | null;
  isLoading: boolean;
  daysLeft: number | null;
  graceDaysLeft: number | null;
  plan: string | null;
  currentPeriodEnd: string | null;
}

const VIEW_ONLY_STATUSES: ReadonlySet<string> = new Set([
  'trial_expired',
  'cancelled',
  'suspended',
]);

// ── Module-level cache ────────────────────────────────────────────────────────

interface CacheEntry {
  status: SubscriptionStatus;
  isViewOnly: boolean;
  isCancelScheduled: boolean;
  isPastDueWarning: boolean;
  daysLeft: number | null;
  graceDaysLeft: number | null;
  plan: string | null;
  currentPeriodEnd: string | null;
  fetchedAt: number;
}

let _cache: CacheEntry | null = null;
let _inflight: Promise<CacheEntry> | null = null;
const CACHE_TTL_MS = 60_000;

interface ApiResponse {
  status?: string;
  daysLeft?: number | null;
  graceDaysLeft?: number | null;
  plan?: string;
  currentPeriodEnd?: string | null;
  isViewOnly?: boolean;
}

async function fetchStatus(): Promise<CacheEntry> {
  if (_inflight) return _inflight;

  _inflight = fetch('/api/subscription/status', { credentials: 'include' })
    .then((r) => (r.ok ? r.json() : null))
    .then((data: ApiResponse | null) => {
      const status = (data?.status ?? 'active') as SubscriptionStatus;
      const isViewOnly = data?.isViewOnly ?? VIEW_ONLY_STATUSES.has(status);
      // past_due is view-only only when graceDaysLeft === 0
      const graceDaysLeft = data?.graceDaysLeft ?? null;
      const isPastDueWarning = status === 'past_due' && !isViewOnly;
      const isCancelScheduled = status === 'cancel_at_period_end';

      const entry: CacheEntry = {
        status,
        isViewOnly,
        isCancelScheduled,
        isPastDueWarning,
        daysLeft: data?.daysLeft ?? null,
        graceDaysLeft,
        plan: data?.plan ?? null,
        currentPeriodEnd: data?.currentPeriodEnd ?? null,
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
        isCancelScheduled: false,
        isPastDueWarning: false,
        daysLeft: null,
        graceDaysLeft: null,
        plan: null,
        currentPeriodEnd: null,
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
    isCancelScheduled: false,
    isPastDueWarning: false,
    status: null,
    isLoading: true,
    daysLeft: null,
    graceDaysLeft: null,
    plan: null,
    currentPeriodEnd: null,
  });

  useEffect(() => {
    if (_cache && Date.now() - _cache.fetchedAt < CACHE_TTL_MS) {
      setResult({ ..._cache, isLoading: false });
      return;
    }

    fetchStatus().then((entry) => {
      setResult({ ...entry, isLoading: false });
    });
  }, []);

  return result;
}
