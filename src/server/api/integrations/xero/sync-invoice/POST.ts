/**
 * POST /api/integrations/xero/sync-invoice/:invoiceId
 * Pushes an IWILLBUILD invoice to Xero as an ACCREC Invoice.
 * - Creates a Xero Contact for the customer if not already synced.
 * - Creates or updates the Xero Invoice.
 * - Stores the Xero InvoiceID back on the local invoice row.
 */
import type { Request, Response } from 'express';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { xeroPost, XeroNotConnectedError, XeroApiError } from '../../../../lib/xero-client.js';
interface XeroInvoiceResponse {
  Invoices?: Array<{
    InvoiceID: string;
    InvoiceNumber: string;
    Status: string;
    AmountDue: number;
    AmountPaid: number;
    Total: number;
  }>;
}

interface XeroContactResponse {
  Contacts?: Array<{ ContactID: string; Name: string }>;
}

/** Map IWILLBUILD status → Xero Invoice status */
function mapStatus(status: string): string {
  switch (status) {
    case 'draft': return 'DRAFT';
    case 'sent': case 'partially_paid': case 'overdue': return 'AUTHORISED';
    case 'paid': return 'PAID';
    case 'void': return 'VOIDED';
    default: return 'DRAFT';
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

    // Assign early so catch block can use it
    sessionCompanyId = profile.companyId;

    const isAdmin = profile.role === 'owner' || profile.role === 'admin' || profile.permAdmin === true;
    const canInvoices = isAdmin || profile.permInvoices !== false;
    if (!canInvoices) return res.status(403).json({ error: 'No invoice permission' });

    const invoiceId = parseInt(req.params.invoiceId, 10);
    if (!invoiceId) return res.status(400).json({ error: 'Invalid invoice ID' });

    // Load invoice + lines
    const [invRows] = await db.execute(
      sql`SELECT i.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone,
                 c.address as customer_address, c.abn as customer_abn, c.xero_contact_id
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

    // ── Validation ───────────────────────────────────────────────────────────
    if (!invoice.customer_id && !invoice.customer_name) {
      return res.status(400).json({ error: 'Please add a customer before syncing to Xero.' });
    }
    const validLines = (lineRows ?? []).filter(
      l => l.description && String(l.description).trim() && parseFloat(String(l.quantity)) > 0
    );
    if (validLines.length === 0) {
      return res.status(400).json({ error: 'Please add at least one invoice line (with description and quantity) before syncing to Xero.' });
    }

    // ── Step 1: Ensure Xero Contact ──────────────────────────────────────────
    let xeroContactId = invoice.xero_contact_id as string | null;

    if (!xeroContactId && invoice.customer_id) {
      // Upsert contact
      const contactPayload: Record<string, unknown> = {
        Name: invoice.customer_name ?? 'Unknown Customer',
      };
      if (invoice.customer_email) contactPayload.EmailAddress = invoice.customer_email;
      if (invoice.customer_phone) {
        contactPayload.Phones = [{ PhoneType: 'DEFAULT', PhoneNumber: invoice.customer_phone }];
      }
      if (invoice.customer_address) {
        contactPayload.Addresses = [{ AddressType: 'STREET', AddressLine1: invoice.customer_address }];
      }
      if (invoice.customer_abn) contactPayload.TaxNumber = invoice.customer_abn;

      const contactRes = await xeroPost(profile.companyId, '/Contacts', { Contacts: [contactPayload] }) as XeroContactResponse;
      const contact = contactRes?.Contacts?.[0];
      if (contact?.ContactID) {
        xeroContactId = contact.ContactID;
        // Save back to customer
        await db.execute(sql`
          UPDATE customers SET xero_contact_id = ${xeroContactId}, updated_at = NOW()
          WHERE id = ${invoice.customer_id} AND company_id = ${profile.companyId}
        `);
      }
    }

    // ── Step 2: Build Xero Invoice payload ───────────────────────────────────
    // TaxType intentionally omitted — Xero derives it from AccountCode.
    // Hardcoding OUTPUT2 caused 400/422 on orgs without that tax rate configured.
    // AccountCode '200' is the standard Xero AU/NZ "Sales" account.
    const lineItems = validLines.map((l) => ({
      Description: l.description,
      Quantity: parseFloat(String(l.quantity)) || 1,
      UnitAmount: parseFloat(String(l.rate)) || 0,
      AccountCode: '200',
    }));

    // LineAmountTypes intentionally omitted — Xero rejects both EXCLUSIVE and INCLUSIVE
    // on some org configurations. Omitting it lets Xero use the org's default tax setting.
    const xeroInvoicePayload: Record<string, unknown> = {
      Type: 'ACCREC',
      InvoiceNumber: invoice.invoice_number,
      Reference: invoice.title,
      Status: mapStatus(invoice.status as string),
      LineItems: lineItems,
    };

    if (xeroContactId) {
      xeroInvoicePayload.Contact = { ContactID: xeroContactId };
    } else if (invoice.customer_name) {
      xeroInvoicePayload.Contact = { Name: invoice.customer_name };
    }

    if (invoice.issue_date) xeroInvoicePayload.Date = String(invoice.issue_date).split('T')[0];
    if (invoice.due_date) xeroInvoicePayload.DueDate = String(invoice.due_date).split('T')[0];

    // ── Step 3: Create or update in Xero ────────────────────────────────────
    const existingXeroId = invoice.accounting_invoice_id as string | null;
    let xeroInvoiceId: string;
    let xeroInvoiceNumber: string;
    let xeroStatus: string;

    // ── Structured diagnostic log (no tokens / PII) ──────────────────────────
    console.log('[xero-sync] attempt', JSON.stringify({
      invoiceId,
      companyId: profile.companyId,
      invoiceNumber: invoice.invoice_number,
      status: invoice.status,
      hasCustomer: !!(invoice.customer_id || invoice.customer_name),
      xeroContactId: xeroContactId ? 'present' : 'none',
      validLineCount: validLines.length,
      existingXeroId: existingXeroId ? 'present' : 'none',
      lineAmountTypes: 'omitted', // omitted so Xero uses org default
      accountCode: lineItems[0]?.AccountCode ?? 'none',
      hasDate: !!xeroInvoicePayload.Date,
      hasDueDate: !!xeroInvoicePayload.DueDate,
    }));

    if (existingXeroId) {
      // Update existing
      xeroInvoicePayload.InvoiceID = existingXeroId;
      const xeroRes = await xeroPost(profile.companyId, '/Invoices', { Invoices: [xeroInvoicePayload] }) as XeroInvoiceResponse;
      const xi = xeroRes?.Invoices?.[0];
      if (!xi?.InvoiceID) return res.status(500).json({ error: 'Xero did not return invoice data' });
      xeroInvoiceId = xi.InvoiceID;
      xeroInvoiceNumber = xi.InvoiceNumber;
      xeroStatus = xi.Status;
    } else {
      // Create new
      const xeroRes = await xeroPost(profile.companyId, '/Invoices', { Invoices: [xeroInvoicePayload] }) as XeroInvoiceResponse;
      const xi = xeroRes?.Invoices?.[0];
      if (!xi?.InvoiceID) return res.status(500).json({ error: 'Xero did not return invoice data' });
      xeroInvoiceId = xi.InvoiceID;
      xeroInvoiceNumber = xi.InvoiceNumber;
      xeroStatus = xi.Status;
    }

    // ── Step 4: Save Xero IDs back to local invoice ──────────────────────────
    await db.execute(sql`
      UPDATE invoices
      SET accounting_provider     = 'xero',
          accounting_invoice_id   = ${xeroInvoiceId},
          accounting_sync_status  = 'synced',
          accounting_sync_error   = NULL,
          updated_at              = NOW()
      WHERE id = ${invoiceId} AND company_id = ${profile.companyId}
    `);

    res.json({
      ok: true,
      xeroInvoiceId,
      xeroInvoiceNumber,
      xeroStatus,
      message: existingXeroId ? 'Invoice updated in Xero' : 'Invoice created in Xero',
    });
  } catch (err) {
    // Save error to invoice row — MUST include company_id guard to prevent cross-tenant writes
    const invoiceId = parseInt(req.params.invoiceId, 10);
    if (invoiceId && typeof sessionCompanyId === 'number') {
      try {
        const errMsg = err instanceof Error ? err.message : String(err);
        await db.execute(sql`
          UPDATE invoices
          SET accounting_sync_status = 'error', accounting_sync_error = ${errMsg.substring(0, 500)}, updated_at = NOW()
          WHERE id = ${invoiceId} AND company_id = ${sessionCompanyId}
        `);
      } catch { /* non-fatal */ }
    }

    if (err instanceof XeroNotConnectedError) {
      return res.status(400).json({ error: 'Xero is not connected. Connect in Settings → Accounting.' });
    }
    if (err instanceof XeroApiError) {
      // Try to extract a human-readable message from Xero's JSON error body
      // Xero returns: { Elements: [{ ValidationErrors: [{ Message: "..." }] }] }
      // or: { Message: "...", Detail: "..." }
      let userMessage = `Xero rejected the invoice (HTTP ${err.status})`;
      try {
        const parsed = JSON.parse(err.body) as Record<string, unknown>;
        // Validation errors on invoice elements
        const elements = parsed.Elements as Array<{ ValidationErrors?: Array<{ Message: string }> }> | undefined;
        const firstValidation = elements?.[0]?.ValidationErrors?.[0]?.Message;
        if (firstValidation) {
          userMessage = `Xero validation error: ${firstValidation}`;
        } else if (typeof parsed.Message === 'string' && parsed.Message) {
          userMessage = `Xero error: ${parsed.Message}`;
          if (typeof parsed.Detail === 'string' && parsed.Detail) {
            userMessage += ` — ${parsed.Detail}`;
          }
        } else if (typeof parsed.Detail === 'string' && parsed.Detail) {
          userMessage = `Xero error: ${parsed.Detail}`;
        }
      } catch {
        // Body wasn't JSON — use raw text (truncated)
        userMessage = `Xero error (HTTP ${err.status}): ${err.body.substring(0, 200)}`;
      }
      console.error('POST /api/integrations/xero/sync-invoice XeroApiError:', err.status, err.body);
      return res.status(502).json({ error: userMessage });
    }
    console.error('POST /api/integrations/xero/sync-invoice error:', err);
    res.status(500).json({ error: 'Failed to sync invoice to Xero' });
  }
}
