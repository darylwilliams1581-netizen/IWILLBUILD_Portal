/**
 * POST /api/billing/apple/confirm
 * Verifies a StoreKit 2 transaction and activates that company.
 * The signed-in owner is the only link between the Apple purchase and the company.
 */
import type { Request, Response } from 'express';
import { and, eq, ne } from 'drizzle-orm';
import { db } from '../../../../db/client.js';
import { companies, profiles } from '../../../../db/schema.js';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { verifyAppleTransaction } from '../../../../lib/apple-jws.js';

function headersFrom(req: Request): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) headers.set(key, Array.isArray(value) ? value[0] : value);
  }
  return headers;
}

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: headersFrom(req) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company found.' });
    if (profile.role !== 'owner') return res.status(403).json({ error: 'Only the company owner can subscribe.' });

    const jws = typeof req.body?.jws === 'string' ? req.body.jws : '';
    if (!jws) return res.status(400).json({ error: 'Missing Apple transaction.' });

    let transaction;
    try {
      transaction = verifyAppleTransaction(jws);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Apple could not verify this purchase.';
      return res.status(402).json({ error: message });
    }

    const appleSubscriptionId = `apple:${transaction.originalTransactionId}`;
    const [taken] = await db.select({ id: companies.id }).from(companies).where(and(
      eq(companies.stripeSubscriptionId, appleSubscriptionId),
      ne(companies.id, profile.companyId),
    )).limit(1);
    if (taken) return res.status(409).json({ error: 'This Apple subscription is already linked to another company.' });

    const company = await db.query.companies.findFirst({ where: eq(companies.id, profile.companyId) });
    if (!company) return res.status(404).json({ error: 'Company not found.' });

    const currentStatus = company.subscriptionStatus ?? 'trial';
    const currentPeriodEnd = company.currentPeriodEnd ? new Date(company.currentPeriodEnd).getTime() : 0;
    const existingSubscriptionId = company.stripeSubscriptionId ?? '';
    const existingAppleSubscription = existingSubscriptionId.startsWith('apple:');
    const currentAccessUnexpired = currentPeriodEnd > Date.now();
    const activeStatus = ['active', 'cancel_pending', 'cancel_at_period_end', 'past_due'].includes(currentStatus);
    const staleExternalSubscription = ['cancelled', 'trial_expired'].includes(currentStatus) && !currentAccessUnexpired;

    if (existingAppleSubscription && existingSubscriptionId !== appleSubscriptionId && (currentAccessUnexpired || activeStatus)) {
      return res.status(409).json({
        error: 'existing_subscription',
        message: 'This company already has an active Apple subscription linked to a different purchase.',
      });
    }

    if (!existingAppleSubscription && (currentAccessUnexpired || activeStatus || (existingSubscriptionId && !staleExternalSubscription))) {
      return res.status(409).json({
        error: 'existing_subscription',
        message: 'This company already has a paid or managed subscription. Its current billing must end before an Apple subscription can be linked.',
      });
    }

    await db.update(companies).set({
      plan: 'company',
      subscriptionStatus: 'active',
      currentPeriodEnd: new Date(transaction.expiresDate),
      cancelAtPeriodEnd: false,
      cancelledAt: null,
      stripeSubscriptionId: appleSubscriptionId,
      stripePriceId: transaction.productId,
    }).where(eq(companies.id, profile.companyId));

    return res.status(200).json({
      ok: true,
      status: 'active',
      expiresAt: new Date(transaction.expiresDate).toISOString(),
    });
  } catch (error) {
    console.error('[billing/apple/confirm]', error instanceof Error ? error.message : error);
    return res.status(500).json({ error: 'Could not save the Apple subscription.' });
  }
}
