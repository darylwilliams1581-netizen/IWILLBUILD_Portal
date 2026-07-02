/**
 * POST /api/subscription/create-checkout
 * Creates a Stripe Checkout session for a subscription plan.
 * Returns { url } — the client redirects to it.
 *
 * Accepted plans: solo | team | business
 * Enterprise is contact-sales only — never routed here.
 *
 * Required secrets (must start with "price_"):
 *   STRIPE_SOLO_PRICE_ID
 *   STRIPE_TEAM_PRICE_ID
 *   STRIPE_BUSINESS_PRICE_ID
 */
import type { Request, Response } from 'express';
import { getSecret } from '#airo/secrets';
import { getStripe } from '../../../lib/stripe-client.js';
import { db } from '../../../db/client.js';
import { profiles, companies } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';

// ── Checkout-eligible plans only (enterprise = contact sales, never checkout) ──
const CHECKOUT_PLANS = ['solo', 'team', 'business'] as const;
type CheckoutPlan = typeof CHECKOUT_PLANS[number];

function getPriceId(plan: CheckoutPlan): string | null {
  const map: Record<CheckoutPlan, string> = {
    solo:     getSecret('STRIPE_SOLO_PRICE_ID')     ?? '',
    team:     getSecret('STRIPE_TEAM_PRICE_ID')     ?? '',
    business: getSecret('STRIPE_BUSINESS_PRICE_ID') ?? '',
  };
  return map[plan] || null;
}

function isCheckoutPlan(plan: string): plan is CheckoutPlan {
  return (CHECKOUT_PLANS as readonly string[]).includes(plan);
}

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
    if (!['owner', 'admin'].includes(profile.role)) return res.status(403).json({ error: 'Admin only.' });

    const company = await db.query.companies.findFirst({ where: eq(companies.id, profile.companyId) });
    if (!company) return res.status(404).json({ error: 'Company not found.' });

    const { plan } = req.body as { plan?: string };

    // Block enterprise — should never reach here but guard anyway
    if (plan === 'enterprise') {
      return res.status(400).json({ error: 'Enterprise plan requires a direct enquiry. Please contact support@iwillbuild.com.' });
    }

    if (!plan || !isCheckoutPlan(plan)) {
      return res.status(400).json({ error: `Invalid plan "${plan ?? ''}". Valid options: solo, team, business.` });
    }

    const priceId = getPriceId(plan);

    // Guard: price ID must be configured and must start with "price_"
    if (!priceId) {
      console.error(`[checkout] STRIPE_${plan.toUpperCase()}_PRICE_ID is not set.`);
      return res.status(503).json({
        error: `Stripe configuration error: price ID for plan "${plan}" is not configured. Please contact support.`,
      });
    }
    if (!priceId.startsWith('price_')) {
      console.error(`[checkout] STRIPE_${plan.toUpperCase()}_PRICE_ID contains a non-price_ value: "${priceId.slice(0, 12)}…" — expected a price_ ID, got ${priceId.startsWith('prod_') ? 'a prod_ product ID' : 'an unknown ID'}.`);
      return res.status(503).json({
        error: `Stripe configuration error: expected a price_ ID for plan "${plan}", got a ${priceId.startsWith('prod_') ? 'prod_ product ID' : 'non-price_ value'}. Please update the secret to a Stripe Price ID.`,
      });
    }

    const stripe = await getStripe();

    // Get or create Stripe customer for this company
    let customerId = company.stripeCustomerId ?? undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: company.name,
        email: session.user.email ?? undefined,
        metadata: { companyId: String(company.id) },
      });
      customerId = customer.id;
      await db.update(companies)
        .set({ stripeCustomerId: customerId })
        .where(eq(companies.id, company.id));
    }

    const origin = req.headers.origin ?? `https://${req.headers.host}`;

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/billing?success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/billing?cancelled=1`,
      metadata: {
        companyId: String(company.id),
        plan,
      },
      subscription_data: {
        metadata: { companyId: String(company.id), plan },
      },
    });

    res.json({ url: checkoutSession.url });
  } catch (error) {
    console.error('subscription/create-checkout error:', error);
    res.status(500).json({ error: String(error) });
  }
}
