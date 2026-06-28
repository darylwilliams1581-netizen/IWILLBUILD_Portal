/**
 * Subscription gate middleware.
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides:
 *   getSubscriptionInfo(req)          — resolve subscription state for a user
 *   requireActiveSubscription         — blocks ALL access when expired (old gate)
 *   requireWritableSubscription       — blocks WRITE actions when expired;
 *                                       allows read/download/billing always
 *
 * VIEW-ONLY STATES (write actions blocked, reads allowed):
 *   trial_expired | past_due | cancelled | suspended
 *
 * ALWAYS WRITABLE (bypass view-only gate):
 *   active | trial (still running) | cancel_pending (paid, just cancelling)
 *   platform owner (role === 'owner') — always bypasses
 *
 * Usage in entry.ts:
 *   import { requireWritableSubscription } from './lib/subscription-gate.js';
 *   app.post('/api/jobs', requireWritableSubscription, handler);
 */
import type { Request, Response, NextFunction } from 'express';
import { db } from '../db/client.js';
import { profiles, companies } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../lib/auth/auth.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type SubscriptionStatus =
  | 'active'
  | 'trial'
  | 'trial_expired'
  | 'cancelled'
  | 'past_due'
  | 'cancel_pending'
  | 'suspended'
  | 'no_company';

export interface SubscriptionInfo {
  status: SubscriptionStatus;
  plan: string;
  trialEndsAt: Date | null;
  daysLeft: number | null;
  /** true when the company is in a view-only state (expired/cancelled/past_due/suspended) */
  isViewOnly: boolean;
  // Billing management fields (null when not on a paid subscription)
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}

/** Statuses that put a company into view-only mode */
const VIEW_ONLY_STATUSES: ReadonlySet<SubscriptionStatus> = new Set([
  'trial_expired',
  'past_due',
  'cancelled',
  'suspended',
]);

// ── Core resolver ─────────────────────────────────────────────────────────────

/** Resolve subscription status for the authenticated user's company. */
export async function getSubscriptionInfo(req: Request): Promise<SubscriptionInfo | null> {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return null;

    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, session.user.id),
    });
    if (!profile?.companyId) {
      return {
        status: 'no_company', plan: 'none', isViewOnly: false,
        trialEndsAt: null, daysLeft: null,
        currentPeriodEnd: null, cancelAtPeriodEnd: false,
        stripeCustomerId: null, stripeSubscriptionId: null,
      };
    }

    // Platform owner bypasses all gates — always writable
    if (profile.role === 'owner') {
      return {
        status: 'active', plan: 'owner', isViewOnly: false,
        trialEndsAt: null, daysLeft: null,
        currentPeriodEnd: null, cancelAtPeriodEnd: false,
        stripeCustomerId: null, stripeSubscriptionId: null,
      };
    }

    const company = await db.query.companies.findFirst({
      where: eq(companies.id, profile.companyId),
    });
    if (!company) {
      return {
        status: 'no_company', plan: 'none', isViewOnly: false,
        trialEndsAt: null, daysLeft: null,
        currentPeriodEnd: null, cancelAtPeriodEnd: false,
        stripeCustomerId: null, stripeSubscriptionId: null,
      };
    }

    const subStatus = (company.subscriptionStatus ?? 'trial') as string;
    const trialEndsAt = company.trialEndsAt ? new Date(company.trialEndsAt) : null;
    const currentPeriodEnd = (company as unknown as { currentPeriodEnd?: Date | null }).currentPeriodEnd
      ? new Date((company as unknown as { currentPeriodEnd: Date }).currentPeriodEnd)
      : null;
    const cancelAtPeriodEnd = Boolean((company as unknown as { cancelAtPeriodEnd?: boolean }).cancelAtPeriodEnd);
    const stripeCustomerId = company.stripeCustomerId ?? null;
    const stripeSubscriptionId = company.stripeSubscriptionId ?? null;
    const now = new Date();

    const base = { currentPeriodEnd, cancelAtPeriodEnd, stripeCustomerId, stripeSubscriptionId };

    // ── Active paid subscription ──────────────────────────────────────────────
    if (subStatus === 'active') {
      return { status: 'active', plan: company.plan ?? 'team', isViewOnly: false, trialEndsAt, daysLeft: null, ...base };
    }

    // ── Cancellation pending (still paid until period end) ────────────────────
    if (subStatus === 'cancel_pending') {
      return { status: 'cancel_pending', plan: company.plan ?? 'team', isViewOnly: false, trialEndsAt, daysLeft: null, ...base };
    }

    // ── Active trial ──────────────────────────────────────────────────────────
    if (subStatus === 'trial') {
      if (!trialEndsAt) {
        return { status: 'trial', plan: company.plan ?? 'trial', isViewOnly: false, trialEndsAt: null, daysLeft: 14, ...base };
      }
      const msLeft = trialEndsAt.getTime() - now.getTime();
      const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
      if (daysLeft > 0) {
        return { status: 'trial', plan: company.plan ?? 'trial', isViewOnly: false, trialEndsAt, daysLeft, ...base };
      }
      // Trial has expired
      return { status: 'trial_expired', plan: company.plan ?? 'trial', isViewOnly: true, trialEndsAt, daysLeft: 0, ...base };
    }

    // ── Past due ──────────────────────────────────────────────────────────────
    if (subStatus === 'past_due') {
      return { status: 'past_due', plan: company.plan ?? 'team', isViewOnly: true, trialEndsAt, daysLeft: null, ...base };
    }

    // ── Suspended ─────────────────────────────────────────────────────────────
    if (subStatus === 'suspended') {
      return { status: 'suspended', plan: company.plan ?? 'team', isViewOnly: true, trialEndsAt, daysLeft: null, ...base };
    }

    // ── Cancelled / anything else ─────────────────────────────────────────────
    return { status: 'cancelled', plan: company.plan ?? 'team', isViewOnly: true, trialEndsAt, daysLeft: null, ...base };
  } catch {
    return null;
  }
}

// ── Middleware ────────────────────────────────────────────────────────────────

/**
 * requireWritableSubscription
 * ─────────────────────────────────────────────────────────────────────────────
 * Blocks write (create/update/delete/upload) API calls when the company is in
 * a view-only state (trial_expired, past_due, cancelled, suspended).
 *
 * Returns HTTP 402 with:
 *   { error: 'view_only', message: '...', subscriptionStatus: '...' }
 *
 * Apply to any route that mutates data.  Read routes and download routes
 * should NOT use this middleware — they remain accessible in view-only mode.
 *
 * Billing routes (checkout, customer portal, cancel, reactivate) must also
 * NOT use this middleware — they must always be reachable.
 */
export async function requireWritableSubscription(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const info = await getSubscriptionInfo(req);

    if (!info) {
      res.status(401).json({ error: 'Unauthorised' });
      return;
    }

    if (VIEW_ONLY_STATUSES.has(info.status)) {
      const statusLabels: Record<string, string> = {
        trial_expired: 'Your free trial has ended.',
        past_due:      'Your subscription payment is overdue.',
        cancelled:     'Your subscription has been cancelled.',
        suspended:     'Your account has been suspended.',
      };
      const label = statusLabels[info.status] ?? 'Your subscription is inactive.';

      res.status(402).json({
        error: 'view_only',
        subscriptionStatus: info.status,
        message: `${label} Your account is now view-only. Subscribe to continue creating and editing work.`,
        billingUrl: '/billing',
      });
      return;
    }

    next();
  } catch {
    // On unexpected error, fail open (don't block the user) — auth middleware
    // will catch any real auth failures upstream.
    next();
  }
}

/**
 * requireActiveSubscription  (legacy — blocks ALL access when expired)
 * Use requireWritableSubscription for new write-gate logic instead.
 */
export async function requireActiveSubscription(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const info = await getSubscriptionInfo(req);
  if (!info) {
    res.status(401).json({ error: 'Unauthorised' });
    return;
  }

  if (info.status === 'trial_expired' || info.status === 'cancelled') {
    res.status(402).json({
      error: 'subscription_required',
      message: 'Your trial has ended. Please subscribe to continue.',
      subscriptionInfo: info,
    });
    return;
  }

  next();
}

/** Helper: is this status a view-only state? */
export function isViewOnlyStatus(status: SubscriptionStatus): boolean {
  return VIEW_ONLY_STATUSES.has(status);
}
