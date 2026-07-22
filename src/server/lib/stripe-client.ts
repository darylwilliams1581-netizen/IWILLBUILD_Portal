/**
 * Lazy Stripe client — dynamic import keeps Stripe (~8 MB) out of the main
 * SSR bundle traversal, reducing Rollup peak memory during publish.
 *
 * Usage:
 *   const stripe = await getStripe();
 *   const session = await stripe.checkout.sessions.retrieve(id);
 */

import { getSecret } from '#airo/secrets';
import type Stripe from 'stripe';

let _stripe: Stripe | null = null;

export async function getStripe(): Promise<Stripe> {
  if (_stripe) return _stripe;
  const { default: StripeClass } = await import('stripe');
  _stripe = new StripeClass(getSecret('STRIPE_SECRET_KEY') ?? '', {
    apiVersion: '2025-05-28.basil',
  });
  return _stripe;
}
