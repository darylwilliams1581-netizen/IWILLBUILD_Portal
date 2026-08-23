/**
 * GET /api/finance/purchase-orders/:poId/pdf
 * Finance-scoped PO PDF (company-scoped, no job_id requirement).
 * Delegates to the shared purchase-order-pdf-document builder.
 */
import type { Request, Response } from 'express';
import {
  resolvePOProfile,
  requireFinanceAndDollars,
} from '@/server/lib/po-auth.js';
import { buildPOPdf } from '@/server/lib/purchase-order-pdf-document.js';

export default async function handler(req: Request, res: Response) {
  const profile = await resolvePOProfile(req, res);
  if (!profile) return;
  if (!requireFinanceAndDollars(profile, res)) return;

  const poId = parseInt(String(req.params.poId), 10);
  if (isNaN(poId)) return res.status(400).json({ error: 'Invalid PO ID' });

  try {
    const result = await buildPOPdf(profile.companyId, poId);
    if (!result) return res.status(404).json({ error: 'Purchase order not found' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${result.filename}"`);
    res.setHeader('Content-Length', result.pdfBytes.length);
    return res.send(Buffer.from(result.pdfBytes));
  } catch (err) {
    console.error('GET /api/finance/purchase-orders/:poId/pdf error:', err);
    return res.status(500).json({ error: 'Failed to generate PDF' });
  }
}
