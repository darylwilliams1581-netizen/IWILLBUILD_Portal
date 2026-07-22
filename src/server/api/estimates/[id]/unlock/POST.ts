/**
 * POST /api/estimates/:id/unlock
 *
 * Unlocks an estimate that was previously converted to an invoice,
 * but only when the linked invoice no longer exists (was deleted).
 * This allows the user to re-push the quote to a new invoice.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { profiles } from '../../../../db/schema.js';
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

    const isAdmin = profile.role === 'owner' || profile.role === 'admin' || profile.permAdmin === true;
    const canInvoices = isAdmin || profile.permInvoices !== false;
    if (!canInvoices) return res.status(403).json({ error: 'No invoice permission' });

    const estimateId = parseInt(req.params.id, 10);
    if (!estimateId) return res.status(400).json({ error: 'Invalid estimate ID' });

    // Load the estimate
    const [estRows] = await db.execute(
      sql`SELECT locked, locked_invoice_id FROM estimates
          WHERE id = ${estimateId} AND company_id = ${profile.companyId} LIMIT 1`
    ) as unknown as [Array<{ locked: number; locked_invoice_id: number | null }>, unknown];

    const est = estRows?.[0];
    if (!est) return res.status(404).json({ error: 'Estimate not found' });
    if (!est.locked) return res.status(400).json({ error: 'Estimate is not locked' });

    // Only allow unlock if the linked invoice is gone
    if (est.locked_invoice_id) {
      const [invRows] = await db.execute(
        sql`SELECT id FROM invoices WHERE id = ${est.locked_invoice_id} AND company_id = ${profile.companyId} LIMIT 1`
      ) as unknown as [Array<{ id: number }>, unknown];
      if (invRows?.length) {
        return res.status(409).json({
          error: 'Linked invoice still exists — navigate to it instead',
          invoice_id: est.locked_invoice_id,
        });
      }
    }

    // Safe to unlock
    await db.execute(sql`
      UPDATE estimates
      SET locked = 0, locked_at = NULL, locked_invoice_id = NULL
      WHERE id = ${estimateId} AND company_id = ${profile.companyId}
    `);

    return res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/estimates/:id/unlock error:', err);
    return res.status(500).json({ error: 'Failed to unlock estimate' });
  }
}
