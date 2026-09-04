/**
 * POST /api/billing/reactivate-subscription
 * Reactivates a subscription that was set to cancel at period end.
 *
 * STRICT ORDERING — Stripe first, DB only on success:
 *   1. Verify the company has a Stripe subscription ID (error if missing).
 *   2. Call Stripe: subscriptions.update({ cancel_at_period_end: false }).
 *   3. Only on Stripe success: restore subscription_status = 'active', cancel_at_period_end = 0.
 *
 * If Stripe fails at step 2, the DB is NOT touched.
 * Idempotent: if already active (not cancel_pending), returns success without hitting Stripe.
 *
 * Auth required. Owner/Admin only.
 */
import type { Request, Response } from 'express';
import { getSecret } from '#airo/secrets';
import { getStripe } from '../../../lib/stripe-client.js';
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

    // ── Require an unambiguous Stripe subscription ────────────────────────────
    if (!company.stripeSubscriptionId) {
      return res.status(422).json({
        error: 'billing_link_missing',
        message:
          'We could not find a Stripe subscription linked to your account. ' +
          'Please contact support@iwillbuild.com and we will resolve this for you.',
        billingUrl: '/billing',
      });
    }

    // ── Idempotency: already active, nothing to do ────────────────────────────
    if (
      company.subscriptionStatus === 'active' &&
      !company.cancelAtPeriodEnd
    ) {
      return res.json({
        ok: true,
        alreadyActive: true,
        message: 'Your subscription is already active.',
      });
    }

    const stripe = await getStripe();

    // ── Step 1: Call Stripe — remove the pending cancellation ─────────────────
    // DB is NOT touched until Stripe confirms.
    let subscription;
    try {
      subscription = await stripe.subscriptions.update(company.stripeSubscriptionId, {
        cancel_at_period_end: false,
      });
    } catch (stripeErr: unknown) {
      const msg = stripeErr instanceof Error ? stripeErr.message : String(stripeErr);
      console.error('billing/reactivate-subscription: Stripe error:', stripeErr);
      return res.status(502).json({
        error: 'stripe_error',
        message: `Stripe could not process the reactivation: ${msg}. Your subscription has not been changed.`,
      });
    }

    // Stripe confirmed — use Stripe's authoritative period end
    const periodEnd = subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000)
      : null;

    // ── Step 2: Write to DB only after Stripe success ─────────────────────────
    await db.execute(sql`
      UPDATE companies
      SET
        subscription_status = 'active',
        cancel_at_period_end = 0,
        current_period_end = ${periodEnd ? periodEnd.toISOString().slice(0, 19).replace('T', ' ') : null}
      WHERE id = ${company.id}
    `);

    return res.json({
      ok: true,
      message: 'Your subscription has been reactivated successfully.',
      currentPeriodEnd: periodEnd?.toISOString() ?? null,
    });
  } catch (error) {
    console.error('billing/reactivate-subscription error:', error);
    return res.status(500).json({ error: String(error) });
  }
}
