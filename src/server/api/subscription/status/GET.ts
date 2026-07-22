import type { Request, Response } from 'express';
import { getSubscriptionInfo } from '../../../lib/subscription-gate.js';

export default async function handler(req: Request, res: Response) {
  const info = await getSubscriptionInfo(req);
  if (!info) return res.status(401).json({ error: 'Unauthorised' });

  // Serialise dates to ISO strings for the client
  res.json({
    status: info.status,
    plan: info.plan,
    isViewOnly: info.isViewOnly,
    daysLeft: info.daysLeft,
    graceDaysLeft: info.graceDaysLeft,
    trialEndsAt: info.trialEndsAt?.toISOString() ?? null,
    currentPeriodEnd: info.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: info.cancelAtPeriodEnd,
    stripeCustomerId: info.stripeCustomerId,
    stripeSubscriptionId: info.stripeSubscriptionId,
  });
}
