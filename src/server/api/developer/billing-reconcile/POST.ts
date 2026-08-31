/**
 * POST /api/developer/billing-reconcile
 * Platform developer only.
 *
 * Safely resolves a broken Stripe billing link for a company.
 * Designed specifically for the EnergyQ / company 2 → company 5 situation
 * where the Stripe subscription was created under company 2's customer but
 * the active profile is on company 5.
 *
 * RULES:
 *   - Never creates a new Stripe customer or subscription.
 *   - Never modifies the Stripe subscription itself.
 *   - Only writes to the DB if exactly ONE unambiguous active Stripe subscription
 *     is found for the customer.
 *   - Returns a dry-run report when dryRun: true (default).
 *   - Requires explicit dryRun: false to commit.
 *   - Idempotent: safe to call repeatedly.
 *
 * Request body:
 *   {
 *     targetCompanyId: number,       // company to receive the Stripe link (company 5)
 *     sourceCustomerId?: string,     // optional: Stripe customer ID to look up (from company 2)
 *     dryRun?: boolean               // default true — report only, no DB writes
 *   }
 */
import type { Request, Response } from 'express';
import { getSecret } from '#airo/secrets';
import { getStripe } from '../../../lib/stripe-client.js';
import { db } from '../../../db/client.js';
import { companies } from '../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { PLATFORM_OWNER_EMAILS } from '../../../lib/platform-owner-guard.js';

async function isPlatformDev(userId: string, email: string): Promise<boolean> {
  if (PLATFORM_OWNER_EMAILS.has(email.toLowerCase())) return true;
  try {
    const [rows] = await db.execute(
      sql`SELECT platform_role FROM profiles WHERE user_id = ${userId} LIMIT 1`
    ) as unknown as [Array<{ platform_role: string | null }>, unknown];
    return rows?.[0]?.platform_role === 'developer';
  } catch { return false; }
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
    if (!await isPlatformDev(session.user.id, session.user.email ?? '')) {
      return res.status(403).json({ error: 'Platform developer access required.' });
    }

    const {
      targetCompanyId,
      sourceCustomerId,
      dryRun = true,
    } = req.body as {
      targetCompanyId?: number;
      sourceCustomerId?: string;
      dryRun?: boolean;
    };

    if (!targetCompanyId || typeof targetCompanyId !== 'number') {
      return res.status(400).json({ error: 'targetCompanyId (number) is required.' });
    }

    // ── Load target company ───────────────────────────────────────────────────
    const targetCompany = await db.query.companies.findFirst({
      where: eq(companies.id, targetCompanyId),
    });
    if (!targetCompany) {
      return res.status(404).json({ error: `Company ${targetCompanyId} not found.` });
    }

    const stripe = await getStripe();

    // ── Determine which Stripe customer to look up ────────────────────────────
    // Priority: explicit sourceCustomerId > target company's own customer ID
    const customerId = sourceCustomerId ?? targetCompany.stripeCustomerId ?? null;
    if (!customerId) {
      return res.status(422).json({
        error: 'no_customer_id',
        message:
          `Company ${targetCompanyId} has no stripe_customer_id and no sourceCustomerId was provided. ` +
          `Pass sourceCustomerId to look up subscriptions from another company's customer.`,
      });
    }

    // ── Fetch all subscriptions for this customer from Stripe ─────────────────
    const allSubs = await stripe.subscriptions.list({
      customer: customerId,
      limit: 10,
      expand: ['data.latest_invoice'],
    });

    const activeSubs = allSubs.data.filter(
      (s) => s.status === 'active' || s.status === 'trialing' || s.status === 'past_due'
    );

    // ── Ambiguity check ───────────────────────────────────────────────────────
    if (activeSubs.length === 0) {
      return res.status(422).json({
        error: 'no_active_subscription',
        message: `No active/trialing/past_due subscriptions found for customer ${customerId}.`,
        allSubscriptions: allSubs.data.map((s) => ({
          id: s.id,
          status: s.status,
          cancelAtPeriodEnd: s.cancel_at_period_end,
          currentPeriodEnd: new Date(s.current_period_end * 1000).toISOString(),
        })),
      });
    }

    if (activeSubs.length > 1) {
      return res.status(422).json({
        error: 'ambiguous_subscriptions',
        message:
          `Found ${activeSubs.length} active subscriptions for customer ${customerId}. ` +
          `Cannot reconcile unambiguously. Manual intervention required.`,
        subscriptions: activeSubs.map((s) => ({
          id: s.id,
          status: s.status,
          cancelAtPeriodEnd: s.cancel_at_period_end,
          currentPeriodEnd: new Date(s.current_period_end * 1000).toISOString(),
        })),
      });
    }

    const sub = activeSubs[0];
    const periodEnd = new Date(sub.current_period_end * 1000);
    const planFromMeta = sub.metadata?.plan ?? null;

    // ── Build the reconciliation report ──────────────────────────────────────
    const report = {
      targetCompanyId,
      targetCompanyName: targetCompany.name,
      currentState: {
        stripeCustomerId: targetCompany.stripeCustomerId,
        stripeSubscriptionId: targetCompany.stripeSubscriptionId,
        subscriptionStatus: targetCompany.subscriptionStatus,
      },
      resolvedSubscription: {
        id: sub.id,
        status: sub.status,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        currentPeriodEnd: periodEnd.toISOString(),
        plan: planFromMeta,
        customerId,
      },
      proposedChanges: {
        stripeCustomerId: customerId,
        stripeSubscriptionId: sub.id,
        subscriptionStatus: sub.cancel_at_period_end ? 'cancel_pending' : 'active',
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        currentPeriodEnd: periodEnd.toISOString().slice(0, 19).replace('T', ' '),
        ...(planFromMeta ? { plan: planFromMeta } : {}),
      },
      dryRun,
      committed: false,
    };

    if (dryRun) {
      return res.json({
        ...report,
        message: 'Dry run complete. No changes made. Set dryRun: false to commit.',
      });
    }

    // ── Commit: write to DB ───────────────────────────────────────────────────
    const newStatus = sub.cancel_at_period_end ? 'cancel_pending' : 'active';
    const periodEndSql = periodEnd.toISOString().slice(0, 19).replace('T', ' ');

    if (planFromMeta) {
      await db.execute(sql`
        UPDATE companies
        SET
          stripe_customer_id = ${customerId},
          stripe_subscription_id = ${sub.id},
          subscription_status = ${newStatus},
          cancel_at_period_end = ${sub.cancel_at_period_end ? 1 : 0},
          current_period_end = ${periodEndSql},
          subscription_plan = ${planFromMeta}
        WHERE id = ${targetCompanyId}
      `);
    } else {
      await db.execute(sql`
        UPDATE companies
        SET
          stripe_customer_id = ${customerId},
          stripe_subscription_id = ${sub.id},
          subscription_status = ${newStatus},
          cancel_at_period_end = ${sub.cancel_at_period_end ? 1 : 0},
          current_period_end = ${periodEndSql}
        WHERE id = ${targetCompanyId}
      `);
    }

    return res.json({
      ...report,
      committed: true,
      message: `Reconciliation committed. Company ${targetCompanyId} now linked to subscription ${sub.id}.`,
    });
  } catch (error) {
    console.error('developer/billing-reconcile error:', error);
    return res.status(500).json({ error: String(error) });
  }
}
