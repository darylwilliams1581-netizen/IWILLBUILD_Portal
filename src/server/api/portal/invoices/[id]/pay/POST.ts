/**
 * POST /api/portal/invoices/:id/pay
 * Creates a Stripe Checkout session for a portal customer to pay an invoice.
 * Body: { token: string }
 * Returns: { checkoutUrl: string }
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getStripe } from '../../../../../lib/stripe-client.js';

async function resolveToken(token: string) {
  const [rows] = await db.execute(sql`
    SELECT company_id, customer_id FROM customer_portal_tokens
    WHERE token = ${token} AND expires_at > NOW()
    LIMIT 1
  `) as unknown as [Array<Record<string, unknown>>];
  return rows?.[0] ?? null;
}

export default async function handler(req: Request, res: Response) {
  try {
    const { token } = req.body;
    if (!token) return res.status(401).json({ error: 'token required' });

    const ctx = await resolveToken(token);
    if (!ctx) return res.status(401).json({ error: 'Invalid or expired token' });

    const invoiceId = parseInt(String(req.params.id), 10);

    // Verify invoice belongs to this customer
    const [invRows] = await db.execute(sql`
      SELECT i.id, i.invoice_number, i.title, i.total_inc_gst, i.status, i.currency,
             c.email AS customer_email, c.name AS customer_name
      FROM invoices i
      JOIN jobs j ON j.id = i.job_id
      JOIN customers c ON c.id = j.customer_id
      WHERE i.id = ${invoiceId}
        AND i.company_id = ${ctx.company_id}
        AND j.customer_id = ${ctx.customer_id}
        AND i.status IN ('unpaid', 'overdue', 'partial')
      LIMIT 1
    `) as unknown as [Array<Record<string, unknown>>];

    if (!invRows?.length) return res.status(404).json({ error: 'Invoice not found or already paid' });

    const inv = invRows[0];
    const amountCents = Math.round(Number(inv.total_inc_gst) * 100);
    if (amountCents <= 0) return res.status(400).json({ error: 'Invoice amount must be greater than zero' });

    const stripe = await getStripe();
    const origin = req.headers.origin || `https://${req.headers.host}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: String(inv.customer_email ?? ''),
      line_items: [{
        price_data: {
          currency: String(inv.currency ?? 'aud').toLowerCase(),
          product_data: {
            name: String(inv.title || inv.invoice_number),
            description: `Invoice ${String(inv.invoice_number)} — ${String(inv.customer_name)}`,
          },
          unit_amount: amountCents,
        },
        quantity: 1,
      }],
      metadata: {
        invoiceId: String(invoiceId),
        companyId: String(ctx.company_id),
        source: 'customer_portal',
      },
      success_url: `${origin}/portal/payment-success?invoice=${invoiceId}&token=${token}`,
      cancel_url: `${origin}/portal/dashboard?token=${token}`,
    });

    res.json({ checkoutUrl: session.url, sessionId: session.id });
  } catch (err) {
    console.error('POST /api/portal/invoices/:id/pay error:', err);
    res.status(500).json({ error: 'Failed to create payment session' });
  }
}
