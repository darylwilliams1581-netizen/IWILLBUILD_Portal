/**
 * GET /api/jobs/:id/purchase-orders/:poId
 * Returns a single purchase order with its lines.
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

    const [poRows] = await db.execute(sql`
      SELECT po.*, c.name as contractor_name, c.email as contractor_email, c.phone as contractor_phone, c.abn as contractor_abn
      FROM job_purchase_orders po
      LEFT JOIN customers c ON c.id = po.contractor_id
      WHERE po.id = ${poId} AND po.company_id = ${profile.companyId}
    `) as unknown as [Array<Record<string, unknown>>, unknown];

    if (!poRows?.length) return res.status(404).json({ error: 'Purchase order not found' });

    const [lineRows] = await db.execute(sql`
      SELECT * FROM job_purchase_order_lines WHERE purchase_order_id = ${poId} ORDER BY sort_order ASC
    `) as unknown as [Array<Record<string, unknown>>, unknown];

    res.json({ purchaseOrder: { ...poRows[0], lines: lineRows ?? [] } });
  } catch (err) {
    console.error('GET /api/jobs/:id/purchase-orders/:poId error:', err);
    res.status(500).json({ error: 'Failed to fetch purchase order' });
  }
}
