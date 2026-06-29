/**
 * GET /api/customers?status=active|archived|all
 * Returns all customers for the authenticated user's company.
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';
import { profiles } from '../../db/schema.js';
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
    if (!profile?.companyId) return res.json({ customers: [] });

    const statusFilter = (req.query.status as string) || 'active';

    let query = sql`
      SELECT c.*,
             (SELECT COUNT(*) FROM jobs j WHERE j.customer_id = c.id AND j.company_id = c.company_id) as job_count
      FROM customers c
      WHERE c.company_id = ${profile.companyId}
    `;

    if (statusFilter !== 'all') {
      query = sql`${query} AND c.status = ${statusFilter}`;
    }

    query = sql`${query} ORDER BY c.name ASC`;

    const [rows] = await db.execute(query) as unknown as [Array<Record<string, unknown>>, unknown];
    res.json({ customers: rows ?? [] });
  } catch (err) {
    console.error('GET /api/customers error:', err);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
}
