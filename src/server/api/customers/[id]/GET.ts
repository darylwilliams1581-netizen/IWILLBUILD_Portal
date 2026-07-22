/**
 * GET /api/customers/:id
 * Returns a single customer with their linked jobs.
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
    const [rows] = await db.execute(
      sql`SELECT * FROM customers WHERE id = ${id} AND company_id = ${profile.companyId} LIMIT 1`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    if (!rows?.length) return res.status(404).json({ error: 'Customer not found' });

    // Linked jobs
    const [jobRows] = await db.execute(
      sql`SELECT id, job_number, name, status, address, created_at
          FROM jobs
          WHERE customer_id = ${id} AND company_id = ${profile.companyId}
          ORDER BY created_at DESC`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    res.json({ customer: rows[0], jobs: jobRows ?? [] });
  } catch (err) {
    console.error('GET /api/customers/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch customer' });
  }
}
