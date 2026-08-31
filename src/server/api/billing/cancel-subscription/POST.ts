/**
 * POST /api/billing/cancel-subscription
 * Cancels the company subscription at period end (not immediately).
 * Sets cancel_at_period_end = true on the Stripe subscription.
 * Updates company.subscription_status to 'cancel_pending'.
 * Sends a confirmation email to the cancelling user.
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
  accessUntil: string | null;
}) {
  const { to, name, companyName, accessUntil } = opts;
  const accessLine = accessUntil
    ? `Your account will remain fully active until <strong>${accessUntil}</strong>. You can reactivate at any time before then.`
    : `Your subscription has been cancelled. Your account will remain in view-only mode.`;

  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1e293b;">
      <div style="background:#7C3AED;padding:24px 32px;border-radius:8px 8px 0 0;">
        <h1 style="color:#fff;margin:0;font-size:22px;font-weight:700;">Subscription Cancelled</h1>
      </div>
      <div style="background:#f8fafc;padding:32px;border-radius:0 0 8px 8px;border:1px solid #e2e8f0;border-top:none;">
        <p style="margin:0 0 16px;">Hi ${name},</p>
        <p style="margin:0 0 16px;">
          We've received your cancellation request for <strong>${companyName}</strong> on IWILLBUILD.
        </p>
        <p style="margin:0 0 24px;">${accessLine}</p>
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
          If you have any questions, reply to this email or contact us at
          <a href="mailto:support@iwillbuild.com" style="color:#7C3AED;">support@iwillbuild.com</a>.
        </p>
      </div>
    </div>
  `;

  const text = [
    `Hi ${name},`,
    ``,
    `We've received your cancellation request for ${companyName} on IWILLBUILD.`,
    ``,
    accessUntil
      ? `Your account will remain fully active until ${accessUntil}. You can reactivate at any time before then.`
      : `Your subscription has been cancelled. Your account will remain in view-only mode.`,
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
    await sendEmail({
      to,
      subject: `Your IWILLBUILD subscription has been cancelled`,
      fromName: 'IWILLBUILD',
      html,
      text,
    });
  } catch (emailErr) {
    // Non-fatal — log but don't fail the cancellation
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

    // If there's no Stripe subscription (e.g. webhook write-back failed), cancel
    // the DB record directly so the user isn't stuck in an unresolvable state.
    // Keep cancel_pending (not cancelled) so the gate still grants access until
    // current_period_end — if we have no period end, set it to end of today as
    // a safe fallback so they aren't immediately locked out.
    if (!company.stripeSubscriptionId) {
      const existingPeriodEnd = company.currentPeriodEnd
        ? new Date(company.currentPeriodEnd)
        : null;
      // Use existing period end if it's in the future, otherwise end of today
      const now = new Date();
      const accessUntilDate = (existingPeriodEnd && existingPeriodEnd > now)
        ? existingPeriodEnd
        : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      const accessUntilSql = accessUntilDate.toISOString().slice(0, 19).replace('T', ' ');

      await db.execute(sql`
        UPDATE companies
        SET
          subscription_status = 'cancel_pending',
          cancel_at_period_end = 1,
          current_period_end = ${accessUntilSql}
        WHERE id = ${company.id}
      `);

      const accessUntil = accessUntilDate.toLocaleDateString('en-AU', {
        day: 'numeric', month: 'long', year: 'numeric',
      });
      void sendCancellationEmail({ to: userEmail, name: userName, companyName, accessUntil });
      return res.json({
        ok: true,
        cancelAtPeriodEnd: true,
        currentPeriodEnd: accessUntilDate.toISOString(),
        message: `Your subscription has been cancelled. You'll retain access until ${accessUntil}.`,
      });
    }

    const stripe = await getStripe();

    // Cancel at period end — access remains until billing cycle ends
    const subscription = await stripe.subscriptions.update(company.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    const periodEnd = subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000)
      : null;

    // Update company: mark cancel_pending, store period end
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
      : null;

    // Send confirmation email (non-blocking)
    void sendCancellationEmail({ to: userEmail, name: userName, companyName, accessUntil });

    res.json({
      ok: true,
      cancelAtPeriodEnd: true,
      currentPeriodEnd: periodEnd?.toISOString() ?? null,
      message: accessUntil
        ? `Your subscription will remain active until ${accessUntil}. You can reactivate before then.`
        : 'Your subscription has been set to cancel at the end of the current billing period.',
    });
  } catch (error) {
    console.error('billing/cancel-subscription error:', error);
    res.status(500).json({ error: String(error) });
  }
}
