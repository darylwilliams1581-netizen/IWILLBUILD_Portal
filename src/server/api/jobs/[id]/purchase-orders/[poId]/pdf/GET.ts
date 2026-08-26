/**
 * GET /api/jobs/:id/purchase-orders/:poId/pdf
 * Generates and streams a real PDF for a Purchase Order / Work Order.
 *
 * Phase 2: returns genuine PDF bytes (application/pdf, starts with %PDF).
 * Delegates to the shared purchase-order-pdf-document builder.
 *
 * Security:
 *  - Finance permission required (permInvoices)
 *  - Dollar visibility required (permSeeDollars)
 *  - PO must match job_id + company_id
 */

import type { Request, Response } from 'express';
import {
  resolvePOProfile,
  requireFinanceAndDollars,
} from '../../../../../../lib/po-auth.js';
import { buildPOPdf } from '../../../../../../lib/purchase-order-pdf-document.js';

export default async function handler(req: Request, res: Response) {
  const profile = await resolvePOProfile(req, res);
  if (!profile) return;
  if (!requireFinanceAndDollars(profile, res)) return;

  const jobId = parseInt(String(req.params.id), 10);
  if (isNaN(jobId)) return res.status(400).json({ error: 'Invalid job ID' });

  const poId = parseInt(String(req.params.poId), 10);
  if (isNaN(poId)) return res.status(400).json({ error: 'Invalid PO ID' });

  try {
    // buildPOPdf scopes by company_id AND job_id = jobId (tenant + job isolation)
    const result = await buildPOPdf(profile.companyId, poId, jobId);
    if (!result) return res.status(404).json({ error: 'Purchase order not found' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${result.filename}"`);
    res.setHeader('Content-Length', result.pdfBytes.length);
    return res.send(Buffer.from(result.pdfBytes));
  } catch (err) {
    console.error('GET /api/jobs/:id/purchase-orders/:poId/pdf error:', err);
    return res.status(500).json({ error: 'Failed to generate PDF' });
  }
}
