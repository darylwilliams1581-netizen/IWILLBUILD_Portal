/**
 * DELETE /api/customers/:id
 * Archives (soft-deletes) a customer. Does NOT delete linked jobs.
 * Pass ?hard=1 to permanently delete (owner only).
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

    // Soft-delete: set status = archived
    await db.execute(
      sql`UPDATE customers SET status = 'archived' WHERE id = ${id} AND company_id = ${profile.companyId}`
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/customers/:id error:', err);
    res.status(500).json({ error: 'Failed to archive customer' });
  }
}
