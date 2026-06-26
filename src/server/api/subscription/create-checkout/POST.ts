/**
 * POST /api/subscription/create-checkout
 * Creates a Stripe Checkout session for a subscription plan.
 * Returns { url } — the client redirects to it.
 */
import type { Request, Response } from 'express';
import Stripe from 'stripe';
import { getSecret } from '#airo/secrets';
import { db } from '../../../db/client.js';
import { profiles, companies } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';

// ── Plan → Stripe price mapping ───────────────────────────────────────────────
// These price IDs are registered in Step 4 of the Stripe skill.
// Placeholder values — replace with real price IDs after running stripe-register-products.ts
const PLAN_PRICE_IDS: Record<string, string> = {
  solo:       process.env.STRIPE_PRICE_SOLO       ?? '',
  team:       process.env.STRIPE_PRICE_TEAM       ?? '',
  pro:        process.env.STRIPE_PRICE_PRO        ?? '',
  enterprise: process.env.STRIPE_PRICE_ENTERPRISE ?? '',
};

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
    if (!plan || !PLAN_PRICE_IDS[plan]) {
      return res.status(400).json({ error: 'Invalid plan selected.' });
    }

    const priceId = PLAN_PRICE_IDS[plan];
    if (!priceId) {
      return res.status(503).json({ error: 'Stripe prices not yet configured. Please contact support.' });
    }

    const stripe = new Stripe(apiKey, { apiVersion: '2025-05-28.basil' });

    // Get or create Stripe customer for this company
    let customerId = company.stripeCustomerId ?? undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: company.name,
        email: session.user.email ?? undefined,
        metadata: { companyId: String(company.id) },
      });
      customerId = customer.id;
      // Save customer ID back to company
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
