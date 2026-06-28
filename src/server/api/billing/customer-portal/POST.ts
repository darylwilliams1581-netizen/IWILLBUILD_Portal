/**
 * POST /api/billing/customer-portal
 * Creates a Stripe Billing Portal session and returns the URL.
 * Auth required. Owner/Admin only.
 * The portal allows: update payment method, download invoices,
 * cancel subscription, change plan (if configured in Stripe dashboard).
 */
import type { Request, Response } from 'express';
import Stripe from 'stripe';
import { getSecret } from '#airo/secrets';
import { db } from '../../../db/client.js';
import { profiles, companies } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
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
    if (!company.stripeCustomerId) {
      return res.status(400).json({
        error: 'No Stripe customer found for this company. Please subscribe to a plan first.',
      });
    }

    const stripe = new Stripe(apiKey as string, { apiVersion: '2026-02-25.clover' });
    const origin = req.headers.origin ?? `https://${req.headers.host}`;

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: company.stripeCustomerId,
      return_url: `${origin}/billing`,
    });

    res.json({ url: portalSession.url });
  } catch (error) {
    console.error('billing/customer-portal error:', error);
    res.status(500).json({ error: String(error) });
  }
}
