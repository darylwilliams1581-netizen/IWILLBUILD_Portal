/**
 * GET /api/finance/purchase-orders/:poId
 * Company-scoped PO detail (no job_id requirement).
 */
import type { Request, Response } from 'express';
import { resolvePOProfile, requireFinanceAndDollars } from '@/server/lib/po-auth.js';
import { fetchPODetail } from '@/server/lib/po-service.js';

export default async function handler(req: Request, res: Response) {
  const profile = await resolvePOProfile(req, res);
  if (!profile) return;
  if (!requireFinanceAndDollars(profile, res)) return;

  const poId = parseInt(String(req.params.poId), 10);
  if (isNaN(poId)) return res.status(400).json({ error: 'Invalid PO ID' });

  try {
    const po = await fetchPODetail(profile.companyId, poId);
    if (!po) return res.status(404).json({ error: 'Purchase order not found' });
    return res.json({ purchaseOrder: po });
  } catch (err) {
    console.error('GET /api/finance/purchase-orders/:poId error:', err);
    return res.status(500).json({ error: 'Failed to fetch purchase order' });
  }
}
