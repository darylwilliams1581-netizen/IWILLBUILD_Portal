/**
 * GET /api/subscription/eligibility
 * Checks whether this company can start an Apple subscription without creating
 * a second paid subscription alongside an existing billing relationship.
 */
import type { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../../db/client.js';
import { companies, profiles } from '../../../db/schema.js';
import { getAuth } from '../../../../lib/auth/auth.js';

function headersFrom(req: Request): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) headers.set(key, Array.isArray(value) ? value[0] : value);
  }
  return headers;
}

export default async function handler(req: Request, res: Response) {
  try {
    const session = await getAuth().api.getSession({ headers: headersFrom(req) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company found.' });
    if (profile.role !== 'owner') {
      return res.status(403).json({ error: 'Only the company owner can start an Apple subscription.' });
    }

    const company = await db.query.companies.findFirst({ where: eq(companies.id, profile.companyId) });
    if (!company) return res.status(404).json({ error: 'Company not found.' });

    const now = Date.now();
    const periodEnd = company.currentPeriodEnd ? new Date(company.currentPeriodEnd).getTime() : 0;
    const hasUnexpiredPaidAccess = periodEnd > now;
    const currentStatus = company.subscriptionStatus ?? 'trial';
    const subscriptionId = company.stripeSubscriptionId ?? '';
    const appleManaged = subscriptionId.startsWith('apple:');

    if (appleManaged && (hasUnexpiredPaidAccess || ['active', 'cancel_pending', 'cancel_at_period_end'].includes(currentStatus))) {
      return res.json({
        eligible: true,
        provider: 'apple',
        canChangeAppleTier: true,
      });
    }

    const hasExistingPaidSubscription = ['active', 'cancel_pending', 'cancel_at_period_end', 'past_due'].includes(currentStatus);
    const hasStripeSubscription = Boolean(subscriptionId) && !appleManaged;
    const staleStripeLink = ['cancelled', 'trial_expired'].includes(currentStatus) && !hasUnexpiredPaidAccess;
    if (!appleManaged && (hasUnexpiredPaidAccess || hasExistingPaidSubscription || (hasStripeSubscription && !staleStripeLink))) {
      return res.json({
        eligible: false,
        provider: subscriptionId ? 'existing' : 'managed',
        managementMessage: 'This company already has a paid or managed subscription. Contact the company owner to manage its current plan before starting another subscription.',
      });
    }

    return res.json({ eligible: true, provider: null });
  } catch (error) {
    console.error('[subscription/eligibility]', error instanceof Error ? error.message : error);
    return res.status(500).json({ error: 'Could not check subscription eligibility.' });
  }
}
