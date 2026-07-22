/**
 * POST /api/integrations/xero/sync-customer/:customerId
 * Upserts the customer as a Xero Contact.
 * Returns { xeroContactId, xeroContactName }.
 */
import type { Request, Response } from 'express';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { xeroPost, XeroNotConnectedError, XeroApiError } from '../../../../lib/xero-client.js';

interface XeroContactResponse {
  Contacts?: Array<{ ContactID: string; Name: string }>;
}

export default async function handler(req: Request, res: Response) {
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

    const isAdmin = profile.role === 'owner' || profile.role === 'admin' || profile.permAdmin === true;
    const canInvoices = isAdmin || profile.permInvoices !== false;
    if (!canInvoices) return res.status(403).json({ error: 'No invoice permission' });

    const customerId = parseInt(req.params.customerId, 10);
    if (!customerId) return res.status(400).json({ error: 'Invalid customer ID' });

    // Load customer
    const [custRows] = await db.execute(
      sql`SELECT * FROM customers WHERE id = ${customerId} AND company_id = ${profile.companyId} LIMIT 1`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    const customer = custRows?.[0];
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    // Build Xero Contact payload
    const contactPayload: Record<string, unknown> = {
      Name: customer.name,
    };
    if (customer.email) contactPayload.EmailAddress = customer.email;
    if (customer.phone || customer.mobile) {
      contactPayload.Phones = [];
      if (customer.phone) (contactPayload.Phones as unknown[]).push({ PhoneType: 'DEFAULT', PhoneNumber: customer.phone });
      if (customer.mobile) (contactPayload.Phones as unknown[]).push({ PhoneType: 'MOBILE', PhoneNumber: customer.mobile });
    }
    if (customer.address) {
      contactPayload.Addresses = [{ AddressType: 'STREET', AddressLine1: customer.address }];
    }
    if (customer.abn) {
      contactPayload.TaxNumber = customer.abn;
    }

    // If we already have a Xero contact ID, update; otherwise create
    const existingXeroId = customer.xero_contact_id as string | null;
    let xeroContactId: string;
    let xeroContactName: string;

    if (existingXeroId) {
      contactPayload.ContactID = existingXeroId;
    }

    const xeroRes = await xeroPost(profile.companyId, '/Contacts', { Contacts: [contactPayload] }) as XeroContactResponse;
    const contact = xeroRes?.Contacts?.[0];
    if (!contact?.ContactID) {
      return res.status(500).json({ error: 'Xero did not return a contact ID' });
    }
    xeroContactId = contact.ContactID;
    xeroContactName = contact.Name;

    // Save xero_contact_id back to customer
    await db.execute(sql`
      UPDATE customers SET xero_contact_id = ${xeroContactId}, updated_at = NOW()
      WHERE id = ${customerId} AND company_id = ${profile.companyId}
    `);

    res.json({ ok: true, xeroContactId, xeroContactName });
  } catch (err) {
    if (err instanceof XeroNotConnectedError) {
      return res.status(400).json({ error: 'Xero is not connected. Connect in Settings → Accounting.' });
    }
    if (err instanceof XeroApiError) {
      return res.status(502).json({ error: `Xero API error: ${err.message}` });
    }
    console.error('POST /api/integrations/xero/sync-customer error:', err);
    res.status(500).json({ error: 'Failed to sync customer to Xero' });
  }
}
