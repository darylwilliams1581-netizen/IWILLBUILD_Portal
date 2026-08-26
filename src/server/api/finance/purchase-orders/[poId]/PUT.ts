/**
 * PUT /api/finance/purchase-orders/:poId
 * Update a PO from the Finance workspace (company-scoped, no job_id requirement).
 */
import type { Request, Response } from 'express';
import { resolvePOProfile, requireFinance } from '@/server/lib/po-auth.js';
import { updatePO } from '@/server/lib/po-service.js';

export default async function handler(req: Request, res: Response) {
  const profile = await resolvePOProfile(req, res);
  if (!profile) return;
  if (!requireFinance(profile, res)) return;

  const poId = parseInt(String(req.params.poId), 10);
  if (isNaN(poId)) return res.status(400).json({ error: 'Invalid PO ID' });

  const body = req.body as Record<string, unknown>;

  const contractorId = body.contractorId !== undefined
    ? (body.contractorId != null ? parseInt(String(body.contractorId), 10) : null)
    : undefined;

  const result = await updatePO({
    companyId: profile.companyId,
    userId: profile.userId,
    poId,
    status:        body.status        !== undefined ? String(body.status)                          : undefined,
    title:         body.title         !== undefined ? (String(body.title).trim()         || null)  : undefined,
    instructions:  body.instructions  !== undefined ? (String(body.instructions).trim()  || null)  : undefined,
    startDate:     body.startDate     !== undefined ? (String(body.startDate).trim()     || null)  : undefined,
    finishDate:    body.finishDate    !== undefined ? (String(body.finishDate).trim()    || null)  : undefined,
    cancelledNote: body.cancelledNote !== undefined ? (String(body.cancelledNote).trim() || null)  : undefined,
    assignedToName:body.assignedToName!== undefined ? (String(body.assignedToName).trim()|| null)  : undefined,
    tradeType:     body.tradeType     !== undefined ? (String(body.tradeType).trim()     || null)  : undefined,
    contractorId:  contractorId !== undefined ? (isNaN(contractorId as number) ? null : contractorId) : undefined,
    lines:         Array.isArray(body.lines) ? body.lines : undefined,
  });

  if (!result.ok) {
    return res.status(result.error.code).json({ error: result.error.message, details: result.error.details });
  }

  return res.json({ purchaseOrder: result.data });
}
