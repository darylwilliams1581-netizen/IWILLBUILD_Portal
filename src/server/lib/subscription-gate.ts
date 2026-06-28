/**
 * Subscription gate middleware.
 * Attaches subscription status to req and optionally blocks access
 * when a company's trial has expired and they have no active subscription.
 *
 * Usage in API routes:
 *   import { requireActiveSubscription } from '@/server/lib/subscription-gate';
 *   app.use('/api/jobs', requireActiveSubscription);
 */
import type { Request, Response, NextFunction } from 'express';
import { db } from '../db/client.js';
import { profiles, companies } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../lib/auth/auth.js';

export interface SubscriptionInfo {
  status: 'active' | 'trial' | 'trial_expired' | 'cancelled' | 'past_due' | 'cancel_pending' | 'no_company';
  plan: string;
  trialEndsAt: Date | null;
  daysLeft: number | null;
  // Billing management fields (null when not on a paid subscription)
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}

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
    if (!profile?.companyId) return {
      status: 'no_company', plan: 'none',
      trialEndsAt: null, daysLeft: null,
      currentPeriodEnd: null, cancelAtPeriodEnd: false,
      stripeCustomerId: null, stripeSubscriptionId: null,
    };

    // Owner bypasses all gates
    if (profile.role === 'owner') return {
      status: 'active', plan: 'owner',
      trialEndsAt: null, daysLeft: null,
      currentPeriodEnd: null, cancelAtPeriodEnd: false,
      stripeCustomerId: null, stripeSubscriptionId: null,
    };

    const company = await db.query.companies.findFirst({
      where: eq(companies.id, profile.companyId),
    });
    if (!company) return {
      status: 'no_company', plan: 'none',
      trialEndsAt: null, daysLeft: null,
      currentPeriodEnd: null, cancelAtPeriodEnd: false,
      stripeCustomerId: null, stripeSubscriptionId: null,
    };

    const subStatus = company.subscriptionStatus ?? 'trial';
    const trialEndsAt = company.trialEndsAt ? new Date(company.trialEndsAt) : null;
    const currentPeriodEnd = (company as unknown as { currentPeriodEnd?: Date | null }).currentPeriodEnd
      ? new Date((company as unknown as { currentPeriodEnd: Date }).currentPeriodEnd)
      : null;
    const cancelAtPeriodEnd = Boolean((company as unknown as { cancelAtPeriodEnd?: boolean }).cancelAtPeriodEnd);
    const stripeCustomerId = company.stripeCustomerId ?? null;
    const stripeSubscriptionId = company.stripeSubscriptionId ?? null;
    const now = new Date();

    const base = { currentPeriodEnd, cancelAtPeriodEnd, stripeCustomerId, stripeSubscriptionId };

    if (subStatus === 'active') {
      return { status: 'active', plan: company.plan ?? 'team', trialEndsAt, daysLeft: null, ...base };
    }

    if (subStatus === 'cancel_pending') {
      return { status: 'cancel_pending', plan: company.plan ?? 'team', trialEndsAt, daysLeft: null, ...base };
    }

    if (subStatus === 'trial') {
      if (!trialEndsAt) return { status: 'trial', plan: company.plan ?? 'trial', trialEndsAt: null, daysLeft: 14, ...base };
      const msLeft = trialEndsAt.getTime() - now.getTime();
      const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
      if (daysLeft > 0) {
        return { status: 'trial', plan: company.plan ?? 'trial', trialEndsAt, daysLeft, ...base };
      }
      return { status: 'trial_expired', plan: company.plan ?? 'trial', trialEndsAt, daysLeft: 0, ...base };
    }

    if (subStatus === 'past_due') {
      return { status: 'past_due', plan: company.plan ?? 'team', trialEndsAt, daysLeft: null, ...base };
    }

    return { status: 'cancelled', plan: company.plan ?? 'team', trialEndsAt, daysLeft: null, ...base };
  } catch {
    return null;
  }
}

/** Express middleware — blocks access if trial expired and no active subscription. */
export async function requireActiveSubscription(req: Request, res: Response, next: NextFunction) {
  const info = await getSubscriptionInfo(req);
  if (!info) return res.status(401).json({ error: 'Unauthorised' });

  if (info.status === 'trial_expired' || info.status === 'cancelled') {
    return res.status(402).json({
      error: 'subscription_required',
      message: 'Your trial has ended. Please subscribe to continue.',
      subscriptionInfo: info,
    });
  }

  next();
}
