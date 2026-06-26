/**
 * POST /api/subscription/webhook
 * Stripe webhook — updates company subscription status on payment events.
 * Must be registered with raw body parsing (no JSON middleware).
 */
import type { Request, Response } from 'express';
import Stripe from 'stripe';
import { getSecret } from '#airo/secrets';
import { db } from '../../../db/client.js';
import { companies } from '../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';

const PLAN_MAX_USERS: Record<string, number> = {
  solo:       1,
  team:       5,
  pro:        10,
  enterprise: 999,
};

export default async function handler(req: Request, res: Response) {
  const apiKey = getSecret('STRIPE_SECRET_KEY');
  const webhookSecret = getSecret('STRIPE_WEBHOOK_SECRET');

  if (!apiKey) return res.status(503).json({ error: 'Stripe not configured.' });

  let event: Stripe.Event;

  try {
    const stripe = new Stripe(apiKey as string, { apiVersion: '2026-02-25.clover' });

    if (webhookSecret) {
      const sig = req.headers['stripe-signature'] as string;
      // req.body is raw Buffer when using express.raw() middleware
      event = stripe.webhooks.constructEvent(req.body as Buffer, sig, webhookSecret as string);
    } else {
      // Dev mode — no signature verification
      event = req.body as Stripe.Event;
    }
  } catch (err) {
    console.error('Stripe webhook signature error:', err);
    return res.status(400).json({ error: 'Webhook signature verification failed.' });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const companyId = session.metadata?.companyId;
        const plan = session.metadata?.plan ?? 'team';
        const subscriptionId = typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription?.id ?? null;

        if (companyId) {
          await db.update(companies)
            .set({
              subscriptionStatus: 'active',
              plan,
              stripeSubscriptionId: subscriptionId,
              maxUsers: PLAN_MAX_USERS[plan] ?? 10,
            })
            .where(eq(companies.id, Number(companyId)));
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice & { subscription?: string | { id: string } | null };
        const sub = invoice.subscription;
        const subId = typeof sub === 'string' ? sub : (sub as { id: string } | null)?.id ?? null;
        if (subId) {
          // Keep subscription active on renewal
          await db.execute(sql`
            UPDATE companies SET subscription_status = 'active'
            WHERE stripe_subscription_id = ${subId}
          `);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice & { subscription?: string | { id: string } | null };
        const sub = invoice.subscription;
        const subId = typeof sub === 'string' ? sub : (sub as { id: string } | null)?.id ?? null;
        if (subId) {
          await db.execute(sql`
            UPDATE companies SET subscription_status = 'past_due'
            WHERE stripe_subscription_id = ${subId}
          `);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await db.execute(sql`
          UPDATE companies SET subscription_status = 'cancelled'
          WHERE stripe_subscription_id = ${subscription.id}
        `);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const status = subscription.status === 'active' ? 'active'
          : subscription.status === 'past_due' ? 'past_due'
          : subscription.status === 'canceled' ? 'cancelled'
          : 'active';
        await db.execute(sql`
          UPDATE companies SET subscription_status = ${status}
          WHERE stripe_subscription_id = ${subscription.id}
        `);
        break;
      }
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Stripe webhook handler error:', error);
    res.status(500).json({ error: String(error) });
  }
}
