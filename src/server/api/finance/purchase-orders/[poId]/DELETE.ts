/**
 * DELETE /api/finance/purchase-orders/:poId
 * Delete a draft PO from the Finance workspace (company-scoped).
 */
import type { Request, Response } from 'express';
import { resolvePOProfile, requireFinanceAndDelete } from '../../../../lib/po-auth.js';
import { deletePO } from '../../../../lib/po-service.js';

export default async function handler(req: Request, res: Response) {
  const profile = await resolvePOProfile(req, res);
  if (!profile) return;
  if (!requireFinanceAndDelete(profile, res)) return;

  const poId = parseInt(String(req.params.poId), 10);
  if (isNaN(poId)) return res.status(400).json({ error: 'Invalid PO ID' });

  const result = await deletePO({
    companyId: profile.companyId,
    userId: profile.userId,
    poId,
  });

  if (!result.ok) {
    return res.status(result.error.code).json({ error: result.error.message });
  }

  return res.json({ ok: true });
}
