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
 *                                      + sends notification email immediately
 *
 * Grace period: 30 days from past_due_since before account locks to view-only.
 * Notification emails:
 *   - Day 0  (first failure): "Payment failed — please update your card"
 *   - Day 7  (reminder):      sent by scheduled job / next webhook retry
 *   - Day 30 (lock):          account moves to view-only; no separate email needed
 *                              (gate message explains it)
 */
import type { Request, Response } from 'express';
import type Stripe from 'stripe';
import { getSecret } from '#airo/secrets';
import { getStripe } from '../../../lib/stripe-client.js';
import { db } from '../../../db/client.js';
import { companies } from '../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { sendEmail } from '../../../email.js';

// ── Email helpers ─────────────────────────────────────────────────────────────

async function sendPaymentFailedEmail(opts: {
  to: string;
  name: string;
  companyName: string;
  lockDate: string;
  updateUrl: string;
}) {
  const { to, name, companyName, lockDate, updateUrl } = opts;
  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1e293b;">
      <div style="background:#DC2626;padding:24px 32px;border-radius:8px 8px 0 0;">
        <h1 style="color:#fff;margin:0;font-size:22px;font-weight:700;">Payment Failed</h1>
      </div>
      <div style="background:#f8fafc;padding:32px;border-radius:0 0 8px 8px;border:1px solid #e2e8f0;border-top:none;">
        <p style="margin:0 0 16px;">Hi ${name},</p>
        <p style="margin:0 0 16px;">
          We couldn't process the payment for your <strong>${companyName}</strong> subscription on IWIllBUILD.
        </p>
        <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:6px;padding:16px 20px;margin:0 0 24px;">
          <p style="margin:0;font-size:14px;color:#991B1B;">
            <strong>Action required:</strong> Your account will remain fully active until
            <strong>${lockDate}</strong>. After that date it will switch to view-only mode
            until payment is resolved.
          </p>
        </div>
        <p style="margin:0 0 24px;font-size:14px;color:#475569;">
          To keep uninterrupted access, please update your payment method before ${lockDate}.
        </p>
        <a href="${updateUrl}"
           style="display:inline-block;background:#7C3AED;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;font-size:14px;">
          Update Payment Method
        </a>
        <p style="margin:32px 0 0;font-size:12px;color:#94a3b8;">
          Questions? Reply to this email or contact
          <a href="mailto:support@iwillbuild.com" style="color:#7C3AED;">support@iwillbuild.com</a>.
        </p>
      </div>
    </div>
  `;
  const text = [
    `Hi ${name},`,
    ``,
    `We couldn't process the payment for your ${companyName} subscription on IWIllBUILD.`,
    ``,
    `Your account will remain fully active until ${lockDate}. After that it will switch to view-only mode until payment is resolved.`,
    ``,
    `To keep uninterrupted access, please update your payment method before ${lockDate}:`,
    updateUrl,
    ``,
    `Questions? Email support@iwillbuild.com`,
  ].join('\n');
  try {
    await sendEmail({ to, subject: `Action required: IWIllBUILD payment failed`, fromName: 'IWIllBUILD', html, text });
  } catch (e) {
    console.error('[webhook] payment-failed email error:', e);
  }
}

async function sendPaymentReminderEmail(opts: {
  to: string;
  name: string;
  companyName: string;
  lockDate: string;
  daysLeft: number;
  updateUrl: string;
}) {
  const { to, name, companyName, lockDate, daysLeft, updateUrl } = opts;
  const urgency = daysLeft <= 3 ? 'URGENT: ' : '';
  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1e293b;">
      <div style="background:#D97706;padding:24px 32px;border-radius:8px 8px 0 0;">
        <h1 style="color:#fff;margin:0;font-size:22px;font-weight:700;">${urgency}Payment Reminder</h1>
      </div>
      <div style="background:#f8fafc;padding:32px;border-radius:0 0 8px 8px;border:1px solid #e2e8f0;border-top:none;">
        <p style="margin:0 0 16px;">Hi ${name},</p>
        <p style="margin:0 0 16px;">
          This is a reminder that your <strong>${companyName}</strong> subscription payment on IWIllBUILD
          is still outstanding.
        </p>
        <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:6px;padding:16px 20px;margin:0 0 24px;">
          <p style="margin:0;font-size:14px;color:#92400E;">
            <strong>${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining:</strong> Your account will switch to
            view-only mode on <strong>${lockDate}</strong> if payment is not resolved.
          </p>
        </div>
        <a href="${updateUrl}"
           style="display:inline-block;background:#7C3AED;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;font-size:14px;">
          Update Payment Method
        </a>
        <p style="margin:32px 0 0;font-size:12px;color:#94a3b8;">
          Questions? Reply to this email or contact
          <a href="mailto:support@iwillbuild.com" style="color:#7C3AED;">support@iwillbuild.com</a>.
        </p>
      </div>
    </div>
  `;
  const text = [
    `Hi ${name},`,
    ``,
    `Reminder: your ${companyName} subscription payment on IWIllBUILD is still outstanding.`,
    ``,
    `${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining — your account will switch to view-only mode on ${lockDate} if payment is not resolved.`,
    ``,
    `Update your payment method: ${updateUrl}`,
    ``,
    `Questions? Email support@iwillbuild.com`,
  ].join('\n');
  try {
    await sendEmail({ to, subject: `${urgency}IWIllBUILD payment reminder — ${daysLeft} day${daysLeft !== 1 ? 's' : ''} left`, fromName: 'IWIllBUILD', html, text });
  } catch (e) {
    console.error('[webhook] payment-reminder email error:', e);
  }
}

/** Fetch the owner email + name for a company via its stripe_subscription_id */
async function getCompanyOwnerContact(subId: string): Promise<{ email: string; name: string; companyName: string } | null> {
  try {
    const [rows] = await db.execute(sql`
      SELECT u.email, u.name, c.name AS company_name
      FROM companies c
      INNER JOIN profiles p ON p.company_id = c.id AND p.role = 'owner'
      INNER JOIN user u ON u.id = p.user_id
      WHERE c.stripe_subscription_id = ${subId}
      LIMIT 1
    `) as any;
    const row = (rows as any[])[0];
    if (!row?.email) return null;
    return {
      email: row.email,
      name: row.name ?? row.email.split('@')[0],
      companyName: row.company_name ?? 'your company',
    };
  } catch (e) {
    console.error('[webhook] getCompanyOwnerContact error:', e);
    return null;
  }
}

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
    const stripe = await getStripe();

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

        // Extract plan from subscription metadata (set by upgrade-subscription endpoint)
        const planFromMeta = subscription.metadata?.plan ?? null;

        // Determine the DB status to store
        let status: string;
        if (subscription.status === 'canceled') {
          status = 'cancelled';
        } else if (subscription.status === 'past_due') {
          status = 'past_due';
        } else if (cancelAtEnd) {
          status = 'cancel_at_period_end';
        } else {
          status = 'active';
        }

        // Build the raw SQL update — conditionally set past_due_since
        if (status === 'past_due') {
          await db.execute(sql`
            UPDATE companies
            SET
              subscription_status = ${status},
              cancel_at_period_end = ${cancelAtEnd ? 1 : 0},
              current_period_end = ${periodEnd ? toMysqlDatetime(periodEnd) : null},
              past_due_since = COALESCE(past_due_since, NOW())
              ${planFromMeta ? sql`, subscription_plan = ${planFromMeta}` : sql``}
            WHERE stripe_subscription_id = ${subscription.id}
          `);
        } else if (status === 'active') {
          await db.execute(sql`
            UPDATE companies
            SET
              subscription_status = ${status},
              cancel_at_period_end = ${cancelAtEnd ? 1 : 0},
              current_period_end = ${periodEnd ? toMysqlDatetime(periodEnd) : null},
              past_due_since = NULL,
              cancelled_at = NULL
              ${planFromMeta ? sql`, subscription_plan = ${planFromMeta}` : sql``}
            WHERE stripe_subscription_id = ${subscription.id}
          `);
        } else {
          await db.execute(sql`
            UPDATE companies
            SET
              subscription_status = ${status},
              cancel_at_period_end = ${cancelAtEnd ? 1 : 0},
              current_period_end = ${periodEnd ? toMysqlDatetime(periodEnd) : null}
              ${planFromMeta ? sql`, subscription_plan = ${planFromMeta}` : sql``}
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
          attempt_count?: number;
        };
        const sub = invoice.subscription;
        const subId = typeof sub === 'string' ? sub : (sub as { id: string } | null)?.id ?? null;
        if (!subId) break;

        // Check whether this is the FIRST failure (past_due_since currently NULL)
        const [beforeRows] = await db.execute(sql`
          SELECT past_due_since FROM companies WHERE stripe_subscription_id = ${subId} LIMIT 1
        `) as any;
        const wasAlreadyPastDue = !!(beforeRows as any[])[0]?.past_due_since;

        // Set past_due; only record past_due_since on first failure (COALESCE)
        await db.execute(sql`
          UPDATE companies
          SET
            subscription_status = 'past_due',
            past_due_since = COALESCE(past_due_since, NOW())
          WHERE stripe_subscription_id = ${subId}
        `);

        // Fetch the updated past_due_since so we can compute the lock date
        const [afterRows] = await db.execute(sql`
          SELECT past_due_since FROM companies WHERE stripe_subscription_id = ${subId} LIMIT 1
        `) as any;
        const pastDueSince: Date | null = (afterRows as any[])[0]?.past_due_since
          ? new Date((afterRows as any[])[0].past_due_since)
          : null;

        const GRACE_DAYS = 30;
        const MS_PER_DAY = 24 * 60 * 60 * 1000;
        const lockDate = pastDueSince
          ? new Date(pastDueSince.getTime() + GRACE_DAYS * MS_PER_DAY)
          : null;
        const lockDateStr = lockDate
          ? lockDate.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
          : '30 days from the first failed payment';

        const contact = await getCompanyOwnerContact(subId);
        if (contact) {
          const updateUrl = 'https://iwillbuild.com/billing';
          const attemptCount = invoice.attempt_count ?? 1;
          const daysOverdue = pastDueSince
            ? Math.floor((Date.now() - pastDueSince.getTime()) / MS_PER_DAY)
            : 0;

          if (!wasAlreadyPastDue) {
            // First failure — send immediate notification
            void sendPaymentFailedEmail({
              to: contact.email,
              name: contact.name,
              companyName: contact.companyName,
              lockDate: lockDateStr,
              updateUrl,
            });
          } else if (daysOverdue >= 7 && attemptCount >= 2) {
            // 7-day+ reminder on subsequent retry attempts
            const daysLeft = lockDate
              ? Math.max(0, Math.ceil((lockDate.getTime() - Date.now()) / MS_PER_DAY))
              : GRACE_DAYS - daysOverdue;
            void sendPaymentReminderEmail({
              to: contact.email,
              name: contact.name,
              companyName: contact.companyName,
              lockDate: lockDateStr,
              daysLeft,
              updateUrl,
            });
          }
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
