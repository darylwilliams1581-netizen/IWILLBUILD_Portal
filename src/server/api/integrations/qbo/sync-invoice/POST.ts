/**
 * POST /api/integrations/qbo/sync-invoice/:invoiceId
 * Pushes an IWILLBUILD invoice to QuickBooks Online as an Invoice.
 * - Creates a QBO Customer for the customer if not already synced.
 * - Creates or updates the QBO Invoice.
 * - Stores the QBO Id back on the local invoice row.
 */
import type { Request, Response } from 'express';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { qboPost, qboGet, QboNotConnectedError, QboApiError } from '../../../../lib/qbo-client.js';

interface QboCustomerResponse {
  Customer?: { Id: string; DisplayName: string };
  QueryResponse?: { Customer?: Array<{ Id: string; DisplayName: string }> };
}

interface QboInvoiceResponse {
  Invoice?: { Id: string; DocNumber: string; TxnStatus?: string; TotalAmt: number };
}

/** Map IWILLBUILD status → QBO TxnStatus */
function mapStatus(status: string): string {
  switch (status) {
    case 'paid': return 'Paid';
    case 'void': return 'Voided';
    default: return 'Pending'; // draft, sent, partially_paid, overdue
  }
}

export default async function handler(req: Request, res: Response) {
  // Hoisted outside try so the catch block can scope error writes to the correct company
  let sessionCompanyId: number | undefined;

  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    sessionCompanyId = profile.companyId;

    const isAdmin = profile.role === 'owner' || profile.role === 'admin' || profile.permAdmin === true;
    const canInvoices = isAdmin || profile.permInvoices !== false;
    if (!canInvoices) return res.status(403).json({ error: 'No invoice permission' });

    const invoiceId = parseInt(req.params.invoiceId, 10);
    if (!invoiceId) return res.status(400).json({ error: 'Invalid invoice ID' });

    // Load invoice + lines + customer
    const [invRows] = await db.execute(
      sql`SELECT i.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone,
                 c.address as customer_address, c.abn as customer_abn, c.qbo_customer_id
          FROM invoices i
          LEFT JOIN customers c ON c.id = i.customer_id AND c.company_id = i.company_id
          WHERE i.id = ${invoiceId} AND i.company_id = ${profile.companyId}
          LIMIT 1`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    const invoice = invRows?.[0];
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const [lineRows] = await db.execute(
      sql`SELECT * FROM invoice_lines WHERE invoice_id = ${invoiceId} ORDER BY sort_order ASC`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    // ── Step 1: Ensure QBO Customer ──────────────────────────────────────────
    let qboCustomerId = invoice.qbo_customer_id as string | null;

    if (!qboCustomerId && invoice.customer_id) {
      // Search for existing customer by name first
      const customerName = String(invoice.customer_name ?? 'Unknown Customer');
      try {
        const searchRes = await qboGet(
          profile.companyId,
          `/query?query=${encodeURIComponent(`SELECT * FROM Customer WHERE DisplayName = '${customerName.replace(/'/g, "\\'")}' MAXRESULTS 1`)}`
        ) as QboCustomerResponse;
        const existing = searchRes?.QueryResponse?.Customer?.[0];
        if (existing?.Id) {
          qboCustomerId = existing.Id;
        }
      } catch { /* fall through to create */ }

      if (!qboCustomerId) {
        const customerPayload: Record<string, unknown> = {
          DisplayName: customerName,
        };
        if (invoice.customer_email) customerPayload.PrimaryEmailAddr = { Address: invoice.customer_email };
        if (invoice.customer_phone) customerPayload.PrimaryPhone = { FreeFormNumber: String(invoice.customer_phone) };
        if (invoice.customer_abn) customerPayload.TaxIdentifier = String(invoice.customer_abn);

        const createRes = await qboPost(profile.companyId, '/customer', customerPayload) as QboCustomerResponse;
        const newCustomer = createRes?.Customer;
        if (newCustomer?.Id) {
          qboCustomerId = newCustomer.Id;
          await db.execute(sql`
            UPDATE customers SET qbo_customer_id = ${qboCustomerId}, updated_at = NOW()
            WHERE id = ${invoice.customer_id} AND company_id = ${profile.companyId}
          `);
        }
      }
    }

    // ── Step 2: Build QBO Invoice payload ────────────────────────────────────
    const lineItems = (lineRows ?? []).map((l, i) => ({
      LineNum: i + 1,
      Description: String(l.description ?? ''),
      Amount: parseFloat(String(l.amount ?? '0')),
      DetailType: 'SalesItemLineDetail',
      SalesItemLineDetail: {
        Qty: parseFloat(String(l.quantity ?? '1')),
        UnitPrice: parseFloat(String(l.rate ?? '0')),
        TaxCodeRef: { value: 'TAX' }, // GST
      },
    }));

    const qboInvoicePayload: Record<string, unknown> = {
      DocNumber: invoice.invoice_number,
      TxnDate: invoice.issue_date ? String(invoice.issue_date).split('T')[0] : new Date().toISOString().split('T')[0],
      Line: lineItems,
      TxnTaxDetail: { TotalTax: parseFloat(String(invoice.gst_amount ?? '0')) },
    };

    if (invoice.due_date) {
      qboInvoicePayload.DueDate = String(invoice.due_date).split('T')[0];
    }

    if (qboCustomerId) {
      qboInvoicePayload.CustomerRef = { value: qboCustomerId };
    }

    if (invoice.notes) {
      qboInvoicePayload.CustomerMemo = { value: String(invoice.notes).substring(0, 1000) };
    }

    // ── Step 3: Create or update in QBO ─────────────────────────────────────
    const existingQboId = invoice.qbo_invoice_id as string | null;
    let qboInvoiceId: string;
    let qboDocNumber: string;

    if (existingQboId) {
      // QBO requires SyncToken for updates — fetch it first
      const fetchRes = await qboGet(profile.companyId, `/invoice/${existingQboId}`) as QboInvoiceResponse;
      const existing = fetchRes?.Invoice;
      if (!existing) return res.status(404).json({ error: 'QBO invoice not found — it may have been deleted in QBO' });

      qboInvoicePayload.Id = existingQboId;
      qboInvoicePayload.SyncToken = (existing as Record<string, unknown>).SyncToken ?? '0';

      const updateRes = await qboPost(profile.companyId, '/invoice', qboInvoicePayload) as QboInvoiceResponse;
      const xi = updateRes?.Invoice;
      if (!xi?.Id) return res.status(500).json({ error: 'QBO did not return invoice data' });
      qboInvoiceId = xi.Id;
      qboDocNumber = xi.DocNumber;
    } else {
      const createRes = await qboPost(profile.companyId, '/invoice', qboInvoicePayload) as QboInvoiceResponse;
      const xi = createRes?.Invoice;
      if (!xi?.Id) return res.status(500).json({ error: 'QBO did not return invoice data' });
      qboInvoiceId = xi.Id;
      qboDocNumber = xi.DocNumber;
    }

    // ── Step 4: Save QBO ID back to local invoice ────────────────────────────
    await db.execute(sql`
      UPDATE invoices
      SET accounting_provider   = 'qbo',
          qbo_invoice_id        = ${qboInvoiceId},
          qbo_sync_status       = 'synced',
          qbo_sync_error        = NULL,
          updated_at            = NOW()
      WHERE id = ${invoiceId} AND company_id = ${profile.companyId}
    `);

    res.json({
      ok: true,
      qboInvoiceId,
      qboDocNumber,
      message: existingQboId ? 'Invoice updated in QuickBooks' : 'Invoice created in QuickBooks',
    });
  } catch (err) {
    const invoiceId = parseInt(req.params.invoiceId, 10);
    if (invoiceId && typeof sessionCompanyId === 'number') {
      try {
        const errMsg = err instanceof Error ? err.message : String(err);
        await db.execute(sql`
          UPDATE invoices
          SET qbo_sync_status = 'error', qbo_sync_error = ${errMsg.substring(0, 500)}, updated_at = NOW()
          WHERE id = ${invoiceId} AND company_id = ${sessionCompanyId}
        `);
      } catch { /* non-fatal */ }
    }
    if (err instanceof QboNotConnectedError) {
      return res.status(400).json({ error: 'QuickBooks Online is not connected. Connect in Settings → Accounting.' });
    }
    if (err instanceof QboApiError) {
      return res.status(502).json({ error: `QuickBooks API error: ${err.message}` });
    }
    console.error('POST /api/integrations/qbo/sync-invoice error:', err);
    res.status(500).json({ error: 'Failed to sync invoice to QuickBooks' });
  }
}
