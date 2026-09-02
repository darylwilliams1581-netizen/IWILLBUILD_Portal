/**
 * POST /api/billing/cancel-subscription
 * Cancels the company subscription at period end (never immediately).
 *
 * STRICT ORDERING — no DB-only fallback:
 *   1. Resolve the company's Stripe subscription ID (error if missing/ambiguous).
 *   2. Call Stripe: subscriptions.update({ cancel_at_period_end: true }).
 *   3. Only on Stripe success: write cancel_pending + period_end to DB.
 *   4. Send confirmation email (fire-and-forget, non-blocking).
 *
 * If Stripe fails at step 2, the DB is NOT touched and no email is sent.
 * Idempotent: if already cancel_pending with the same sub ID, returns success.
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
import { sendEmail } from '../../../email.js';

async function sendCancellationEmail(opts: {
  to: string;
  name: string;
  companyName: string;
  accessUntil: string;
}) {
  const { to, name, companyName, accessUntil } = opts;
  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1e293b;">
      <div style="background:#7C3AED;padding:24px 32px;border-radius:8px 8px 0 0;">
        <h1 style="color:#fff;margin:0;font-size:22px;font-weight:700;">Subscription Cancelled</h1>
      </div>
      <div style="background:#f8fafc;padding:32px;border-radius:0 0 8px 8px;border:1px solid #e2e8f0;border-top:none;">
        <p style="margin:0 0 16px;">Hi ${name},</p>
        <p style="margin:0 0 16px;">
          We've received your cancellation request for <strong>${companyName}</strong> on IWIllBUIlD.
        </p>
        <p style="margin:0 0 24px;">
          Your account will remain fully active until <strong>${accessUntil}</strong>.
          You can reactivate at any time before then.
        </p>
        <div style="background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:16px 20px;margin:0 0 24px;">
          <p style="margin:0 0 4px;font-size:13px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;">What happens next</p>
          <ul style="margin:8px 0 0;padding-left:20px;color:#334155;font-size:14px;line-height:1.7;">
            <li>All your data is safely retained</li>
            <li>You can export your records at any time</li>
            <li>No further charges will be made</li>
          </ul>
        </div>
        <p style="margin:0 0 24px;font-size:14px;color:#475569;">
          Changed your mind? Log in and reactivate your subscription from the Billing page before your access ends.
        </p>
        <a href="https://iwillbuild.com/billing"
           style="display:inline-block;background:#7C3AED;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;font-size:14px;">
          Manage Subscription
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
    `We've received your cancellation request for ${companyName} on IWIllBUIlD.`,
    ``,
    `Your account will remain fully active until ${accessUntil}. You can reactivate at any time before then.`,
    ``,
    `What happens next:`,
    `- All your data is safely retained`,
    `- You can export your records at any time`,
    `- No further charges will be made`,
    ``,
    `Changed your mind? Log in and reactivate from the Billing page: https://iwillbuild.com/billing`,
    ``,
    `Questions? Email support@iwillbuild.com`,
  ].join('\n');
  try {
    await sendEmail({ to, subject: `Your IWIllBUIlD subscription has been cancelled`, fromName: 'IWIllBUIlD', html, text });
  } catch (emailErr) {
    console.error('billing/cancel-subscription: failed to send confirmation email:', emailErr);
  }
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
    if (!['owner', 'admin'].includes(profile.role)) {
      return res.status(403).json({ error: 'Owner or Admin access required.' });
    }

    const company = await db.query.companies.findFirst({ where: eq(companies.id, profile.companyId) });
    if (!company) return res.status(404).json({ error: 'Company not found.' });

    const userEmail = session.user.email ?? '';
    const userName = session.user.name ?? userEmail.split('@')[0] ?? 'there';
    const companyName = company.name ?? 'your company';

    // ── Resolve Stripe subscription ID ────────────────────────────────────────
    // We require an unambiguous Stripe subscription. If the company row has no
    // stripe_subscription_id, we do NOT fall back to a DB-only cancel — we
    // return a billing-link error so the user can contact support.
    if (!company.stripeSubscriptionId) {
      return res.status(422).json({
        error: 'billing_link_missing',
        message:
          'We could not find a Stripe subscription linked to your account. ' +
          'Please contact support@iwillbuild.com and we will resolve this for you.',
        billingUrl: '/billing',
      });
    }

    const stripe = await getStripe();

    // ── Idempotency check ─────────────────────────────────────────────────────
    // If already cancel_pending for this subscription, return success without
    // hitting Stripe again (safe to call repeatedly).
    if (
      company.subscriptionStatus === 'cancel_pending' &&
      company.cancelAtPeriodEnd
    ) {
      const periodEnd = company.currentPeriodEnd ? new Date(company.currentPeriodEnd) : null;
      const accessUntil = periodEnd
        ? periodEnd.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
        : 'the end of your billing period';
      return res.json({
        ok: true,
        alreadyCancelled: true,
        cancelAtPeriodEnd: true,
        currentPeriodEnd: periodEnd?.toISOString() ?? null,
        message: `Your subscription is already set to cancel. You retain access until ${accessUntil}.`,
      });
    }

    // ── Step 1: Call Stripe — cancel at period end ────────────────────────────
    // DB is NOT touched until Stripe confirms. If this throws, we return 500
    // and the DB remains unchanged.
    let subscription;
    try {
      subscription = await stripe.subscriptions.update(company.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });
    } catch (stripeErr: unknown) {
      const msg = stripeErr instanceof Error ? stripeErr.message : String(stripeErr);
      console.error('billing/cancel-subscription: Stripe error:', stripeErr);
      return res.status(502).json({
        error: 'stripe_error',
        message: `Stripe could not process the cancellation: ${msg}. Your subscription has not been changed.`,
      });
    }

    // Stripe confirmed — extract the authoritative period end from Stripe's response
    const periodEnd = subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000)
      : null;

    // ── Step 2: Write to DB only after Stripe success ─────────────────────────
    await db.execute(sql`
      UPDATE companies
      SET
        subscription_status = 'cancel_pending',
        cancel_at_period_end = 1,
        current_period_end = ${periodEnd ? periodEnd.toISOString().slice(0, 19).replace('T', ' ') : null}
      WHERE id = ${company.id}
    `);

    const accessUntil = periodEnd
      ? periodEnd.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
      : 'the end of your billing period';

    // ── Step 3: Send confirmation email (fire-and-forget) ─────────────────────
    void sendCancellationEmail({ to: userEmail, name: userName, companyName, accessUntil });

    return res.json({
      ok: true,
      cancelAtPeriodEnd: true,
      currentPeriodEnd: periodEnd?.toISOString() ?? null,
      message: `Your subscription will remain active until ${accessUntil}. You can reactivate before then.`,
    });
  } catch (error) {
    console.error('billing/cancel-subscription error:', error);
    return res.status(500).json({ error: String(error) });
  }
}
