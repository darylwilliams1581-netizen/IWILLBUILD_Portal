/**
 * POST /api/finance/purchase-orders
 * Create a new Purchase Order from the Finance workspace.
 * Delegates entirely to the shared PO service.
 */
import type { Request, Response } from 'express';
import { resolvePOProfile, requireFinance } from '@/server/lib/po-auth.js';
import { createPO } from '@/server/lib/po-service.js';

export default async function handler(req: Request, res: Response) {
  const profile = await resolvePOProfile(req, res);
  if (!profile) return;
  if (!requireFinance(profile, res)) return;

  const body = req.body as Record<string, unknown>;

  const jobId = body.jobId != null ? parseInt(String(body.jobId), 10) : NaN;
  if (isNaN(jobId)) return res.status(400).json({ error: 'jobId is required' });

  const contractorId = body.contractorId != null
    ? parseInt(String(body.contractorId), 10)
    : null;

  const result = await createPO({
    companyId: profile.companyId,
    userId: profile.userId,
    jobId,
    contractorId: contractorId !== null && !isNaN(contractorId) ? contractorId : null,
    assignedToType: body.assignedToType === 'internal' ? 'internal' : 'contractor',
    assignedToName: body.assignedToName != null ? String(body.assignedToName).trim() || null : null,
    tradeType:      body.tradeType      != null ? String(body.tradeType).trim()      || null : null,
    title:          body.title          != null ? String(body.title).trim()          || null : null,
    instructions:   body.instructions   != null ? String(body.instructions).trim()   || null : null,
    startDate:      body.startDate      != null ? String(body.startDate).trim()      || null : null,
    finishDate:     body.finishDate     != null ? String(body.finishDate).trim()     || null : null,
    lines: Array.isArray(body.lines) ? body.lines : [],
  });

  if (!result.ok) {
    return res.status(result.error.code).json({ error: result.error.message, details: result.error.details });
  }

  return res.status(201).json({ purchaseOrder: result.data });
}
