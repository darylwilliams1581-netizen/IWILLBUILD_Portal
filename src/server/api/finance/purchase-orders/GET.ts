/**
 * GET /api/finance/purchase-orders
 * Company-wide PO list with filters, status counts, and cursor pagination.
 *
 * Query params:
 *   status       — all | draft | sent | completed | cancelled
 *   search       — free text (PO number, title, job, contractor)
 *   jobId        — filter by job
 *   contractorId — filter by contractor/supplier
 *   dateFrom     — ISO date
 *   dateTo       — ISO date
 *   cursor       — last seen PO id (for next page)
 *   limit        — page size (max 100, default 25)
 */
import type { Request, Response } from 'express';
import { resolvePOProfile, requireFinance } from '@/server/lib/po-auth.js';
import { listPOs } from '@/server/lib/po-service.js';

export default async function handler(req: Request, res: Response) {
  const profile = await resolvePOProfile(req, res);
  if (!profile) return;
  if (!requireFinance(profile, res)) return;

  const q = req.query as Record<string, string | undefined>;

  const status     = q.status ?? 'all';
  const search     = q.search?.trim() || undefined;
  const jobId      = q.jobId      ? parseInt(q.jobId, 10)      : undefined;
  const contractorId = q.contractorId ? parseInt(q.contractorId, 10) : undefined;
  const dateFrom   = q.dateFrom   || undefined;
  const dateTo     = q.dateTo     || undefined;
  const cursor     = q.cursor     ? parseInt(q.cursor, 10)     : undefined;
  const limit      = q.limit      ? parseInt(q.limit, 10)      : 25;

  try {
    const result = await listPOs({
      companyId: profile.companyId,
      canSeeDollars: profile.canSeeDollars,
      status,
      search,
      jobId: jobId && !isNaN(jobId) ? jobId : undefined,
      contractorId: contractorId && !isNaN(contractorId) ? contractorId : undefined,
      dateFrom,
      dateTo,
      cursor: cursor && !isNaN(cursor) ? cursor : undefined,
      limit: isNaN(limit) ? 25 : limit,
    });

    // Strip dollar fields if user cannot see them
    if (!profile.canSeeDollars) {
      result.purchaseOrders = result.purchaseOrders.map((po) => ({
        ...po,
        subtotal: undefined as unknown as number,
        gst:      undefined as unknown as number,
        total:    undefined as unknown as number,
      }));
    }

    return res.json({ ...result, canSeeDollars: profile.canSeeDollars });
  } catch (err) {
    console.error('GET /api/finance/purchase-orders error:', err);
    return res.status(500).json({ error: 'Failed to fetch purchase orders' });
  }
}
