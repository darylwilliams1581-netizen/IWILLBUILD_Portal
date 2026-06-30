/**
 * POST /api/billing/upgrade-subscription
 * ─────────────────────────────────────────────────────────────────────────────
 * Upgrades or downgrades an active Stripe subscription to a different plan.
 * Uses Stripe's subscription update with proration so the customer is charged
 * (or credited) the difference immediately.
 *
 * Body: { plan: 'solo' | 'team' | 'business' }
 * Returns: { ok: true, plan, message } on success
 *
 * Auth: owner or admin only.
 * Requires: STRIPE_SECRET_KEY + STRIPE_{PLAN}_PRICE_ID secrets.
 */
import type { Request, Response } from 'express';
import Stripe from 'stripe';
import { getSecret } from '#airo/secrets';
import { db } from '../../../db/client.js';
import { profiles, companies } from '../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';

const UPGRADE_PLANS = ['solo', 'team', 'business'] as const;
type UpgradePlan = typeof UPGRADE_PLANS[number];

function isUpgradePlan(p: string): p is UpgradePlan {
  return (UPGRADE_PLANS as readonly string[]).includes(p);
}

function getPriceId(plan: UpgradePlan): string | null {
  const map: Record<UpgradePlan, string> = {
    solo:     getSecret('STRIPE_SOLO_PRICE_ID')     ?? '',
    team:     getSecret('STRIPE_TEAM_PRICE_ID')     ?? '',
    business: getSecret('STRIPE_BUSINESS_PRICE_ID') ?? '',
  };
  return map[plan] || null;
}

export default async function handler(req: Request, res: Response) {
  try {
    const apiKey = getSecret('STRIPE_SECRET_KEY');
    if (!apiKey) return res.status(503).json({ error: 'Stripe not configured.' });

    // ── Auth ──────────────────────────────────────────────────────────────────
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

    // ── Validate inputs ───────────────────────────────────────────────────────
    const { plan } = req.body as { plan?: string };
    if (!plan || !isUpgradePlan(plan)) {
      return res.status(400).json({ error: `Invalid plan "${plan ?? ''}". Valid options: solo, team, business.` });
    }

    // Must have an active subscription to upgrade
    if (!company.stripeSubscriptionId) {
      return res.status(400).json({ error: 'No active subscription found. Please subscribe first.' });
    }

    const priceId = getPriceId(plan);
    if (!priceId) {
      return res.status(503).json({ error: `Price ID for plan "${plan}" is not configured. Please contact support.` });
    }
    if (!priceId.startsWith('price_')) {
      return res.status(503).json({ error: `Configuration error: expected a price_ ID for plan "${plan}". Please contact support.` });
    }

    // ── Stripe: update subscription ───────────────────────────────────────────
    const stripe = new Stripe(apiKey as string, { apiVersion: '2026-02-25.clover' });

    const subscription = await stripe.subscriptions.retrieve(company.stripeSubscriptionId);

    if (!subscription || subscription.status === 'canceled') {
      return res.status(400).json({ error: 'Subscription is not active. Please subscribe first.' });
    }

    // Get the first subscription item to update
    const item = subscription.items.data[0];
    if (!item) {
      return res.status(400).json({ error: 'Could not find subscription item to update.' });
    }

    // Don't allow switching to the same plan
    if (item.price.id === priceId) {
      return res.status(400).json({ error: `You are already on the ${plan} plan.` });
    }

    // Update the subscription item with the new price — prorate immediately
    await stripe.subscriptions.update(company.stripeSubscriptionId, {
      items: [{ id: item.id, price: priceId }],
      proration_behavior: 'create_prorations',
      metadata: { plan },
    });

    // ── Update local DB ───────────────────────────────────────────────────────
    await db.execute(sql`
      UPDATE companies
      SET subscription_plan = ${plan},
          subscription_status = 'active',
          updated_at = NOW()
      WHERE id = ${company.id}
    `);

    const planLabels: Record<UpgradePlan, string> = {
      solo: 'Solo ($19/mo)',
      team: 'Team ($79/mo)',
      business: 'Business ($149/mo)',
    };

    res.json({
      ok: true,
      plan,
      message: `Successfully switched to the ${planLabels[plan]} plan. Proration has been applied to your next invoice.`,
    });
  } catch (error) {
    console.error('billing/upgrade-subscription error:', error);
    res.status(500).json({ error: String(error) });
  }
}
