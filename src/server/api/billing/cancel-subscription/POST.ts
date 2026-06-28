/**
 * POST /api/billing/cancel-subscription
 * Cancels the company subscription at period end (not immediately).
 * Sets cancel_at_period_end = true on the Stripe subscription.
 * Updates company.subscription_status to 'cancel_pending'.
 * Auth required. Owner/Admin only.
 */
import type { Request, Response } from 'express';
import Stripe from 'stripe';
import { getSecret } from '#airo/secrets';
import { db } from '../../../db/client.js';
import { profiles, companies } from '../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';

export default async function handler(req: Request, res: Response) {
  try {
    const apiKey = getSecret('STRIPE_SECRET_KEY');
    if (!apiKey) return res.status(503).json({ error: 'Stripe not configured.' });

    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company found.' });
    if (!['owner', 'admin'].includes(profile.role)) {
      return res.status(403).json({ error: 'Owner or Admin access required.' });
    }

    const company = await db.query.companies.findFirst({ where: eq(companies.id, profile.companyId) });
    if (!company) return res.status(404).json({ error: 'Company not found.' });
    if (!company.stripeSubscriptionId) {
      return res.status(400).json({ error: 'No active subscription found for this company.' });
    }

    const stripe = new Stripe(apiKey as string, { apiVersion: '2026-02-25.clover' });

    // Cancel at period end — access remains until billing cycle ends
    const subscription = await stripe.subscriptions.update(company.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    const periodEnd = subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000)
      : null;

    // Update company: mark cancel_pending, store period end
    await db.execute(sql`
      UPDATE companies
      SET
        subscription_status = 'cancel_pending',
        cancel_at_period_end = 1,
        current_period_end = ${periodEnd ? periodEnd.toISOString().slice(0, 19).replace('T', ' ') : null}
      WHERE id = ${company.id}
    `);

    res.json({
      ok: true,
      cancelAtPeriodEnd: true,
      currentPeriodEnd: periodEnd?.toISOString() ?? null,
      message: periodEnd
        ? `Your subscription will remain active until ${periodEnd.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}. You can reactivate before then.`
        : 'Your subscription has been set to cancel at the end of the current billing period.',
    });
  } catch (error) {
    console.error('billing/cancel-subscription error:', error);
    res.status(500).json({ error: String(error) });
  }
}
