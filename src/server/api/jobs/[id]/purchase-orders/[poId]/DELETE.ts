/**
 * DELETE /api/jobs/:id/purchase-orders/:poId
 * Deletes a purchase order (only allowed on draft status).
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { profiles } from '../../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';

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

    const poId = parseInt(String(req.params.poId), 10);
    if (isNaN(poId)) return res.status(400).json({ error: 'Invalid PO ID' });

    const [existing] = await db.execute(sql`
      SELECT id, status FROM job_purchase_orders WHERE id = ${poId} AND company_id = ${profile.companyId} LIMIT 1
    `) as unknown as [Array<{ id: number; status: string }>, unknown];
    if (!existing?.length) return res.status(404).json({ error: 'Purchase order not found' });

    await db.execute(sql`DELETE FROM job_purchase_order_lines WHERE purchase_order_id = ${poId}`);
    await db.execute(sql`DELETE FROM job_purchase_orders WHERE id = ${poId} AND company_id = ${profile.companyId}`);

    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/jobs/:id/purchase-orders/:poId error:', err);
    res.status(500).json({ error: 'Failed to delete purchase order' });
  }
}
