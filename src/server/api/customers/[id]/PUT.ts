/**
 * PUT /api/customers/:id
 * Updates a customer. Also handles archive/unarchive via status field.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { profiles } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';

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

    const id = Number(req.params.id);
    const [existing] = await db.execute(
      sql`SELECT id FROM customers WHERE id = ${id} AND company_id = ${profile.companyId} LIMIT 1`
    ) as unknown as [Array<{ id: number }>, unknown];
    if (!existing?.length) return res.status(404).json({ error: 'Customer not found' });

    const {
      name, contactPerson, email, phone, mobile,
      address, billingAddress, abn, notes, status,
    } = req.body as Record<string, string>;

    if (!name?.trim()) return res.status(400).json({ error: 'Customer name is required' });

    await db.execute(sql`
      UPDATE customers SET
        name             = ${name.trim()},
        contact_person   = ${contactPerson?.trim() || null},
        email            = ${email?.trim() || null},
        phone            = ${phone?.trim() || null},
        mobile           = ${mobile?.trim() || null},
        address          = ${address?.trim() || null},
        billing_address  = ${billingAddress?.trim() || null},
        abn              = ${abn?.trim() || null},
        notes            = ${notes?.trim() || null},
        status           = ${status ?? 'active'}
      WHERE id = ${id} AND company_id = ${profile.companyId}
    `);

    const [rows] = await db.execute(
      sql`SELECT * FROM customers WHERE id = ${id} AND company_id = ${profile.companyId}`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    res.json({ customer: rows?.[0] ?? null });
  } catch (err) {
    console.error('PUT /api/customers/:id error:', err);
    res.status(500).json({ error: 'Failed to update customer' });
  }
}
