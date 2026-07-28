/**
 * GET /api/jobs/:id/purchase-orders/:poId/pdf
 * Generates and streams a Purchase Order / Work Order PDF.
 * Supports cancelled POs with a prominent CANCELLED banner.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../../db/client.js';
import { profiles } from '../../../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../../lib/auth/auth.js';

function fmtCurrency(n: number | string | null | undefined): string {
  const num = parseFloat(String(n ?? 0)) || 0;
  return num.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2 });
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return String(d); }
}

function esc(s: string | null | undefined): string {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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

    // Load PO with contractor and job info
    const [poRows] = await db.execute(sql`
      SELECT po.*,
             c.name as contractor_name, c.email as contractor_email,
             c.phone as contractor_phone, c.abn as contractor_abn,
             j.job_number, j.name as job_name, j.address as job_address,
             cust.name as customer_name
      FROM job_purchase_orders po
      LEFT JOIN customers c ON c.id = po.contractor_id
      LEFT JOIN jobs j ON j.id = po.job_id
      LEFT JOIN customers cust ON cust.id = j.customer_id
      WHERE po.id = ${poId} AND po.company_id = ${profile.companyId}
    `) as unknown as [Array<Record<string, unknown>>, unknown];

    if (!poRows?.length) return res.status(404).json({ error: 'Purchase order not found' });
    const po = poRows[0];

    // Load lines
    const [lineRows] = await db.execute(sql`
      SELECT * FROM job_purchase_order_lines WHERE purchase_order_id = ${poId} ORDER BY sort_order ASC
    `) as unknown as [Array<Record<string, unknown>>, unknown];

    // Load company info + PDF settings
    const [compRows] = await db.execute(sql`
      SELECT co.name as company_name, co.logo_url,
             cs.pdf_json
      FROM companies co
      LEFT JOIN company_settings cs ON cs.company_id = co.id
      WHERE co.id = ${profile.companyId}
    `) as unknown as [Array<Record<string, unknown>>, unknown];

    const comp = compRows?.[0] ?? {};
    let pdfSettings: Record<string, string> = {};
    try { pdfSettings = JSON.parse(String(comp.pdf_json ?? '{}')); } catch { /* ignore */ }

    const isCancelled = po.status === 'cancelled';
    const isInternal = po.assigned_to_type === 'internal';

    const statusLabel: Record<string, string> = {
      draft: 'DRAFT', sent: 'SENT', completed: 'COMPLETED', paid: 'PAID', cancelled: 'CANCELLED',
    };
    const statusColor: Record<string, string> = {
      draft: '#6b7280', sent: '#2563eb', completed: '#059669', paid: '#7c3aed', cancelled: '#dc2626',
    };
    const statusBg: Record<string, string> = {
      draft: '#f3f4f6', sent: '#eff6ff', completed: '#ecfdf5', paid: '#f5f3ff', cancelled: '#fef2f2',
    };

    const statusStr = String(po.status ?? 'draft');
    const sLabel = statusLabel[statusStr] ?? statusStr.toUpperCase();
    const sColor = statusColor[statusStr] ?? '#6b7280';
    const sBg = statusBg[statusStr] ?? '#f3f4f6';

    const lineItems = (lineRows ?? []).map((l) => {
      const qty = parseFloat(String(l.qty ?? 1));
      const rate = parseFloat(String(l.rate ?? 0));
      const amount = parseFloat(String(l.amount ?? qty * rate));
      return `
        <tr>
          <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#111827;">${esc(String(l.description ?? ''))}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#374151;text-align:center;">${qty}${l.unit ? ` ${esc(String(l.unit))}` : ''}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#374151;text-align:right;">${fmtCurrency(rate)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;font-weight:600;color:#111827;text-align:right;">${fmtCurrency(amount)}</td>
        </tr>`;
    }).join('');

    const cancelledBanner = isCancelled ? `
      <div style="background:#fef2f2;border:2px solid #dc2626;border-radius:8px;padding:16px 20px;margin-bottom:24px;text-align:center;">
        <p style="font-size:22px;font-weight:900;color:#dc2626;letter-spacing:4px;margin:0 0 6px 0;">CANCELLED</p>
        <p style="font-size:12px;color:#991b1b;margin:0;">${esc(String(po.cancelled_note ?? 'Please note this Purchase Order / Work Order has been cancelled.'))}</p>
      </div>` : '';

    const assignmentSection = isInternal
      ? `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:12px 14px;">
           <p style="font-size:10px;font-weight:700;color:#1e40af;text-transform:uppercase;letter-spacing:1px;margin:0 0 4px 0;">Assigned To</p>
           <p style="font-size:13px;font-weight:600;color:#1e3a8a;margin:0;">Internal Team${po.assigned_to_name ? ` — ${esc(String(po.assigned_to_name))}` : ''}</p>
         </div>`
      : `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:12px 14px;">
           <p style="font-size:10px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:1px;margin:0 0 4px 0;">Contractor</p>
           <p style="font-size:13px;font-weight:600;color:#14532d;margin:0;">${esc(String(po.contractor_name ?? po.assigned_to_name ?? '—'))}</p>
           ${po.contractor_email ? `<p style="font-size:11px;color:#166534;margin:2px 0 0 0;">${esc(String(po.contractor_email))}</p>` : ''}
           ${po.contractor_phone ? `<p style="font-size:11px;color:#166534;margin:2px 0 0 0;">${esc(String(po.contractor_phone))}</p>` : ''}
           ${po.contractor_abn ? `<p style="font-size:11px;color:#166534;margin:2px 0 0 0;">ABN: ${esc(String(po.contractor_abn))}</p>` : ''}
         </div>`;

    const footerText = pdfSettings.footerText || pdfSettings.paymentTerms || '';
    const disclaimer = pdfSettings.estimateDisclaimer || '';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${esc(String(po.po_number))} — ${esc(String(po.title ?? 'Purchase Order'))}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color: #111827; background: #fff; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none; }
  }
</style>
</head>
<body style="padding:32px 40px;max-width:800px;margin:0 auto;">

  <!-- Header -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;padding-bottom:20px;border-bottom:2px solid #7c3aed;">
    <div>
      ${comp.logo_url ? `<img src="${esc(String(comp.logo_url))}" alt="Logo" style="max-height:56px;max-width:180px;object-fit:contain;margin-bottom:8px;" />` : ''}
      <p style="font-size:18px;font-weight:800;color:#111827;">${esc(String(comp.company_name ?? ''))}</p>
      ${pdfSettings.businessAbn ? `<p style="font-size:11px;color:#6b7280;">ABN: ${esc(pdfSettings.businessAbn)}</p>` : ''}
      ${pdfSettings.businessPhone ? `<p style="font-size:11px;color:#6b7280;">${esc(pdfSettings.businessPhone)}</p>` : ''}
      ${pdfSettings.businessEmail ? `<p style="font-size:11px;color:#6b7280;">${esc(pdfSettings.businessEmail)}</p>` : ''}
      ${pdfSettings.businessAddress ? `<p style="font-size:11px;color:#6b7280;">${esc(pdfSettings.businessAddress)}</p>` : ''}
    </div>
    <div style="text-align:right;">
      <p style="font-size:22px;font-weight:900;color:#7c3aed;letter-spacing:-0.5px;">PURCHASE ORDER</p>
      <p style="font-size:16px;font-weight:700;color:#111827;margin-top:4px;">${esc(String(po.po_number))}</p>
      <span style="display:inline-block;margin-top:8px;padding:4px 12px;background:${sBg};color:${sColor};border:1px solid ${sColor};border-radius:20px;font-size:11px;font-weight:700;letter-spacing:1px;">${sLabel}</span>
    </div>
  </div>

  ${cancelledBanner}

  <!-- Job Info -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px;">
      <p style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Job Details</p>
      <p style="font-size:13px;font-weight:700;color:#111827;">${esc(String(po.job_number ?? ''))} — ${esc(String(po.job_name ?? ''))}</p>
      ${po.job_address ? `<p style="font-size:11px;color:#6b7280;margin-top:3px;">${esc(String(po.job_address))}</p>` : ''}
      ${po.customer_name ? `<p style="font-size:11px;color:#6b7280;margin-top:3px;">Client: ${esc(String(po.customer_name))}</p>` : ''}
    </div>
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px;">
      <p style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Schedule</p>
      <p style="font-size:12px;color:#374151;">Start: <strong>${fmtDate(String(po.start_date ?? ''))}</strong></p>
      <p style="font-size:12px;color:#374151;margin-top:3px;">Finish: <strong>${fmtDate(String(po.finish_date ?? ''))}</strong></p>
      ${po.trade_type ? `<p style="font-size:12px;color:#374151;margin-top:3px;">Trade: <strong>${esc(String(po.trade_type))}</strong></p>` : ''}
    </div>
  </div>

  <!-- Assignment -->
  <div style="margin-bottom:20px;">
    ${assignmentSection}
  </div>

  <!-- Title -->
  ${po.title ? `<p style="font-size:15px;font-weight:700;color:#111827;margin-bottom:12px;">${esc(String(po.title))}</p>` : ''}

  <!-- Instructions -->
  ${po.instructions ? `
  <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:12px 14px;margin-bottom:20px;">
    <p style="font-size:10px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Instructions / Comments</p>
    <p style="font-size:12px;color:#78350f;white-space:pre-wrap;">${esc(String(po.instructions))}</p>
  </div>` : ''}

  <!-- Scope Lines -->
  <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
    <thead>
      <tr style="background:#7c3aed;">
        <th style="padding:10px;text-align:left;font-size:11px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:0.5px;">Description</th>
        <th style="padding:10px;text-align:center;font-size:11px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:0.5px;white-space:nowrap;">Qty / Unit</th>
        <th style="padding:10px;text-align:right;font-size:11px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:0.5px;">Rate</th>
        <th style="padding:10px;text-align:right;font-size:11px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:0.5px;">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${lineItems || '<tr><td colspan="4" style="padding:16px;text-align:center;color:#9ca3af;font-size:12px;">No line items</td></tr>'}
    </tbody>
  </table>

  <!-- Totals -->
  <div style="display:flex;justify-content:flex-end;margin-bottom:28px;">
    <div style="min-width:240px;">
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e5e7eb;">
        <span style="font-size:12px;color:#6b7280;">Subtotal (ex GST)</span>
        <span style="font-size:12px;font-weight:600;color:#111827;">${fmtCurrency(po.subtotal)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e5e7eb;">
        <span style="font-size:12px;color:#6b7280;">GST (10%)</span>
        <span style="font-size:12px;font-weight:600;color:#111827;">${fmtCurrency(po.gst)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:10px 0;background:#7c3aed;border-radius:6px;margin-top:4px;padding-left:12px;padding-right:12px;">
        <span style="font-size:14px;font-weight:800;color:#fff;">TOTAL</span>
        <span style="font-size:14px;font-weight:800;color:#fff;">${fmtCurrency(po.total)}</span>
      </div>
    </div>
  </div>

  <!-- Footer / Disclaimer -->
  ${disclaimer ? `<div style="border-top:1px solid #e5e7eb;padding-top:14px;margin-bottom:12px;"><p style="font-size:10px;color:#9ca3af;white-space:pre-wrap;">${esc(disclaimer)}</p></div>` : ''}
  ${footerText ? `<div style="border-top:1px solid #e5e7eb;padding-top:10px;"><p style="font-size:10px;color:#9ca3af;text-align:center;">${esc(footerText)}</p></div>` : ''}

  <p style="font-size:9px;color:#d1d5db;text-align:center;margin-top:20px;">Generated ${new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="${po.po_number}.html"`);
    res.send(html);
  } catch (err) {
    console.error('GET /api/jobs/:id/purchase-orders/:poId/pdf error:', err);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
}
