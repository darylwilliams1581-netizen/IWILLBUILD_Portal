/**
 * POST /api/customers
 * Creates a new customer for the authenticated user's company.
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';
import { profiles } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import type { ResultSetHeader } from 'mysql2';

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

    const {
      name, contactPerson, email, phone, mobile,
      address, billingAddress, abn, notes,
    } = req.body as Record<string, string>;

    if (!name?.trim()) return res.status(400).json({ error: 'Customer name is required' });

    const [result] = await db.execute(sql`
      INSERT INTO customers
        (company_id, name, contact_person, email, phone, mobile, address, billing_address, abn, notes, status)
      VALUES
        (${profile.companyId}, ${name.trim()}, ${contactPerson?.trim() || null},
         ${email?.trim() || null}, ${phone?.trim() || null}, ${mobile?.trim() || null},
         ${address?.trim() || null}, ${billingAddress?.trim() || null},
         ${abn?.trim() || null}, ${notes?.trim() || null}, 'active')
    `) as unknown as [ResultSetHeader, unknown];

    const [rows] = await db.execute(
      sql`SELECT * FROM customers WHERE id = ${result.insertId}`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    res.status(201).json({ customer: rows?.[0] ?? null });
  } catch (err) {
    console.error('POST /api/customers error:', err);
    res.status(500).json({ error: 'Failed to create customer' });
  }
}
