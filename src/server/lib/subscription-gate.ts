/**
 * subscription-gate.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Subscription state resolution and write-gate middleware.
 *
 * SUBSCRIPTION STATES
 * ───────────────────
 *   trial              — free trial, still running
 *   trial_expired      — trial ended, no paid sub → VIEW-ONLY
 *   active             — paid, all good → FULL ACCESS
 *   cancel_at_period_end — paid, cancellation scheduled but period not ended
 *                          → FULL ACCESS (warning banner shown)
 *   cancelled          — subscription ended AND current_period_end has passed
 *                          → VIEW-ONLY
 *   past_due           — payment failed
 *                          → FULL ACCESS during 30-day grace period
 *                          → VIEW-ONLY after grace period
 *   suspended          — manually suspended by platform developer → VIEW-ONLY
 *   no_company         — user has no company record
 *
 * VIEW-ONLY STATES (writes blocked):
 *   trial_expired | cancelled | suspended | past_due (after grace)
 *
 * ALWAYS WRITABLE:
 *   active | trial | cancel_at_period_end | past_due (within grace)
 *   platform developer (platform_role === 'developer') — always bypasses
 *
 * PAST-DUE GRACE PERIOD: 30 days from past_due_since
 *   If past_due_since is NULL, grace period starts from now (fail-open).
 *   Notification emails: immediately on failure, again at 7-day warning mark.
 */

import type { Request, Response, NextFunction } from 'express';
import { db } from '../db/client.js';
import { profiles, companies } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../lib/auth/auth.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const PAST_DUE_GRACE_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ── Types ─────────────────────────────────────────────────────────────────────

export type SubscriptionStatus =
  | 'active'
  | 'trial'
  | 'trial_expired'
  | 'cancel_at_period_end'
  | 'cancelled'
  | 'past_due'
  | 'suspended'
  | 'no_company';

export interface SubscriptionInfo {
  /** Resolved status string */
  status: SubscriptionStatus;
  /** Plan name: solo | team | business | enterprise | trial | owner */
  plan: string;
  /** true when the company is in a view-only state */
  isViewOnly: boolean;
  /** Trial days remaining (null when not on trial) */
  daysLeft: number | null;
  /** Days remaining in past-due grace period (null when not past_due) */
  graceDaysLeft: number | null;
  /** When the current billing period ends (or when access ends for cancel_at_period_end) */
  currentPeriodEnd: Date | null;
  /** Whether a cancellation is scheduled at period end */
  cancelAtPeriodEnd: boolean;
  /** When the trial ends (null for paid subs) */
  trialEndsAt: Date | null;
  /** Stripe customer ID */
  stripeCustomerId: string | null;
  /** Stripe subscription ID */
  stripeSubscriptionId: string | null;
}

/** Statuses that put a company into view-only mode */
const VIEW_ONLY_STATUSES: ReadonlySet<SubscriptionStatus> = new Set([
  'trial_expired',
  'cancelled',
  'suspended',
]);

// ── Core resolver ─────────────────────────────────────────────────────────────

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
      return noCompany();
    }

    // Platform owner bypasses all gates — always writable
    if (profile.role === 'owner') {
      return ownerInfo();
    }

    const company = await db.query.companies.findFirst({
      where: eq(companies.id, profile.companyId),
    });
    if (!company) return noCompany();

    return resolveCompanyStatus(company);
  } catch {
    return null;
  }
}

// ── Status resolution ─────────────────────────────────────────────────────────

type CompanyRow = typeof companies.$inferSelect;

function resolveCompanyStatus(company: CompanyRow): SubscriptionInfo {
  const now = new Date();
  const rawStatus = company.subscriptionStatus ?? 'trial';

  const trialEndsAt = company.trialEndsAt ? new Date(company.trialEndsAt) : null;
  const currentPeriodEnd = company.currentPeriodEnd ? new Date(company.currentPeriodEnd) : null;
  const cancelAtPeriodEnd = Boolean(company.cancelAtPeriodEnd);
  const pastDueSince = (company as unknown as { pastDueSince?: Date | null }).pastDueSince
    ? new Date((company as unknown as { pastDueSince: Date }).pastDueSince)
    : null;

  const base = {
    plan: company.plan ?? 'trial',
    trialEndsAt,
    currentPeriodEnd,
    cancelAtPeriodEnd,
    stripeCustomerId: company.stripeCustomerId ?? null,
    stripeSubscriptionId: company.stripeSubscriptionId ?? null,
    graceDaysLeft: null as number | null,
  };

  // ── Active paid subscription ──────────────────────────────────────────────
  if (rawStatus === 'active') {
    // If cancelAtPeriodEnd is set, treat as cancel_at_period_end
    if (cancelAtPeriodEnd && currentPeriodEnd) {
      if (now < currentPeriodEnd) {
        // Still within paid period — full access, warning banner
        return { ...base, status: 'cancel_at_period_end', isViewOnly: false, daysLeft: null };
      } else {
        // Period has passed — view-only
        return { ...base, status: 'cancelled', isViewOnly: true, daysLeft: null };
      }
    }
    return { ...base, status: 'active', isViewOnly: false, daysLeft: null };
  }

  // ── Cancellation scheduled (Stripe sets cancel_at_period_end=true, status=active) ──
  // This branch handles the DB status being explicitly 'cancel_pending' or 'cancel_at_period_end'
  if (rawStatus === 'cancel_pending' || rawStatus === 'cancel_at_period_end') {
    if (currentPeriodEnd && now >= currentPeriodEnd) {
      // Period has ended — view-only
      return { ...base, status: 'cancelled', isViewOnly: true, daysLeft: null };
    }
    // Still within paid period — full access
    return { ...base, status: 'cancel_at_period_end', isViewOnly: false, daysLeft: null };
  }

  // ── Cancelled ─────────────────────────────────────────────────────────────
  if (rawStatus === 'cancelled') {
    // If current_period_end is in the future, still give full access
    if (currentPeriodEnd && now < currentPeriodEnd) {
      return { ...base, status: 'cancel_at_period_end', isViewOnly: false, daysLeft: null };
    }
    return { ...base, status: 'cancelled', isViewOnly: true, daysLeft: null };
  }

  // ── Past due ──────────────────────────────────────────────────────────────
  if (rawStatus === 'past_due') {
    const graceSince = pastDueSince ?? now; // fail-open: if no timestamp, grace starts now
    const graceEnds = new Date(graceSince.getTime() + PAST_DUE_GRACE_DAYS * MS_PER_DAY);
    const msLeft = graceEnds.getTime() - now.getTime();
    const graceDaysLeft = Math.max(0, Math.ceil(msLeft / MS_PER_DAY));

    if (now < graceEnds) {
      // Within grace period — full access but warning
      return { ...base, status: 'past_due', isViewOnly: false, daysLeft: null, graceDaysLeft };
    }
    // Grace period expired — view-only
    return { ...base, status: 'past_due', isViewOnly: true, daysLeft: null, graceDaysLeft: 0 };
  }

  // ── Suspended ─────────────────────────────────────────────────────────────
  if (rawStatus === 'suspended') {
    return { ...base, status: 'suspended', isViewOnly: true, daysLeft: null };
  }

  // ── Trial ─────────────────────────────────────────────────────────────────
  if (rawStatus === 'trial') {
    if (!trialEndsAt) {
      return { ...base, status: 'trial', isViewOnly: false, daysLeft: 14 };
    }
    const msLeft = trialEndsAt.getTime() - now.getTime();
    const daysLeft = Math.ceil(msLeft / MS_PER_DAY);
    if (daysLeft > 0) {
      return { ...base, status: 'trial', isViewOnly: false, daysLeft };
    }
    return { ...base, status: 'trial_expired', isViewOnly: true, daysLeft: 0 };
  }

  // ── Fallback ──────────────────────────────────────────────────────────────
  return { ...base, status: 'cancelled', isViewOnly: true, daysLeft: null };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function noCompany(): SubscriptionInfo {
  return {
    status: 'no_company', plan: 'none', isViewOnly: false,
    trialEndsAt: null, daysLeft: null, graceDaysLeft: null,
    currentPeriodEnd: null, cancelAtPeriodEnd: false,
    stripeCustomerId: null, stripeSubscriptionId: null,
  };
}

function ownerInfo(): SubscriptionInfo {
  return {
    status: 'active', plan: 'owner', isViewOnly: false,
    trialEndsAt: null, daysLeft: null, graceDaysLeft: null,
    currentPeriodEnd: null, cancelAtPeriodEnd: false,
    stripeCustomerId: null, stripeSubscriptionId: null,
  };
}

// ── Middleware ────────────────────────────────────────────────────────────────

/**
 * requireWritableSubscription
 * ─────────────────────────────────────────────────────────────────────────────
 * Blocks write (create/update/delete/upload) API calls when the company is in
 * a view-only state.
 *
 * Returns HTTP 402 with:
 *   { error: 'view_only', message: '...', subscriptionStatus: '...' }
 *
 * Apply to any route that mutates data. Read routes, download routes, and
 * billing routes must NOT use this middleware.
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

    if (info.isViewOnly) {
      const statusLabels: Record<string, string> = {
        trial_expired:  'Your free trial has ended.',
        cancelled:      'Your subscription has ended.',
        suspended:      'Your account has been suspended.',
        past_due:       'Your subscription payment is overdue and the grace period has expired.',
      };
      const label = statusLabels[info.status] ?? 'Your subscription is inactive.';

      res.status(402).json({
        error: 'view_only',
        subscriptionStatus: info.status,
        message: `${label} Your account is now view-only. Subscribe or reactivate to continue creating and editing work.`,
        billingUrl: '/billing',
      });
      return;
    }

    next();
  } catch {
    // Fail open — auth middleware catches real auth failures upstream
    next();
  }
}

/**
 * requireActiveSubscription  (legacy — blocks ALL access when expired)
 * Prefer requireWritableSubscription for new write-gate logic.
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
