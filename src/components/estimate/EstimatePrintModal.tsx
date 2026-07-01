import { useState } from 'react';
import { Loader2, Printer } from 'lucide-react';
import { escapeHtml } from '@/lib/html-escape';
import { openPrintWindow } from '@/lib/print-html';
import { estimateTotals, lineCalc, type Estimate, type EstimateLine } from '@/lib/estimates-api';
import type { Job } from '@/lib/jobs-api';

// ── Local line type (shared with editor) ─────────────────────────────────────
export interface LocalLine {
  _key: string;
  id?: number;
  description: string;
  quantity: string;
  unit: string;
  rate: string;
  lineOrder: number;
}

type PrintMode = 'unpriced' | 'scope-total' | 'itemised';

interface CompanyProfile {
  name?: string;
  abn?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
}

interface PdfStyle {
  headerText: string;
  footerText: string;
  estimateDisclaimer: string;
  paymentTerms: string;
  acceptanceNote: string;
  showFooterOnEstimates: boolean;
}

const DEFAULT_PDF_STYLE: PdfStyle = {
  headerText: '',
  footerText: '',
  estimateDisclaimer: '',
  paymentTerms: '',
  acceptanceNote: '',
  showFooterOnEstimates: true,
};

export default function EstimatePrintModal({
  estimate,
  lines,
  job,
  onClose,
}: {
  estimate: Estimate;
  lines: LocalLine[];
  job: Job | null;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<PrintMode>('itemised');
  const [printing, setPrinting] = useState(false);

  async function doPrint() {
    setPrinting(true);

    let company: CompanyProfile = {};
    let pdfStyle: PdfStyle = DEFAULT_PDF_STYLE;
    try {
      const [companyRes, settingsRes] = await Promise.all([
        fetch('/api/company', { credentials: 'include' }),
        fetch('/api/company-settings', { credentials: 'include' }),
      ]);
      if (companyRes.ok) company = await companyRes.json() as CompanyProfile;
      if (settingsRes.ok) {
        const s = await settingsRes.json() as { pdf?: Partial<PdfStyle> };
        if (s.pdf) pdfStyle = { ...DEFAULT_PDF_STYLE, ...s.pdf };
      }
    } catch { /* use defaults */ }

    const totals = estimateTotals(lines, estimate.markupPercent, estimate.gstMode);
    const fmt = (n: number) => `$${n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const date = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });

    const printLines = lines.filter((l) => {
      const hasDesc = l.description.trim().length > 0;
      const hasValue = parseFloat(l.rate) !== 0 || parseFloat(l.quantity) !== 0;
      return hasDesc || hasValue;
    });

    const companyLines: string[] = [];
    if (company.abn) companyLines.push(`ABN: ${escapeHtml(company.abn)}`);
    if (company.phone) companyLines.push(escapeHtml(company.phone));
    if (company.email) companyLines.push(escapeHtml(company.email));
    if (company.website) companyLines.push(escapeHtml(company.website));
    if (company.address) companyLines.push(escapeHtml(company.address));

    const metaRows: Array<[string, string]> = [];
    if (estimate.title) metaRows.push(['Quote Title', escapeHtml(estimate.title)]);
    if (job?.jobNumber) metaRows.push(['Job Number', escapeHtml(job.jobNumber)]);
    if (job?.name) metaRows.push(['Job Name', escapeHtml(job.name)]);
    if (job?.client) metaRows.push(['Client', escapeHtml(job.client)]);
    if (job?.address) metaRows.push(['Site Address', escapeHtml(job.address)]);
    metaRows.push(['Date', date]);
    if (estimate.status && estimate.status !== 'Draft') metaRows.push(['Status', escapeHtml(estimate.status)]);

    const metaHtml = `<table class="meta-table">${metaRows.map(([k, v]) => `<tr><td class="meta-key">${k}</td><td class="meta-val">${v}</td></tr>`).join('')}</table>`;

    let tableHtml = '';
    if (mode === 'itemised') {
      const rows = printLines.map((l) => {
        const amt = lineCalc(l);
        return `<tr class="line-row"><td class="td-desc">${escapeHtml(l.description) || '—'}</td><td class="td-num">${escapeHtml(l.quantity)}</td><td class="td-unit">${escapeHtml(l.unit)}</td><td class="td-num">$${parseFloat(l.rate).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td class="td-num td-amount">${fmt(amt)}</td></tr>`;
      }).join('');
      tableHtml = `<table class="lines-table"><thead><tr class="thead-row"><th class="th-desc">Description</th><th class="th-num">Qty</th><th class="th-unit">Unit</th><th class="th-num">Rate</th><th class="th-num">Amount</th></tr></thead><tbody>${rows}</tbody></table>`;
    } else {
      const rows = printLines.map((l) => `<tr class="line-row"><td class="td-desc">${escapeHtml(l.description) || '—'}</td><td class="td-num">${escapeHtml(l.quantity)}</td><td class="td-unit">${escapeHtml(l.unit)}</td></tr>`).join('');
      tableHtml = `<table class="lines-table"><thead><tr class="thead-row"><th class="th-desc">Description</th><th class="th-num">Qty</th><th class="th-unit">Unit</th></tr></thead><tbody>${rows}</tbody></table>`;
    }

    let totalsHtml = '';
    if (mode === 'itemised' || mode === 'scope-total') {
      const totalRows: string[] = [];
      if (mode === 'itemised') {
        totalRows.push(`<tr><td class="tot-label">Subtotal</td><td class="tot-val">${fmt(totals.subtotal)}</td></tr>`);
        if (parseFloat(estimate.markupPercent) > 0) totalRows.push(`<tr><td class="tot-label">Markup (${estimate.markupPercent}%)</td><td class="tot-val">${fmt(totals.markupAmount)}</td></tr>`);
        if (totals.gst > 0) totalRows.push(`<tr><td class="tot-label">GST (10%)</td><td class="tot-val">${fmt(totals.gst)}</td></tr>`);
      }
      totalRows.push(`<tr class="tot-total-row"><td class="tot-label">Total</td><td class="tot-val">${fmt(totals.total)}</td></tr>`);
      totalsHtml = `<div class="totals-wrap"><table class="totals-table">${totalRows.join('')}</table></div>`;
    }

    const showFooter = pdfStyle.showFooterOnEstimates;
    const headerSubHtml = pdfStyle.headerText ? `<div class="company-header-sub">${escapeHtml(pdfStyle.headerText)}</div>` : '';
    const disclaimerHtml = pdfStyle.estimateDisclaimer ? `<div class="disclaimer"><strong>Disclaimer:</strong> ${escapeHtml(pdfStyle.estimateDisclaimer)}</div>` : '';
    const paymentHtml = pdfStyle.paymentTerms ? `<div class="disclaimer"><strong>Payment Terms:</strong> ${escapeHtml(pdfStyle.paymentTerms)}</div>` : '';
    const acceptanceHtml = pdfStyle.acceptanceNote ? `<div class="acceptance"><p class="acceptance-label">Acceptance</p><p class="acceptance-text">${escapeHtml(pdfStyle.acceptanceNote)}</p><div class="acceptance-line"></div><p class="acceptance-sig">Signature &amp; Date</p></div>` : '';
    const footerHtml = showFooter ? `<div class="doc-footer"><span>${escapeHtml(pdfStyle.footerText || (company.name ?? 'IWILLBUILD') + ' — ' + estimate.title)}</span><span>Printed ${date}</span></div>` : '';

    const docTitle = `${job?.jobNumber ? job.jobNumber + ' — ' : ''}${estimate.title}`;

    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>${escapeHtml(docTitle)}</title><style>
*{box-sizing:border-box;margin:0;padding:0}@page{size:A4;margin:14mm 14mm 16mm 14mm}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:13px;color:#1e293b;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}@media screen{body{padding:20mm 20mm;max-width:210mm;margin:0 auto}}
.doc-header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #f97316;padding-bottom:14px;margin-bottom:18px}.company-name{font-size:20px;font-weight:800;color:#f97316;letter-spacing:-0.3px;line-height:1.2}.company-header-sub{font-size:12px;font-weight:600;color:#475569;margin-top:3px}.company-detail{font-size:11px;color:#64748b;margin-top:2px;line-height:1.5}.doc-label{text-align:right}.doc-label-title{font-size:22px;font-weight:800;color:#0f172a;letter-spacing:-0.5px}.doc-label-sub{font-size:11px;color:#94a3b8;margin-top:3px}
.meta-table{width:100%;border-collapse:collapse;margin-bottom:20px;font-size:12px}.meta-key{width:130px;font-weight:600;color:#64748b;padding:3px 12px 3px 0;vertical-align:top;white-space:nowrap}.meta-val{color:#1e293b;font-weight:500;padding:3px 0}
.lines-table{width:100%;border-collapse:collapse;font-size:12.5px;margin-bottom:0}.thead-row{background:#f8fafc}.thead-row th{padding:9px 10px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.4px;border-top:1px solid #e2e8f0;border-bottom:2px solid #e2e8f0}.th-desc{text-align:left}.th-num{text-align:right;width:70px}.th-unit{text-align:left;width:60px}.line-row td{padding:8px 10px;border-bottom:1px solid #f1f5f9;vertical-align:top}.line-row:last-child td{border-bottom:2px solid #e2e8f0}.td-desc{text-align:left;line-height:1.5}.td-num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.td-unit{text-align:left;color:#64748b}.td-amount{font-weight:600}.line-row{page-break-inside:avoid}
.totals-wrap{display:flex;justify-content:flex-end;margin-top:12px;margin-bottom:16px}.totals-table{border-collapse:collapse;font-size:13px;min-width:240px}.totals-table td{padding:5px 10px}.tot-label{color:#475569;text-align:left}.tot-val{text-align:right;font-variant-numeric:tabular-nums;font-weight:500}.tot-total-row td{font-size:16px;font-weight:800;color:#0f172a;border-top:2px solid #e2e8f0;padding-top:8px}
.disclaimer{font-size:11px;color:#64748b;border-top:1px solid #f1f5f9;padding:10px 0;line-height:1.6;page-break-inside:avoid}.disclaimer strong{color:#475569}
.acceptance{margin-top:24px;padding:16px;border:1px solid #e2e8f0;border-radius:8px;page-break-inside:avoid}.acceptance-label{font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:6px}.acceptance-text{font-size:12px;color:#475569;margin-bottom:24px;line-height:1.5}.acceptance-line{border-top:1px solid #334155;margin-bottom:4px}.acceptance-sig{font-size:10px;color:#94a3b8}
.doc-footer{margin-top:24px;padding-top:10px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8;display:flex;justify-content:space-between}
@media print{html,body{margin:0;padding:0}}
</style></head><body>
<div class="doc-header"><div class="company-block"><div class="company-name">${escapeHtml(company.name ?? 'IWILLBUILD')}</div>${headerSubHtml}${companyLines.map((l) => `<div class="company-detail">${l}</div>`).join('')}</div><div class="doc-label"><div class="doc-label-title">QUOTE</div><div class="doc-label-sub">${date}</div></div></div>
${metaHtml}${tableHtml}${totalsHtml}${disclaimerHtml}${paymentHtml}${acceptanceHtml}${footerHtml}
</body></html>`;

    openPrintWindow(html, true);
    setPrinting(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm flex flex-col gap-4">
        <h3 className="font-heading font-bold text-base flex items-center gap-2">
          <Printer size={16} className="text-primary" />
          Print / Export Quote
        </h3>
        <p className="text-xs text-slate-400 -mt-2">Tip: in the print dialog, turn off <strong>Headers and footers</strong> for the cleanest output.</p>
        <div className="flex flex-col gap-2">
          {([
            { value: 'itemised', label: 'Full Itemised Quote', desc: 'Qty, unit, rate and line totals — full breakdown' },
            { value: 'scope-total', label: 'Scope with Total', desc: 'Line descriptions + qty/unit, total at bottom' },
            { value: 'unpriced', label: 'Unpriced Scope', desc: 'Descriptions and quantities only — no prices' },
          ] as const).map((opt) => (
            <label key={opt.value} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${mode === opt.value ? 'border-primary bg-orange-50' : 'border-border hover:bg-muted/50'}`}>
              <input type="radio" name="printMode" value={opt.value} checked={mode === opt.value} onChange={() => setMode(opt.value)} className="mt-0.5 accent-primary" />
              <div>
                <p className="text-sm font-semibold">{opt.label}</p>
                <p className="text-xs text-muted-foreground">{opt.desc}</p>
              </div>
            </label>
          ))}
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground px-4 py-2 rounded-lg hover:bg-muted transition-colors">Cancel</button>
          <button onClick={() => void doPrint()} disabled={printing} className="flex items-center gap-1.5 text-sm font-bold bg-primary hover:bg-orange-600 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-60">
            {printing ? <Loader2 size={13} className="animate-spin" /> : <Printer size={13} />}
            {printing ? 'Preparing…' : 'Print / PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}
