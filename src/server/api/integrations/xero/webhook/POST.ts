/**
 * POST /api/integrations/xero/webhook
 * Receives Xero webhook events and updates local invoice status.
 *
 * Xero sends a SHA-256 HMAC signature in the X-Xero-Signature header.
 * We verify it against XERO_WEBHOOK_KEY before processing.
 *
 * Supported events:
 *   - INVOICE: status changes (PAID, VOIDED, etc.)
 */
import type { Request, Response } from 'express';
import { getSecret } from '#airo/secrets';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import crypto from 'crypto';
import { getValidXeroToken } from '../../../../lib/xero-client.js';

interface XeroWebhookEvent {
  resourceUrl: string;
  resourceId: string;
  eventDateUtc: string;
  eventType: string;
  eventCategory: string;
  tenantId: string;
  tenantType: string;
}

interface XeroWebhookPayload {
  events: XeroWebhookEvent[];
  firstEventSequence: number;
  lastEventSequence: number;
  entropy: string;
}

/** Map Xero invoice status → IWIllBUILD status */
function mapXeroStatus(xeroStatus: string): string | null {
  switch (xeroStatus.toUpperCase()) {
    case 'PAID': return 'paid';
    case 'VOIDED': return 'void';
    case 'AUTHORISED': return 'sent';
    case 'DRAFT': return 'draft';
    default: return null;
  }
}

export default async function handler(req: Request, res: Response) {
  // Xero requires a 200 response to the first "intent to receive" ping
  // even before we validate — but we still validate on real events.
  const webhookKey = getSecret('XERO_WEBHOOK_KEY');
  const signature = req.headers['x-xero-signature'] as string | undefined;

  // Xero sends raw body — express.raw() must be used for this route
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;

  if (webhookKey && signature && rawBody) {
    const expected = crypto
      .createHmac('sha256', webhookKey)
      .update(rawBody)
      .digest('base64');

    if (expected !== signature) {
      console.warn('[xero-webhook] Invalid signature — rejecting');
      return res.status(401).send('Invalid signature');
    }
  }

  // Always respond 200 quickly (Xero retries on non-200)
  res.status(200).send('OK');

  // Process asynchronously
  try {
    const payload = req.body as XeroWebhookPayload;
    if (!payload?.events?.length) return;

    for (const event of payload.events) {
      if (event.eventCategory !== 'INVOICE') continue;

      // Fetch the updated invoice from Xero to get current status
      // We look up by accounting_invoice_id in our DB
      const xeroInvoiceId = event.resourceId;

      const [rows] = await db.execute(
        sql`SELECT id, company_id, status FROM invoices WHERE accounting_invoice_id = ${xeroInvoiceId} LIMIT 1`
      ) as unknown as [Array<{ id: number; company_id: number; status: string }>, unknown];

      const localInvoice = rows?.[0];
      if (!localInvoice) continue;

      // Fetch current status from Xero
      try {
        const { accessToken, tenantId } = await getValidXeroToken(localInvoice.company_id);

        const xeroRes = await fetch(`https://api.xero.com/api.xro/2.0/Invoices/${xeroInvoiceId}`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Xero-Tenant-Id': tenantId,
            'Accept': 'application/json',
          },
        });

        if (!xeroRes.ok) continue;

        const data = await xeroRes.json() as { Invoices?: Array<{ Status: string; AmountDue: number; AmountPaid: number; Total: number }> };
        const xi = data?.Invoices?.[0];
        if (!xi) continue;

        const newStatus = mapXeroStatus(xi.Status);
        if (!newStatus || newStatus === localInvoice.status) continue;

        // Update local invoice
        const amountPaid = xi.AmountPaid ?? 0;
        const balanceDue = xi.AmountDue ?? 0;

        await db.execute(sql`
          UPDATE invoices
          SET status              = ${newStatus},
              amount_paid         = ${amountPaid},
              balance_due         = ${balanceDue},
              accounting_sync_status = 'synced',
              updated_at          = NOW()
          WHERE id = ${localInvoice.id} AND company_id = ${localInvoice.company_id}
        `);

        console.log(`[xero-webhook] Invoice ${localInvoice.id} updated: ${localInvoice.status} → ${newStatus}`);
      } catch (innerErr) {
        console.error(`[xero-webhook] Failed to update invoice ${localInvoice.id}:`, innerErr);
      }
    }
  } catch (err) {
    console.error('[xero-webhook] Processing error:', err);
  }
}
