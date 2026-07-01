/**
 * Stripe Session Details API
 *
 * Retrieves checkout session details for order confirmation.
 * Used by the success page to show order summary.
 *
 * Usage:
 *   GET /api/stripe/session/:sessionId
 *   Returns: { session: { customerName, amountTotal, currency, paymentStatus } }
 */
import type { Request, Response } from 'express';
import type Stripe from 'stripe';
import { getSecret } from '#airo/secrets';
import { getStripe } from '../../../../lib/stripe-client.js';

export default async function handler(req: Request, res: Response) {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      res.status(400).json({
        success: false,
        error: 'Missing sessionId parameter',
      });
      return;
    }

    // Validate session ID format
    const sid = Array.isArray(sessionId) ? sessionId[0] : sessionId;
    if (!sid.startsWith('cs_')) {
      res.status(400).json({
        success: false,
        error: 'Invalid session ID format',
      });
      return;
    }

    const stripe = await getStripe();

    const session = await stripe.checkout.sessions.retrieve(sid, {
      expand: ['line_items', 'subscription'],
    } as Parameters<typeof stripe.checkout.sessions.retrieve>[1]);

    res.json({
      success: true,
      session: {
        customerName: session.customer_details?.name,
        amountTotal: session.amount_total,
        currency: session.currency,
        paymentStatus: session.payment_status,
        status: session.status,
        mode: session.mode,
        lineItems: session.line_items?.data.map((item) => ({
          name: item.description,
          quantity: item.quantity,
          amount: item.amount_total,
        })),
      },
    });
  } catch (error) {
    // Log the real error server-side; return only generic, non-sensitive
    // strings to the client (never echo Stripe's verbatim message).
    console.error('get-session failed:', error);

    if (error instanceof Stripe.errors.StripeError) {
      if (error.code === 'resource_missing') {
        res.status(404).json({
          success: false,
          error: 'Session not found',
        });
        return;
      }

      res.status(error.statusCode || 500).json({
        success: false,
        error: 'Failed to retrieve session',
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve session',
    });
  }
}

