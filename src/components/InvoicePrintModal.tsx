/**
 * InvoicePrintModal — opens a clean print-ready window for the invoice.
 * Uses company settings (logo, name, ABN, address, phone, email) from /api/company/settings.
 */
import { useState, useEffect } from 'react';
import { X, Printer, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { fmtMoney, STATUS_LABELS, type Invoice } from '@/lib/invoices-api';
import { escapeHtml, safeUrl } from '@/lib/html-escape';
import { openPrintWindow } from '@/lib/print-html';

interface CompanySettings {
  name?: string;
  abn?: string;
  address?: string;
  phone?: string;
  email?: string;
  logo_url?: string;
  invoice_terms?: string;
  invoice_footer?: string;
}

interface Props {
  invoice: Invoice;
  onClose: () => void;
}

export default function InvoicePrintModal({ invoice, onClose }: Props) {
  const [settings, setSettings] = useState<CompanySettings>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/company/settings', { credentials: 'include' })
      .then((r) => r.ok ? r.json() : {})
      .then((d) => setSettings(d ?? {}))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function handlePrint() {
    const subtotal = parseFloat(invoice.subtotal ?? '0');
    const gst = parseFloat(invoice.gst_amount ?? '0');
    const total = parseFloat(invoice.total ?? '0');
    const paid = parseFloat(invoice.amount_paid ?? '0');
    const balance = parseFloat(invoice.balance_due ?? String(total));

    const lines = (invoice.lines ?? []).map((l) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#1e293b;">${escapeHtml(l.description).replace(/\n/g, '<br/>')}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;text-align:center;color:#475569;">${escapeHtml(l.quantity)}${l.unit ? ' ' + escapeHtml(l.unit) : ''}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;text-align:right;color:#475569;">${fmtMoney(l.rate)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;text-align:right;font-weight:600;color:#1e293b;">${fmtMoney(l.amount)}</td>
      </tr>
    `).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Invoice ${escapeHtml(invoice.invoice_number)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1e293b; background: #fff; padding: 40px; max-width: 800px; margin: 0 auto; }
    @media print { body { padding: 20px; } .no-print { display: none; } }
    h1 { font-size: 28px; font-weight: 900; color: #0f172a; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
    .company-info { font-size: 13px; color: #475569; line-height: 1.6; }
    .company-name { font-size: 18px; font-weight: 800; color: #0f172a; margin-bottom: 4px; }
    .invoice-meta { text-align: right; }
    .invoice-number { font-size: 22px; font-weight: 900; color: #7c3aed; }
    .status-badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; background: #f1f5f9; color: #64748b; margin-top: 4px; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 32px; }
    .meta-block { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; }
    .meta-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #94a3b8; margin-bottom: 6px; }
    .meta-value { font-size: 13px; color: #1e293b; line-height: 1.5; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    thead tr { background: #0f172a; }
    thead th { padding: 10px 12px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #f8fafc; text-align: left; }
    thead th:last-child, thead th:nth-child(2), thead th:nth-child(3) { text-align: right; }
    thead th:nth-child(2) { text-align: center; }
    .totals { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; margin-bottom: 32px; }
    .total-row { display: flex; gap: 40px; font-size: 13px; }
    .total-row.grand { font-size: 16px; font-weight: 900; border-top: 2px solid #e2e8f0; padding-top: 8px; margin-top: 4px; }
    .total-row.balance { font-size: 15px; font-weight: 800; color: #dc2626; }
    .total-row.paid-row { color: #16a34a; }
    .total-label { color: #64748b; min-width: 120px; text-align: right; }
    .total-value { min-width: 100px; text-align: right; font-weight: 600; }
    .terms { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; font-size: 12px; color: #64748b; line-height: 1.6; margin-bottom: 24px; }
    .footer { font-size: 11px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 16px; }
    .print-btn { display: block; margin: 0 auto 24px; padding: 10px 28px; background: #7c3aed; color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 700; cursor: pointer; }
  </style>
</head>
<body>
  <button class="print-btn no-print" onclick="window.print()">🖨️ Print / Save as PDF</button>

  <div class="header">
    <div>
      ${settings.logo_url ? `<img src="${safeUrl(settings.logo_url)}" alt="Logo" style="height:48px;width:auto;object-fit:contain;margin-bottom:12px;display:block;"/>` : ''}
      <div class="company-name">${escapeHtml(settings.name ?? 'Your Company')}</div>
      <div class="company-info">
        ${settings.abn ? `ABN ${escapeHtml(settings.abn)}<br/>` : ''}
        ${settings.address ? `${escapeHtml(settings.address)}<br/>` : ''}
        ${settings.phone ? `${escapeHtml(settings.phone)}<br/>` : ''}
        ${settings.email ? `${escapeHtml(settings.email)}` : ''}
      </div>
    </div>
    <div class="invoice-meta">
      <div class="invoice-number">INVOICE</div>
      <div style="font-size:18px;font-weight:700;color:#0f172a;margin-top:4px;">${escapeHtml(invoice.invoice_number)}</div>
      <div class="status-badge">${escapeHtml(STATUS_LABELS[invoice.status as keyof typeof STATUS_LABELS] ?? invoice.status)}</div>
    </div>
  </div>

  <div class="meta-grid">
    <div class="meta-block">
      <div class="meta-label">Bill To</div>
      <div class="meta-value">
        ${invoice.customer_name ? `<strong>${escapeHtml(invoice.customer_name)}</strong><br/>` : ''}
        ${(invoice as Record<string, unknown>).customer_contact ? `${escapeHtml((invoice as Record<string, unknown>).customer_contact)}<br/>` : ''}
        ${(invoice as Record<string, unknown>).customer_email ? `${escapeHtml((invoice as Record<string, unknown>).customer_email)}<br/>` : ''}
        ${(invoice as Record<string, unknown>).customer_phone ? `${escapeHtml((invoice as Record<string, unknown>).customer_phone)}<br/>` : ''}
        ${(invoice as Record<string, unknown>).customer_address ? `${escapeHtml((invoice as Record<string, unknown>).customer_address)}` : ''}
        ${!invoice.customer_name && !invoice.customer_id ? '<em style="color:#94a3b8">No customer linked</em>' : ''}
      </div>
    </div>
    <div class="meta-block">
      <div class="meta-label">Invoice Details</div>
      <div class="meta-value">
        <strong>${escapeHtml(invoice.title)}</strong><br/>
        ${invoice.job_name ? `Job: ${invoice.job_number ? escapeHtml(invoice.job_number) + ' — ' : ''}${escapeHtml(invoice.job_name)}<br/>` : ''}
        ${invoice.issue_date ? `Issue Date: ${escapeHtml(new Date(invoice.issue_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }))}<br/>` : ''}
        ${invoice.due_date ? `Due Date: ${escapeHtml(new Date(invoice.due_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }))}` : ''}
      </div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:50%">Description</th>
        <th style="width:15%;text-align:center">Qty / Unit</th>
        <th style="width:15%;text-align:right">Rate</th>
        <th style="width:20%;text-align:right">Amount</th>
      </tr>
    </thead>
    <tbody>${lines}</tbody>
  </table>

  <div class="totals">
    <div class="total-row"><span class="total-label">Subtotal</span><span class="total-value">${fmtMoney(subtotal)}</span></div>
    <div class="total-row"><span class="total-label">GST (10%)</span><span class="total-value">${fmtMoney(gst)}</span></div>
    <div class="total-row grand"><span class="total-label">Total</span><span class="total-value">${fmtMoney(total)}</span></div>
    ${paid > 0 ? `<div class="total-row paid-row"><span class="total-label">Paid</span><span class="total-value">−${fmtMoney(paid)}</span></div>
    <div class="total-row balance"><span class="total-label">Balance Due</span><span class="total-value">${fmtMoney(balance)}</span></div>` : ''}
  </div>

  ${invoice.terms ? `<div class="terms"><strong>Payment Terms:</strong> ${escapeHtml(invoice.terms)}</div>` : ''}
  ${settings.invoice_footer ? `<div class="footer">${escapeHtml(settings.invoice_footer)}</div>` : ''}
</body>
</html>`;

    openPrintWindow(html, true);
    return;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.15 }}
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-violet-50 rounded-md"><Printer size={15} className="text-primary" /></div>
            <h2 className="font-heading font-bold text-sm">Print / Save PDF</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-colors"><X size={15} /></button>
        </div>
        <div className="p-5">
          {loading ? (
            <div className="flex items-center justify-center py-6"><Loader2 size={20} className="animate-spin text-primary" /></div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-4">
                Opens a clean print-ready page for <strong>{invoice.invoice_number}</strong>. Use your browser's Print dialog to save as PDF.
              </p>
              <div className="flex gap-3">
                <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">Cancel</button>
                <button
                  onClick={() => { handlePrint(); onClose(); }}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary hover:bg-violet-700 text-white rounded-lg text-sm font-bold transition-colors"
                >
                  <Printer size={14} />Open Print View
                </button>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
