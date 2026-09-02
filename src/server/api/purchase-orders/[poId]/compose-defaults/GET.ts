/**
 * GET /api/purchase-orders/:poId/compose-defaults
 * Returns pre-filled compose fields for the PO email modal.
 * Company-scoped — no job_id required.
 */
import type { Request, Response } from 'express';
import { resolvePOProfile, requireFinanceAndDollars } from '../../../../lib/po-auth.js';
import { fetchPODetail } from '../../../../lib/po-service.js';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  const profile = await resolvePOProfile(req, res);
  if (!profile) return;
  if (!requireFinanceAndDollars(profile, res)) return;

  const poId = parseInt(String(req.params.poId), 10);
  if (isNaN(poId)) return res.status(400).json({ error: 'Invalid PO ID' });

  try {
    const po = await fetchPODetail(profile.companyId, poId);
    if (!po) return res.status(404).json({ error: 'Purchase order not found' });

    if (po.status === 'cancelled') {
      return res.status(409).json({ error: 'Cannot send a cancelled purchase order' });
    }

    const [companyRows] = await db.execute(sql`
      SELECT name FROM companies WHERE id = ${profile.companyId} LIMIT 1
    `) as unknown as [Array<{ name?: string }>, unknown];
    const companyName = String(companyRows?.[0]?.name ?? 'IWIIlBUILD');

    const vendorName  = String(po.contractor_name ?? po.assigned_to_name ?? '');
    const vendorEmail = String(po.contractor_email ?? '');
    const total = Number(po.total ?? 0).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
    const jobLabel = po.job_number ? `#${po.job_number} — ${po.job_name ?? ''}` : (po.job_name ?? '');

    const subject = `Purchase Order ${po.po_number}${vendorName ? ` — ${vendorName}` : ''} | ${companyName}`;
    const message = [
      `Hi${vendorName ? ` ${vendorName}` : ''},`,
      '',
      `Please find Purchase Order ${po.po_number} attached.`,
      '',
      `PO Number: ${po.po_number}`,
      ...(po.title ? [`Title: ${po.title}`] : []),
      ...(jobLabel ? [`Job: ${jobLabel}`] : []),
      ...(total ? [`Total: ${total}`] : []),
      ...(po.start_date ? [`Start Date: ${new Date(po.start_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`] : []),
      ...(po.finish_date ? [`Finish Date: ${new Date(po.finish_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`] : []),
      '',
      `Please don't hesitate to contact us if you have any questions.`,
      '',
      `Kind regards,`,
      companyName,
    ].join('\n');

    return res.json({
      to: vendorEmail,
      subject,
      message,
      attachmentFilename: `${po.po_number}.pdf`,
      job: {
        jobNumber: String(po.job_number ?? ''),
        jobName:   String(po.job_name ?? ''),
        clientName: vendorName,
        docLabel:  `Purchase Order ${po.po_number}`,
        docDetail: total,
      },
    });
  } catch (err) {
    console.error('GET /api/purchase-orders/:poId/compose-defaults error:', err);
    return res.status(500).json({ error: 'Failed to load compose defaults' });
  }
}
