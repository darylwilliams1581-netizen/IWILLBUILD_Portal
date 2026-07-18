/**
 * InvoicePreviewModal
 *
 * Shows a live HTML preview of the invoice inside an in-app modal.
 * Provides a single "Download PDF" button that calls the server-side
 * pdf-lib export endpoint — no separate print window needed.
 *
 * Usage:
 *   <InvoicePreviewModal invoice={invoice} onClose={() => setShowPreview(false)} />
 */
import { useState, useEffect, useRef } from 'react';
import { X, Download, Loader2, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { fmtMoney, STATUS_LABELS, type Invoice } from '@/lib/invoices-api';
import { escapeHtml, safeUrl } from '@/lib/html-escape';

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

function buildHtml(invoice: Invoice, settings: CompanySettings): string {
  const subtotal = parseFloat(invoice.subtotal ?? '0');
  const gst      = parseFloat(invoice.gst_amount ?? '0');
  const total    = parseFloat(invoice.total ?? '0');
  const paid     = parseFloat(invoice.amount_paid ?? '0');
  const balance  = parseFloat(invoice.balance_due ?? String(total));

  const inv = invoice as Record<string, unknown>;

  const lines = (invoice.lines ?? []).map((l) => {
    const qtyNum = parseFloat(String(l.quantity ?? '0'));
    const qtyDisplay = isNaN(qtyNum) ? escapeHtml(String(l.quantity)) : qtyNum.toFixed(2);
    const unitDisplay = l.unit ? `<div style="font-size:11px;color:#94a3b8;margin-top:2px;">${escapeHtml(String(l.unit))}</div>` : '';
    return `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#1e293b;">${escapeHtml(l.description).replace(/\n/g, '<br/>')}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;text-align:center;color:#475569;">${qtyDisplay}${unitDisplay}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;text-align:right;color:#475569;">${fmtMoney(l.rate)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;text-align:right;font-weight:600;color:#1e293b;">${fmtMoney(l.amount)}</td>
    </tr>
  `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Invoice ${escapeHtml(invoice.invoice_number)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1e293b; background: #fff; padding: 40px; max-width: 800px; margin: 0 auto; }
    @media print { body { padding: 20px; } }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
    .company-info { font-size: 13px; color: #475569; line-height: 1.6; }
    .company-name { font-size: 18px; font-weight: 800; color: #0f172a; margin-bottom: 4px; }
    .invoice-meta { text-align: right; }
    .invoice-number { font-size: 22px; font-weight: 900; color: #f97316; }
    .status-badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; background: #f1f5f9; color: #64748b; margin-top: 4px; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 32px; }
    .meta-block { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; }
    .meta-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #94a3b8; margin-bottom: 6px; }
    .meta-value { font-size: 13px; color: #1e293b; line-height: 1.5; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    thead tr { background: #0f172a; }
    thead th { padding: 10px 12px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #f8fafc; text-align: left; }
    thead th:last-child, thead th:nth-child(3) { text-align: right; }
    thead th:nth-child(2) { text-align: center; }
    .totals { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; margin-bottom: 32px; }
    .total-row { display: flex; gap: 40px; font-size: 13px; }
    .total-row.grand { font-size: 16px; font-weight: 900; border-top: 2px solid #e2e8f0; padding-top: 8px; margin-top: 4px; }
    .total-row.balance { font-size: 15px; font-weight: 800; color: #dc2626; }
    .total-row.paid-row { color: #16a34a; }
    .total-label { color: #64748b; min-width: 120px; text-align: right; }
    .total-value { min-width: 100px; text-align: right; font-weight: 600; }
    .terms { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; font-size: 12px; color: #64748b; line-height: 1.6; margin-bottom: 24px; }
    .footer-text { font-size: 11px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 16px; }
  </style>
</head>
<body>
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
        ${inv.customer_contact ? `${escapeHtml(inv.customer_contact as string)}<br/>` : ''}
        ${inv.customer_email ? `${escapeHtml(inv.customer_email as string)}<br/>` : ''}
        ${inv.customer_phone ? `${escapeHtml(inv.customer_phone as string)}<br/>` : ''}
        ${inv.customer_address ? `${escapeHtml(inv.customer_address as string)}` : ''}
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
    ${paid > 0 ? `
    <div class="total-row paid-row"><span class="total-label">Paid</span><span class="total-value">−${fmtMoney(paid)}</span></div>
    <div class="total-row balance"><span class="total-label">Balance Due</span><span class="total-value">${fmtMoney(balance)}</span></div>` : ''}
  </div>

  ${invoice.terms ? `<div class="terms"><strong>Payment Terms:</strong> ${escapeHtml(invoice.terms)}</div>` : ''}
  ${settings.invoice_footer ? `<div class="footer-text">${escapeHtml(settings.invoice_footer)}</div>` : ''}
</body>
</html>`;
}

export default function InvoicePreviewModal({ invoice, onClose }: Props) {
  const [settings, setSettings]     = useState<CompanySettings>({});
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    fetch('/api/company/settings', { credentials: 'include' })
      .then((r) => r.ok ? r.json() : {})
      .then((d: CompanySettings) => setSettings(d ?? {}))
      .catch(() => {})
      .finally(() => setLoadingSettings(false));
  }, []);

  // Inject HTML into the iframe once settings are loaded
  useEffect(() => {
    if (loadingSettings) return;
    const iframe = iframeRef.current;
    if (!iframe) return;
    const html = buildHtml(invoice, settings);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    iframe.src = url;
    return () => URL.revokeObjectURL(url);
  }, [loadingSettings, invoice, settings]);

  async function handleDownload() {
    setDownloadError('');
    setDownloading(true);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/export-pdf`, { credentials: 'include' });
      if (!res.ok) {
        let msg = `PDF generation failed (${res.status})`;
        try {
          const ct = res.headers.get('content-type') ?? '';
          if (ct.includes('json')) {
            const j = await res.json() as { error?: string };
            if (j?.error) msg = j.error;
          }
        } catch { /* ignore */ }
        setDownloadError(msg);
        return;
      }
      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.includes('pdf')) {
        setDownloadError('Server returned unexpected content — please try again.');
        return;
      }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `invoice-${invoice.invoice_number ?? invoice.id}.pdf`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setDownloadError('Download failed — please try again.');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex flex-col"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Scrim */}
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

        {/* Modal panel */}
        <motion.div
          className="relative flex flex-col bg-white rounded-2xl shadow-2xl mx-auto my-4 w-full max-w-4xl overflow-hidden"
          style={{ maxHeight: 'calc(100vh - 2rem)' }}
          initial={{ scale: 0.96, opacity: 0, y: 16 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.96, opacity: 0, y: 16 }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        >
          {/* Header bar */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center">
                <FileText size={15} className="text-orange-500" />
              </div>
              <div>
                <h2 className="font-bold text-sm text-gray-900">Invoice Preview</h2>
                <p className="text-xs text-gray-400">{invoice.invoice_number}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {downloadError && (
                <span className="text-xs text-red-600 font-medium">{downloadError}</span>
              )}
              <button
                onClick={handleDownload}
                disabled={downloading || loadingSettings}
                className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white text-sm font-bold rounded-xl transition-colors"
              >
                {downloading
                  ? <Loader2 size={14} className="animate-spin" />
                  : <Download size={14} />}
                {downloading ? 'Generating…' : 'Download PDF'}
              </button>
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Preview iframe */}
          <div className="flex-1 overflow-hidden bg-gray-100 p-4">
            {loadingSettings ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 size={24} className="animate-spin text-orange-400" />
              </div>
            ) : (
              <iframe
                ref={iframeRef}
                title="Invoice preview"
                className="w-full h-full rounded-xl border border-gray-200 bg-white"
                style={{ minHeight: '500px' }}
                sandbox="allow-same-origin"
              />
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
