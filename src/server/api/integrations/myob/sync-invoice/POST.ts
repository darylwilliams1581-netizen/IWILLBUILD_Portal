/**
 * POST /api/integrations/myob/sync-invoice/:invoiceId
 * Pushes an IWIIlBUILD invoice to MYOB AccountRight as a Sale Invoice.
 */
import type { Request, Response } from 'express';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { myobPost, myobPut, myobGet, MyobNotConnectedError, MyobApiError } from '../../../../lib/myob-client.js';

interface MyobCustomer {
  UID: string;
  DisplayID: string;
  Name: string;
}

interface MyobCustomerResponse {
  Items?: MyobCustomer[];
}

interface MyobInvoiceResponse {
  UID?: string;
  Number?: string;
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
                 c.abn as customer_abn, c.myob_customer_uid
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

    // ── Step 1: Ensure MYOB Customer ─────────────────────────────────────────
    let myobCustomerUid = invoice.myob_customer_uid as string | null;

    if (!myobCustomerUid && invoice.customer_id) {
      const customerName = String(invoice.customer_name ?? 'Unknown Customer');
      try {
        const searchRes = await myobGet(
          profile.companyId,
          `/Contact/Customer?$filter=CompanyName eq '${encodeURIComponent(customerName)}'&$top=1`
        ) as MyobCustomerResponse;
        const existing = searchRes?.Items?.[0];
        if (existing?.UID) myobCustomerUid = existing.UID;
      } catch { /* fall through to create */ }

      if (!myobCustomerUid) {
        const customerPayload: Record<string, unknown> = {
          CompanyName: customerName,
          IsActive: true,
          IsSupplier: false,
          IsCustomer: true,
        };
        if (invoice.customer_email) customerPayload.EmailAddress = invoice.customer_email;
        if (invoice.customer_abn) customerPayload.ABN = String(invoice.customer_abn).replace(/\s/g, '');

        const createRes = await myobPost(profile.companyId, '/Contact/Customer', customerPayload) as MyobCustomer;
        if (createRes?.UID) {
          myobCustomerUid = createRes.UID;
          await db.execute(sql`
            UPDATE customers SET myob_customer_uid = ${myobCustomerUid}, updated_at = NOW()
            WHERE id = ${invoice.customer_id} AND company_id = ${profile.companyId}
          `);
        }
      }
    }

    // ── Step 2: Build MYOB Invoice payload ───────────────────────────────────
    const lines = (lineRows ?? []).map((l) => ({
      Type: 'Transaction',
      Description: String(l.description ?? ''),
      UnitCount: parseFloat(String(l.quantity ?? '1')),
      UnitPrice: parseFloat(String(l.rate ?? '0')),
      Total: parseFloat(String(l.amount ?? '0')),
      IsTaxInclusive: false,
      TaxCode: { UID: null, Code: 'GST' }, // MYOB will resolve by code
    }));

    const invoiceDate = invoice.issue_date
      ? String(invoice.issue_date).split('T')[0]
      : new Date().toISOString().split('T')[0];

    const myobPayload: Record<string, unknown> = {
      Number: invoice.invoice_number,
      Date: invoiceDate,
      IsTaxInclusive: false,
      Lines: lines,
      Comment: invoice.notes ? String(invoice.notes).substring(0, 255) : undefined,
    };

    if (invoice.due_date) {
      myobPayload.TermsPaymentIsDue = 'CashOnDelivery'; // will be overridden by date
      myobPayload.TermsDueDate = String(invoice.due_date).split('T')[0];
    }

    if (myobCustomerUid) {
      myobPayload.Customer = { UID: myobCustomerUid };
    }

    // ── Step 3: Create or update in MYOB ─────────────────────────────────────
    const existingMyobUid = invoice.myob_invoice_uid as string | null;
    let myobInvoiceUid: string;
    let myobInvoiceNumber: string;

    if (existingMyobUid) {
      myobPayload.UID = existingMyobUid;
      const updateRes = await myobPut(profile.companyId, `/Sale/Invoice/Service/${existingMyobUid}`, myobPayload) as MyobInvoiceResponse;
      myobInvoiceUid = existingMyobUid;
      myobInvoiceNumber = updateRes?.Number ?? String(invoice.invoice_number ?? '');
    } else {
      const createRes = await myobPost(profile.companyId, '/Sale/Invoice/Service', myobPayload) as MyobInvoiceResponse;
      if (!createRes?.UID) return res.status(500).json({ error: 'MYOB did not return invoice UID' });
      myobInvoiceUid = createRes.UID;
      myobInvoiceNumber = createRes.Number ?? String(invoice.invoice_number ?? '');
    }

    // ── Step 4: Save MYOB UID back to local invoice ──────────────────────────
    await db.execute(sql`
      UPDATE invoices
      SET accounting_provider = 'myob',
          myob_invoice_uid    = ${myobInvoiceUid},
          myob_sync_status    = 'synced',
          myob_sync_error     = NULL,
          updated_at          = NOW()
      WHERE id = ${invoiceId} AND company_id = ${profile.companyId}
    `);

    res.json({
      ok: true,
      myobInvoiceUid,
      myobInvoiceNumber,
      message: existingMyobUid ? 'Invoice updated in MYOB' : 'Invoice created in MYOB',
    });
  } catch (err) {
    const invoiceId = parseInt(req.params.invoiceId, 10);
    if (invoiceId && typeof sessionCompanyId === 'number') {
      try {
        const errMsg = err instanceof Error ? err.message : String(err);
        await db.execute(sql`
          UPDATE invoices
          SET myob_sync_status = 'error', myob_sync_error = ${errMsg.substring(0, 500)}, updated_at = NOW()
          WHERE id = ${invoiceId} AND company_id = ${sessionCompanyId}
        `);
      } catch { /* non-fatal */ }
    }
    if (err instanceof MyobNotConnectedError) {
      return res.status(400).json({ error: 'MYOB AccountRight is not connected. Connect in Settings → Accounting.' });
    }
    if (err instanceof MyobApiError) {
      return res.status(502).json({ error: `MYOB API error: ${err.message}` });
    }
    console.error('POST /api/integrations/myob/sync-invoice error:', err);
    res.status(500).json({ error: 'Failed to sync invoice to MYOB' });
  }
}
