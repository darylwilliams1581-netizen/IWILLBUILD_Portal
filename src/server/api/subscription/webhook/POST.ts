/**
 * POST /api/subscription/webhook
 * Stripe webhook — updates company subscription status on payment events.
 * Must be registered with raw body parsing (no JSON middleware).
 *
 * Events handled:
 *   checkout.session.completed      — new subscription activated
 *   customer.subscription.updated   — plan change, cancel scheduled, reactivation
 *   customer.subscription.deleted   — subscription fully cancelled by Stripe
 *   invoice.paid / payment_succeeded — successful renewal
 *   invoice.payment_failed          — payment failed → past_due + record past_due_since
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
  business:   10,
  pro:        10,   // legacy alias
  enterprise: 999,
};

/** Format a JS Date to MySQL DATETIME string */
function toMysqlDatetime(d: Date): string {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

export default async function handler(req: Request, res: Response) {
  const apiKey = getSecret('STRIPE_SECRET_KEY');
  const webhookSecret = getSecret('STRIPE_WEBHOOK_SECRET');

  if (!apiKey) return res.status(503).json({ error: 'Stripe not configured.' });

  let event: Stripe.Event;

  try {
    const stripe = new Stripe(apiKey as string, { apiVersion: '2026-02-25.clover' });

    if (webhookSecret) {
      const sig = req.headers['stripe-signature'] as string;
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

      // ── New subscription via Stripe Checkout ────────────────────────────────
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
              cancelAtPeriodEnd: false,
              // Clear any previous cancellation / past-due timestamps
              cancelledAt: null,
              pastDueSince: null,
            } as Partial<typeof companies.$inferInsert>)
            .where(eq(companies.id, Number(companyId)));
        }
        break;
      }

      // ── Subscription updated (plan change, cancel scheduled, reactivation) ──
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const cancelAtEnd = subscription.cancel_at_period_end ?? false;
        const periodEnd = subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000)
          : null;

        // Determine the DB status to store
        let status: string;
        if (subscription.status === 'canceled') {
          status = 'cancelled';
        } else if (subscription.status === 'past_due') {
          status = 'past_due';
        } else if (cancelAtEnd) {
          // Cancellation scheduled — store as cancel_at_period_end so the gate
          // can check current_period_end directly
          status = 'cancel_at_period_end';
        } else {
          status = 'active';
        }

        // Build the raw SQL update — we need to conditionally set past_due_since
        // only when transitioning INTO past_due (not on every update)
        if (status === 'past_due') {
          // Only set past_due_since if it's not already set (first failure)
          await db.execute(sql`
            UPDATE companies
            SET
              subscription_status = ${status},
              cancel_at_period_end = ${cancelAtEnd ? 1 : 0},
              current_period_end = ${periodEnd ? toMysqlDatetime(periodEnd) : null},
              past_due_since = COALESCE(past_due_since, NOW())
            WHERE stripe_subscription_id = ${subscription.id}
          `);
        } else if (status === 'active') {
          // Reactivation or renewal — clear past_due_since and cancelled_at
          await db.execute(sql`
            UPDATE companies
            SET
              subscription_status = ${status},
              cancel_at_period_end = ${cancelAtEnd ? 1 : 0},
              current_period_end = ${periodEnd ? toMysqlDatetime(periodEnd) : null},
              past_due_since = NULL,
              cancelled_at = NULL
            WHERE stripe_subscription_id = ${subscription.id}
          `);
        } else {
          await db.execute(sql`
            UPDATE companies
            SET
              subscription_status = ${status},
              cancel_at_period_end = ${cancelAtEnd ? 1 : 0},
              current_period_end = ${periodEnd ? toMysqlDatetime(periodEnd) : null}
            WHERE stripe_subscription_id = ${subscription.id}
          `);
        }
        break;
      }

      // ── Subscription fully deleted by Stripe ────────────────────────────────
      // This fires when the period ends after a cancel_at_period_end, or when
      // cancelled immediately. We store cancelled_at and keep current_period_end
      // so the gate can determine if the user still has access.
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const periodEnd = subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000)
          : null;

        await db.execute(sql`
          UPDATE companies
          SET
            subscription_status = 'cancelled',
            cancel_at_period_end = 0,
            cancelled_at = NOW(),
            current_period_end = ${periodEnd ? toMysqlDatetime(periodEnd) : null}
          WHERE stripe_subscription_id = ${subscription.id}
        `);
        break;
      }

      // ── Successful payment / renewal ────────────────────────────────────────
      case 'invoice.paid':
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice & {
          subscription?: string | { id: string } | null;
        };
        const sub = invoice.subscription;
        const subId = typeof sub === 'string' ? sub : (sub as { id: string } | null)?.id ?? null;
        if (subId) {
          // Successful renewal — restore active, clear past_due_since
          await db.execute(sql`
            UPDATE companies
            SET
              subscription_status = 'active',
              cancel_at_period_end = 0,
              past_due_since = NULL
            WHERE stripe_subscription_id = ${subId}
          `);
        }
        break;
      }

      // ── Payment failed ──────────────────────────────────────────────────────
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice & {
          subscription?: string | { id: string } | null;
        };
        const sub = invoice.subscription;
        const subId = typeof sub === 'string' ? sub : (sub as { id: string } | null)?.id ?? null;
        if (subId) {
          // Set past_due; only record past_due_since on first failure (COALESCE)
          await db.execute(sql`
            UPDATE companies
            SET
              subscription_status = 'past_due',
              past_due_since = COALESCE(past_due_since, NOW())
            WHERE stripe_subscription_id = ${subId}
          `);
        }
        break;
      }
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Stripe webhook handler error:', error);
    res.status(500).json({ error: String(error) });
  }
}
