import { useState, useEffect, useCallback, useRef } from 'react';
import { usePermissions } from '@/lib/usePermissions';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  ChevronLeft, Plus, Trash2, ArrowUp, ArrowDown, Copy, Loader2,
  AlertCircle, Lock, FileText, Printer, Check, Menu, ChevronDown,
  BookOpen, Calculator, Upload, Download,
} from 'lucide-react';
import PortalSidebar from '@/components/PortalSidebar';
import {
  fetchEstimate, updateEstimate, createEstimate, getEstimateStatusStyle,
  estimateTotals, lineCalc, ESTIMATE_STATUSES, GST_MODES,
  type Estimate, type EstimateLine,
} from '@/lib/estimates-api';
import { fetchJob, type Job } from '@/lib/jobs-api';
import CsvImportModal from '@/components/CsvImportModal';
import { LIMITS } from '@/lib/limits';

// ── Local line type (includes temp id for UI keying) ─────────────────────────
interface LocalLine {
  _key: string;
  id?: number;
  description: string;
  quantity: string;
  unit: string;
  rate: string;
  lineOrder: number;
}

let _keyCounter = 0;
function newKey() { return `line-${++_keyCounter}`; }

function blankLine(order: number): LocalLine {
  return { _key: newKey(), description: '', quantity: '1', unit: '', rate: '0', lineOrder: order };
}

function fromApiLine(l: EstimateLine): LocalLine {
  return { _key: newKey(), id: l.id, description: l.description, quantity: l.quantity, unit: l.unit ?? '', rate: l.rate, lineOrder: l.lineOrder };
}

// ── Print modal ───────────────────────────────────────────────────────────────
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

function PrintModal({
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

    // Fetch company profile and PDF style settings in parallel
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

    // Filter out blank / zero-value placeholder lines
    const printLines = lines.filter((l) => {
      const hasDesc = l.description.trim().length > 0;
      const hasValue = parseFloat(l.rate) !== 0 || parseFloat(l.quantity) !== 0;
      return hasDesc || hasValue;
    });

    // ── Company contact lines (used in header) ────────────────────────────────
    const companyLines: string[] = [];
    if (company.abn) companyLines.push(`ABN: ${company.abn}`);
    if (company.phone) companyLines.push(company.phone);
    if (company.email) companyLines.push(company.email);
    if (company.website) companyLines.push(company.website);
    if (company.address) companyLines.push(company.address);

    // ── Job / quote meta block ────────────────────────────────────────────────
    const metaRows: Array<[string, string]> = [];
    if (estimate.title) metaRows.push(['Quote Title', estimate.title]);
    if (job?.jobNumber) metaRows.push(['Job Number', job.jobNumber]);
    if (job?.name) metaRows.push(['Job Name', job.name]);
    if (job?.client) metaRows.push(['Client', job.client]);
    if (job?.address) metaRows.push(['Site Address', job.address]);
    metaRows.push(['Date', date]);
    if (estimate.status && estimate.status !== 'Draft') metaRows.push(['Status', estimate.status]);

    const metaHtml = `
      <table class="meta-table">
        ${metaRows.map(([k, v]) => `<tr><td class="meta-key">${k}</td><td class="meta-val">${v}</td></tr>`).join('')}
      </table>`;

    // ── Line table ────────────────────────────────────────────────────────────
    let tableHtml = '';

    if (mode === 'itemised') {
      const rows = printLines.map((l) => {
        const amt = lineCalc(l);
        return `<tr class="line-row">
          <td class="td-desc">${l.description || '—'}</td>
          <td class="td-num">${l.quantity}</td>
          <td class="td-unit">${l.unit}</td>
          <td class="td-num">$${parseFloat(l.rate).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td class="td-num td-amount">${fmt(amt)}</td>
        </tr>`;
      }).join('');
      tableHtml = `
        <table class="lines-table">
          <thead>
            <tr class="thead-row">
              <th class="th-desc">Description</th>
              <th class="th-num">Qty</th>
              <th class="th-unit">Unit</th>
              <th class="th-num">Rate</th>
              <th class="th-num">Amount</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>`;
    } else {
      // scope-total or unpriced — description + qty + unit table
      const rows = printLines.map((l) => `
        <tr class="line-row">
          <td class="td-desc">${l.description || '—'}</td>
          <td class="td-num">${l.quantity}</td>
          <td class="td-unit">${l.unit}</td>
        </tr>`).join('');
      tableHtml = `
        <table class="lines-table">
          <thead>
            <tr class="thead-row">
              <th class="th-desc">Description</th>
              <th class="th-num">Qty</th>
              <th class="th-unit">Unit</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>`;
    }

    // ── Totals block ──────────────────────────────────────────────────────────
    let totalsHtml = '';
    if (mode === 'itemised' || mode === 'scope-total') {
      const totalRows: string[] = [];
      if (mode === 'itemised') {
        totalRows.push(`<tr><td class="tot-label">Subtotal</td><td class="tot-val">${fmt(totals.subtotal)}</td></tr>`);
        if (parseFloat(estimate.markupPercent) > 0) {
          totalRows.push(`<tr><td class="tot-label">Markup (${estimate.markupPercent}%)</td><td class="tot-val">${fmt(totals.markupAmount)}</td></tr>`);
        }
        if (totals.gst > 0) {
          totalRows.push(`<tr><td class="tot-label">GST (10%)</td><td class="tot-val">${fmt(totals.gst)}</td></tr>`);
        }
      }
      totalRows.push(`<tr class="tot-total-row"><td class="tot-label">Total</td><td class="tot-val">${fmt(totals.total)}</td></tr>`);
      totalsHtml = `<div class="totals-wrap"><table class="totals-table">${totalRows.join('')}</table></div>`;
    }

    // ── PDF style extras ──────────────────────────────────────────────────────
    const showFooter = pdfStyle.showFooterOnEstimates;
    const headerSubHtml = pdfStyle.headerText
      ? `<div class="company-header-sub">${pdfStyle.headerText}</div>` : '';

    const disclaimerHtml = pdfStyle.estimateDisclaimer
      ? `<div class="disclaimer"><strong>Disclaimer:</strong> ${pdfStyle.estimateDisclaimer}</div>` : '';

    const paymentHtml = pdfStyle.paymentTerms
      ? `<div class="disclaimer"><strong>Payment Terms:</strong> ${pdfStyle.paymentTerms}</div>` : '';

    const acceptanceHtml = pdfStyle.acceptanceNote
      ? `<div class="acceptance">
          <p class="acceptance-label">Acceptance</p>
          <p class="acceptance-text">${pdfStyle.acceptanceNote}</p>
          <div class="acceptance-line"></div>
          <p class="acceptance-sig">Signature &amp; Date</p>
        </div>` : '';

    const footerHtml = showFooter
      ? `<div class="doc-footer">
          <span>${pdfStyle.footerText || (company.name ?? 'IWILLBUILD') + ' — ' + estimate.title}</span>
          <span>Printed ${date}</span>
        </div>` : '';

    // ── Full document ─────────────────────────────────────────────────────────
    const docTitle = `${job?.jobNumber ? job.jobNumber + ' — ' : ''}${estimate.title}`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>${docTitle}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  @page { size: A4; margin: 14mm 14mm 16mm 14mm; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
    font-size: 13px;
    color: #1e293b;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  @media screen { body { padding: 20mm 20mm; max-width: 210mm; margin: 0 auto; } }

  /* ── Header ── */
  .doc-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 3px solid #f97316;
    padding-bottom: 14px;
    margin-bottom: 18px;
  }
  .company-name { font-size: 20px; font-weight: 800; color: #f97316; letter-spacing: -0.3px; line-height: 1.2; }
  .company-header-sub { font-size: 12px; font-weight: 600; color: #475569; margin-top: 3px; }
  .company-detail { font-size: 11px; color: #64748b; margin-top: 2px; line-height: 1.5; }
  .doc-label { text-align: right; }
  .doc-label-title { font-size: 22px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px; }
  .doc-label-sub { font-size: 11px; color: #94a3b8; margin-top: 3px; }

  /* ── Meta table ── */
  .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }
  .meta-key { width: 130px; font-weight: 600; color: #64748b; padding: 3px 12px 3px 0; vertical-align: top; white-space: nowrap; }
  .meta-val { color: #1e293b; font-weight: 500; padding: 3px 0; }

  /* ── Lines table ── */
  .lines-table { width: 100%; border-collapse: collapse; font-size: 12.5px; margin-bottom: 0; }
  .thead-row { background: #f8fafc; }
  .thead-row th { padding: 9px 10px; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.4px; border-top: 1px solid #e2e8f0; border-bottom: 2px solid #e2e8f0; }
  .th-desc { text-align: left; }
  .th-num  { text-align: right; width: 70px; }
  .th-unit { text-align: left;  width: 60px; }
  .line-row td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  .line-row:last-child td { border-bottom: 2px solid #e2e8f0; }
  .td-desc  { text-align: left; line-height: 1.5; }
  .td-num   { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .td-unit  { text-align: left; color: #64748b; }
  .td-amount { font-weight: 600; }
  .line-row { page-break-inside: avoid; }

  /* ── Totals ── */
  .totals-wrap { display: flex; justify-content: flex-end; margin-top: 12px; margin-bottom: 16px; }
  .totals-table { border-collapse: collapse; font-size: 13px; min-width: 240px; }
  .totals-table td { padding: 5px 10px; }
  .tot-label { color: #475569; text-align: left; }
  .tot-val   { text-align: right; font-variant-numeric: tabular-nums; font-weight: 500; }
  .tot-total-row td { font-size: 16px; font-weight: 800; color: #0f172a; border-top: 2px solid #e2e8f0; padding-top: 8px; }

  /* ── Disclaimer / Terms ── */
  .disclaimer { font-size: 11px; color: #64748b; border-top: 1px solid #f1f5f9; padding: 10px 0; line-height: 1.6; page-break-inside: avoid; }
  .disclaimer strong { color: #475569; }

  /* ── Acceptance block ── */
  .acceptance { margin-top: 24px; padding: 16px; border: 1px solid #e2e8f0; border-radius: 8px; page-break-inside: avoid; }
  .acceptance-label { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 6px; }
  .acceptance-text { font-size: 12px; color: #475569; margin-bottom: 24px; line-height: 1.5; }
  .acceptance-line { border-top: 1px solid #334155; margin-bottom: 4px; }
  .acceptance-sig { font-size: 10px; color: #94a3b8; }

  /* ── Footer ── */
  .doc-footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; display: flex; justify-content: space-between; }

  @media print { html, body { margin: 0; padding: 0; } }
</style>
</head>
<body>
  <div class="doc-header">
    <div class="company-block">
      <div class="company-name">${company.name ?? 'IWILLBUILD'}</div>
      ${headerSubHtml}
      ${companyLines.map((l) => `<div class="company-detail">${l}</div>`).join('')}
    </div>
    <div class="doc-label">
      <div class="doc-label-title">QUOTE</div>
      <div class="doc-label-sub">${date}</div>
    </div>
  </div>

  ${metaHtml}
  ${tableHtml}
  ${totalsHtml}
  ${disclaimerHtml}
  ${paymentHtml}
  ${acceptanceHtml}
  ${footerHtml}
</body>
</html>`;

    const w = window.open('', '_blank', 'width=900,height=750');
    if (!w) { setPrinting(false); return; }
    w.document.write(html);
    w.document.close();
    w.document.title = docTitle;
    w.onload = () => { w.focus(); w.print(); };
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
            <label
              key={opt.value}
              className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${mode === opt.value ? 'border-primary bg-orange-50' : 'border-border hover:bg-muted/50'}`}
            >
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

// ── Cost Guide types ──────────────────────────────────────────────────────────
interface CostItem { id: number; description: string; unit: string | null; rate: string }
interface RecipeLine { id?: number; description: string; quantity: string; unit: string | null; rate: string; lineOrder: number }
interface Recipe { id: number; title: string; notes: string | null; lines: RecipeLine[] }

// ── Cost Guide Picker Modal ───────────────────────────────────────────────────
function CostGuidePicker({ onInsert, onClose }: { onInsert: (item: CostItem) => void; onClose: () => void }) {
  const [items, setItems] = useState<CostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/cost-guide', { credentials: 'include' })
      .then((r) => r.json() as Promise<{ items?: CostItem[] }>)
      .then((d) => setItems(d.items ?? []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = items
    .filter((i) => !search || i.description.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.description.toLowerCase().localeCompare(b.description.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh]">
        <div className="px-5 pt-5 pb-3 border-b border-slate-100 shrink-0">
          <h3 className="font-heading font-bold text-base flex items-center gap-2"><Calculator size={15} className="text-primary" />Pick from Cost Guide</h3>
          <p className="text-xs text-slate-400 mt-1">Click an item to add it as a line. Qty defaults to 1.</p>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="mt-3 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            autoFocus
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading && <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-primary" /></div>}
          {!loading && filtered.length === 0 && (
            <div className="text-center py-10 text-slate-400 text-sm">
              {search ? 'No items match your search' : 'No cost items in your guide yet'}
            </div>
          )}
          {!loading && filtered.map((item) => (
            <button
              key={item.id}
              onClick={() => { onInsert(item); onClose(); }}
              className="w-full flex items-center justify-between px-5 py-3 hover:bg-orange-50 border-b border-slate-50 transition-colors text-left"
            >
              <div>
                <div className="text-sm font-medium text-slate-800">{item.description}</div>
                {item.unit && <div className="text-xs text-slate-400">{item.unit}</div>}
              </div>
              <div className="text-sm font-mono font-semibold text-slate-700 shrink-0 ml-4">${parseFloat(item.rate).toFixed(2)}</div>
            </button>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-slate-100 flex justify-end shrink-0">
          <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Recipe Picker Modal ───────────────────────────────────────────────────────
function RecipePicker({ onInsert, onClose }: { onInsert: (recipe: Recipe) => void; onClose: () => void }) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/recipes', { credentials: 'include' })
      .then((r) => r.json() as Promise<{ recipes?: Recipe[] }>)
      .then((d) => setRecipes(d.recipes ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh]">
        <div className="px-5 pt-5 pb-3 border-b border-slate-100 shrink-0">
          <h3 className="font-heading font-bold text-base flex items-center gap-2"><BookOpen size={15} className="text-primary" />Insert Recipe</h3>
          <p className="text-xs text-slate-400 mt-1">Click a recipe to insert all its lines into the estimate.</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading && <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-primary" /></div>}
          {!loading && recipes.length === 0 && (
            <div className="text-center py-10 text-slate-400 text-sm">No recipes in your library yet</div>
          )}
          {!loading && recipes.map((recipe) => {
            const total = recipe.lines.reduce((s, l) => s + (parseFloat(l.quantity) || 0) * (parseFloat(l.rate) || 0), 0);
            return (
              <button
                key={recipe.id}
                onClick={() => { onInsert(recipe); onClose(); }}
                className="w-full flex items-center justify-between px-5 py-3 hover:bg-orange-50 border-b border-slate-50 transition-colors text-left"
              >
                <div>
                  <div className="text-sm font-medium text-slate-800">{recipe.title}</div>
                  <div className="text-xs text-slate-400">{recipe.lines.length} line{recipe.lines.length !== 1 ? 's' : ''}{recipe.notes ? ` · ${recipe.notes}` : ''}</div>
                </div>
                <div className="text-sm font-mono font-semibold text-slate-700 shrink-0 ml-4">${total.toFixed(2)}</div>
              </button>
            );
          })}
        </div>
        <div className="px-5 py-3 border-t border-slate-100 flex justify-end shrink-0">
          <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Main editor ───────────────────────────────────────────────────────────────
export default function EstimateEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin, isOwner } = usePermissions();
  const canApprove = isAdmin || isOwner;

  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [lines, setLines] = useState<LocalLine[]>([]);
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [showCostPicker, setShowCostPicker] = useState(false);
  const [showRecipePicker, setShowRecipePicker] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  // Refs for save-on-back — always hold latest values without stale closures
  const estimateRef = useRef<Estimate | null>(null);
  const linesRef = useRef<LocalLine[]>([]);

  useEffect(() => {
    if (id) load(parseInt(id, 10));
  }, [id]);

  // Keep refs in sync so save-on-back always reads current values
  useEffect(() => { linesRef.current = lines; }, [lines]);
  useEffect(() => { estimateRef.current = estimate; }, [estimate]);

  async function load(estimateId: number) {
    setLoading(true);
    setError('');
    try {
      const { estimate: est, lines: apiLines } = await fetchEstimate(estimateId);
      setEstimate(est);
      setLines(apiLines.length > 0 ? apiLines.map(fromApiLine) : [blankLine(0)]);
      // Load job info
      try {
        const j = await fetchJob(est.jobId);
        setJob(j);
      } catch { /* non-critical */ }
    } catch {
      setError('Estimate not found or failed to load.');
    } finally {
      setLoading(false);
    }
  }

  const isLocked = estimate?.status === 'Approved';

  // ── Save ──────────────────────────────────────────────────────────────────
  const save = useCallback(async (est: Estimate, localLines: LocalLine[]) => {
    setSaving(true);
    setSaveError('');
    try {
      const { estimate: updated, lines: updatedLines } = await updateEstimate(est.id, {
        title: est.title,
        status: est.status,
        markupPercent: est.markupPercent,
        gstMode: est.gstMode,
        notes: est.notes ?? undefined,
        lines: localLines.map((l, i) => ({
          description: l.description,
          quantity: l.quantity,
          unit: l.unit || undefined,
          rate: l.rate,
          lineOrder: i,
        })),
      });
      setEstimate(updated);
      estimateRef.current = updated;
      // Merge server IDs back without replacing the whole array (preserves focus)
      setLines((prev) => prev.map((l, i) => {
        const serverLine = updatedLines[i];
        return serverLine ? { ...l, id: serverLine.id } : l;
      }));
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, []);

  // Manual save — called by Save button and back-navigation
  function handleSave() {
    if (!estimate || isLocked) return;
    void save(estimate, lines);
  }

  // Save-on-back: save if dirty, then navigate
  async function handleBack() {
    const est = estimateRef.current;
    const currentLines = linesRef.current;
    if (est && !isLocked && dirty) {
      await save(est, currentLines);
    }
    if (est) {
      navigate(`/jobs/${est.jobId}?tab=estimates`);
    } else {
      navigate(-1);
    }
  }

  function updateEstimateField<K extends keyof Estimate>(key: K, value: Estimate[K]) {
    if (!estimate || isLocked) return;
    const updated = { ...estimate, [key]: value };
    setEstimate(updated);
    estimateRef.current = updated;
    setDirty(true);
  }

  function updateLine(key: string, field: keyof LocalLine, value: string) {
    if (isLocked) return;
    setLines((prev) => prev.map((l) => l._key === key ? { ...l, [field]: value } : l));
    setDirty(true);
  }

  function triggerSave() {
    // No-op: kept so insertCostItem / insertRecipe can still call it for immediate saves
  }

  function addLine() {
    if (isLocked || lines.length >= LIMITS.ESTIMATE_LINES) return;
    setLines((prev) => [...prev, blankLine(prev.length)]);
    setDirty(true);
  }

  function deleteLine(key: string) {
    if (isLocked) return;
    setLines((prev) => {
      const next = prev.filter((l) => l._key !== key);
      return next.length === 0 ? [blankLine(0)] : next;
    });
    setDirty(true);
  }

  function moveLine(key: string, dir: 'up' | 'down') {
    if (isLocked) return;
    setLines((prev) => {
      const idx = prev.findIndex((l) => l._key === key);
      if (idx < 0) return prev;
      const next = [...prev];
      const swap = dir === 'up' ? idx - 1 : idx + 1;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
    setDirty(true);
  }

  function copyLine(key: string) {
    if (isLocked) return;
    setLines((prev) => {
      const idx = prev.findIndex((l) => l._key === key);
      if (idx < 0) return prev;
      const src = prev[idx];
      const copy: LocalLine = { ...src, _key: newKey(), id: undefined };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
    setDirty(true);
  }

  function insertCostItem(item: CostItem) {
    if (isLocked || !estimate) return;
    const newLine: LocalLine = {
      _key: newKey(),
      description: item.description,
      quantity: '1',
      unit: item.unit ?? '',
      rate: item.rate,
      lineOrder: lines.length,
    };
    setLines((prev) => {
      const filtered = prev.length === 1 && !prev[0].description && prev[0].rate === '0'
        ? [] : prev;
      const next = [...filtered, newLine];
      // Save immediately after inserting from picker
      void save(estimate, next);
      return next;
    });
  }

  function insertRecipe(recipe: Recipe) {
    if (isLocked || !estimate) return;
    const newLines: LocalLine[] = recipe.lines.map((l) => ({
      _key: newKey(),
      description: l.description,
      quantity: l.quantity,
      unit: l.unit ?? '',
      rate: l.rate,
      lineOrder: 0,
    }));
    setLines((prev) => {
      const filtered = prev.length === 1 && !prev[0].description && prev[0].rate === '0'
        ? [] : prev;
      const next = [...filtered, ...newLines];
      // Save immediately after inserting from picker
      void save(estimate, next);
      return next;
    });
  }

  async function handleExportCsv() {
    if (!estimate) return;
    setExportingCsv(true);
    try {
      const res = await fetch(`/api/estimates/${estimate.id}/export-csv`, { credentials: 'include' });
      if (!res.ok) { alert('Export failed'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeName = (estimate.title ?? 'estimate').replace(/[^a-z0-9]/gi, '-').toLowerCase();
      a.download = `estimate-${safeName}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportingCsv(false);
    }
  }

  function downloadEstimateTemplate() {
    const csv = 'description,quantity,unit,rate\nSupply and install internal door,1,each,183\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'estimate-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleCsvImportSuccess(result: { imported: number; lines?: Array<{ id?: number; description: string; quantity: string; unit: string | null; rate: string; lineOrder: number }> }) {
    // Reload estimate lines from server after import
    if (estimate) void load(estimate.id);
  }

  async function handleDuplicate() {
    if (!estimate) return;
    try {
      const newEst = await createEstimate({
        jobId: estimate.jobId,
        title: `${estimate.title} (Copy)`,
        status: 'Draft',
        markupPercent: estimate.markupPercent,
        gstMode: estimate.gstMode,
        notes: estimate.notes ?? undefined,
        lines: lines.map((l, i) => ({
          description: l.description,
          quantity: l.quantity,
          unit: l.unit || undefined,
          rate: l.rate,
          lineOrder: i,
        })),
      });
      navigate(`/estimates/${newEst.id}`);
    } catch {
      setSaveError('Failed to duplicate estimate.');
    }
  }

  async function handleStatusChange(newStatus: string) {
    if (!estimate) return;
    setStatusOpen(false);
    const updated = { ...estimate, status: newStatus as Estimate['status'] };
    setEstimate(updated);
    estimateRef.current = updated;
    await save(updated, lines);
  }

  function openMobileMenu() {
    window.dispatchEvent(new Event('portal:open-menu'));
  }

  const totals = estimate ? estimateTotals(lines, estimate.markupPercent, estimate.gstMode) : null;
  const statusStyle = estimate ? getEstimateStatusStyle(estimate.status) : null;

  return (
    <div className="portal-page">
      <Helmet>
        <title>{estimate ? `${estimate.title} — Estimate — IWILLBUILD` : 'Estimate — IWILLBUILD'}</title>
        <meta name="description" content={estimate ? `Estimate: ${estimate.title}` : 'Estimate editor — IWILLBUILD Portal'} />
        <link rel="canonical" href={`https://iwillbuild.com/estimates/${id}`} />
        <meta name="robots" content="noindex" />
      </Helmet>

      <PortalSidebar />

      <div className="portal-main">
        {/* Top bar */}
        <header className="h-16 bg-white border-b border-border flex items-center justify-between px-4 md:px-6 shrink-0 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={openMobileMenu} className="md:hidden p-2 -ml-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0">
              <Menu size={20} />
            </button>
            {/* Back button — saves if dirty before navigating */}
            <button
              onClick={() => void handleBack()}
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors text-sm shrink-0"
            >
              <ChevronLeft size={16} />
              <span className="hidden sm:inline truncate max-w-[120px]">
                {job ? (job.jobNumber ?? job.name) : 'Back'}
              </span>
            </button>
            <span className="text-border">|</span>
            <FileText size={15} className="text-primary shrink-0" />
            <h1 className="font-heading font-bold text-sm md:text-base truncate">
              {estimate?.title ?? 'Loading…'}
            </h1>
            {/* Unsaved dot */}
            {dirty && !saving && (
              <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" title="Unsaved changes" />
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Status badge + dropdown */}
            {estimate && statusStyle && (
              <div className="relative">
                <button
                  onClick={() => setStatusOpen(!statusOpen)}
                  className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-full border transition-colors ${statusStyle.bg} ${statusStyle.color}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
                  {estimate.status}
                  <ChevronDown size={10} />
                </button>
                {statusOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setStatusOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 bg-white border border-border rounded-xl shadow-lg z-20 py-1 min-w-[180px]">
                      {ESTIMATE_STATUSES.map((s) => {
                        const st = getEstimateStatusStyle(s);
                        const locked = s === 'Approved' && !canApprove;
                        return (
                          <button
                            key={s}
                            onClick={() => { if (!locked) handleStatusChange(s); }}
                            disabled={locked}
                            className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 transition-colors
                              ${locked ? 'opacity-40 cursor-not-allowed' : 'hover:bg-muted'}
                              ${estimate.status === s ? 'font-bold' : ''}`}
                          >
                            <span className={`w-2 h-2 rounded-full shrink-0 ${st.dot}`} />
                            <span className="flex-1">{s}</span>
                            {locked && <Lock size={10} className="text-muted-foreground" />}
                            {estimate.status === s && !locked && <Check size={12} className="ml-auto text-primary" />}
                          </button>
                        );
                      })}
                      {!canApprove && (
                        <p className="px-4 py-2 text-[10px] text-muted-foreground border-t border-border mt-1">
                          Admin approval required
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Save indicator */}
            {saving && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
            {saved && !saving && !dirty && <span className="text-xs text-emerald-600 font-semibold">Saved</span>}

            {/* Print */}
            <button
              onClick={() => setShowPrint(true)}
              className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5 hover:bg-muted transition-colors"
            >
              <Printer size={14} />
              <span className="hidden sm:inline">Print</span>
            </button>

            {/* Duplicate */}
            <button
              onClick={handleDuplicate}
              className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5 hover:bg-muted transition-colors"
            >
              <Copy size={14} />
              <span className="hidden sm:inline">Duplicate</span>
            </button>

            {/* Manual save */}
            {!isLocked && (
              <button
                onClick={handleSave}
                disabled={saving}
                className={`flex items-center gap-1.5 text-sm font-bold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60 ${
                  dirty
                    ? 'bg-primary hover:bg-orange-600 text-white'
                    : 'bg-primary/70 hover:bg-primary text-white'
                }`}
              >
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                <span className="hidden sm:inline">{dirty ? 'Save' : 'Saved'}</span>
              </button>
            )}
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {loading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={24} className="animate-spin text-primary" />
            </div>
          )}

          {error && (
            <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 max-w-lg">
              <AlertCircle size={16} className="shrink-0" />
              {error}
            </div>
          )}

          {saveError && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700 mb-4 max-w-2xl">
              <AlertCircle size={14} className="shrink-0" />
              {saveError}
            </div>
          )}

          {estimate && (
            <div className="max-w-4xl flex flex-col gap-4">

              {/* Approved lock banner */}
              {isLocked && (
                <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-800">
                  <Lock size={15} className="shrink-0" />
                  <span><strong>Approved — editing is locked.</strong> Duplicate this estimate to create an editable copy.</span>
                  <button
                    onClick={handleDuplicate}
                    className="ml-auto flex items-center gap-1.5 text-xs font-bold bg-emerald-700 hover:bg-emerald-800 text-white px-3 py-1.5 rounded-lg transition-colors shrink-0"
                  >
                    <Copy size={12} />
                    Duplicate
                  </button>
                </div>
              )}

              {/* Header card */}
              <div className="bg-white rounded-xl border border-border p-5 flex flex-col gap-4">
                <h2 className="font-heading font-bold text-sm text-muted-foreground uppercase tracking-wider">Estimate Details</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold mb-1.5">Title <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={estimate.title}
                      disabled={isLocked}
                      onChange={(e) => updateEstimateField('title', e.target.value)}
                      className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors disabled:bg-muted disabled:text-muted-foreground"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1.5">Markup %</label>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={estimate.markupPercent}
                      disabled={isLocked}
                      onChange={(e) => updateEstimateField('markupPercent', e.target.value)}
                      className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors disabled:bg-muted disabled:text-muted-foreground"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1.5">GST</label>
                    <select
                      value={estimate.gstMode}
                      disabled={isLocked}
                      onChange={(e) => updateEstimateField('gstMode', e.target.value as Estimate['gstMode'])}
                      className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors bg-white disabled:bg-muted disabled:text-muted-foreground"
                    >
                      {GST_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1.5">Notes</label>
                    <input
                      type="text"
                      value={estimate.notes ?? ''}
                      disabled={isLocked}
                      onChange={(e) => updateEstimateField('notes', e.target.value || null as unknown as string)}
                      placeholder="Optional notes"
                      className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors disabled:bg-muted disabled:text-muted-foreground"
                    />
                  </div>
                </div>
              </div>

              {/* Lines table */}
              <div className="bg-white rounded-xl border border-border overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                  <div className="flex items-center gap-2">
                    <h2 className="font-heading font-bold text-sm text-muted-foreground uppercase tracking-wider">Line Items</h2>
                    {!isLocked && (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                        lines.length >= LIMITS.ESTIMATE_LINES
                          ? 'bg-red-50 text-red-600 border-red-200'
                          : lines.length >= LIMITS.ESTIMATE_LINES * 0.9
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-muted text-muted-foreground border-border'
                      }`}>{lines.length} / {LIMITS.ESTIMATE_LINES}</span>
                    )}
                  </div>
                  {!isLocked && (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setShowCostPicker(true)}
                        className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-primary hover:bg-orange-50 px-2.5 py-1.5 rounded-lg transition-colors border border-slate-200 hover:border-primary/30"
                      >
                        <Calculator size={12} />
                        Cost Guide
                      </button>
                      <button
                        onClick={() => setShowRecipePicker(true)}
                        className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-primary hover:bg-orange-50 px-2.5 py-1.5 rounded-lg transition-colors border border-slate-200 hover:border-primary/30"
                      >
                        <BookOpen size={12} />
                        Recipe
                      </button>
                      <button
                        onClick={addLine}
                        disabled={isLocked || lines.length >= LIMITS.ESTIMATE_LINES}
                        title={lines.length >= LIMITS.ESTIMATE_LINES ? `Estimate line limit reached (${LIMITS.ESTIMATE_LINES} lines)` : undefined}
                        className="flex items-center gap-1.5 text-xs font-bold text-primary hover:bg-orange-50 disabled:opacity-40 disabled:cursor-not-allowed px-2.5 py-1.5 rounded-lg transition-colors"
                      >
                        <Plus size={13} />
                        Add Line
                      </button>
                      {/* CSV actions */}
                      <div className="w-px h-4 bg-slate-200 mx-0.5" />
                      <button
                        onClick={downloadEstimateTemplate}
                        className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-600 hover:bg-slate-50 px-2 py-1.5 rounded-lg transition-colors"
                        title="Download CSV template"
                      >
                        <FileText size={12} />Template
                      </button>
                      <button
                        onClick={() => setShowCsvImport(true)}
                        className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-primary hover:bg-orange-50 px-2 py-1.5 rounded-lg transition-colors border border-slate-200 hover:border-primary/30"
                      >
                        <Upload size={12} />Import CSV
                      </button>
                      <button
                        onClick={handleExportCsv}
                        disabled={exportingCsv || lines.length === 0}
                        className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-primary hover:bg-orange-50 disabled:opacity-40 disabled:cursor-not-allowed px-2 py-1.5 rounded-lg transition-colors border border-slate-200 hover:border-primary/30"
                      >
                        {exportingCsv ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}Export CSV
                      </button>
                    </div>
                  )}
                </div>

                {/* Desktop table */}
                {!isLocked && lines.length >= LIMITS.ESTIMATE_LINES && (
                  <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-sm text-amber-800 mb-2">
                    <AlertCircle size={14} className="shrink-0" />
                    Estimate line limit reached ({LIMITS.ESTIMATE_LINES} lines). Delete lines to add more.
                  </div>
                )}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm table-fixed">
                    <thead>
                      <tr className="bg-muted/40 text-xs font-semibold text-muted-foreground">
                        <th className="text-left px-4 py-2.5 w-[55%]">Description</th>
                        <th className="text-right px-2 py-2.5 w-[7%]">Qty</th>
                        <th className="text-left px-2 py-2.5 w-[7%]">Unit</th>
                        <th className="text-right px-2 py-2.5 w-[9%]">Rate</th>
                        <th className="text-right px-2 py-2.5 w-[9%]">Calc</th>
                        <th className="px-2 py-2.5 w-[13%]"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line, idx) => (
                        <tr key={line._key} className="border-t border-border/50 hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-2">
                            <textarea
                              value={line.description}
                              disabled={isLocked}
                              onChange={(e) => {
                                updateLine(line._key, 'description', e.target.value);
                                // resize on change
                                const t = e.currentTarget;
                                t.style.height = 'auto';
                                t.style.height = `${t.scrollHeight}px`;
                              }}
                              rows={1}
                              placeholder="Description"
                              className="w-full px-2 py-1.5 border border-transparent rounded focus:outline-none focus:border-primary/40 focus:bg-orange-50/30 text-sm resize-none transition-colors disabled:bg-transparent disabled:cursor-default"
                              style={{ minHeight: '34px', height: 'auto', overflow: 'hidden' }}
                              ref={(el) => {
                                // Auto-size on mount / value change
                                if (el) {
                                  el.style.height = 'auto';
                                  el.style.height = `${el.scrollHeight}px`;
                                }
                              }}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={line.quantity}
                              disabled={isLocked}
                              onChange={(e) => updateLine(line._key, 'quantity', e.target.value)}
                              className="w-full px-1.5 py-1.5 border border-transparent rounded text-right focus:outline-none focus:border-primary/40 focus:bg-orange-50/30 text-sm transition-colors disabled:bg-transparent disabled:cursor-default"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="text"
                              value={line.unit}
                              disabled={isLocked}
                              onChange={(e) => updateLine(line._key, 'unit', e.target.value)}
                              placeholder="ea"
                              className="w-full px-1.5 py-1.5 border border-transparent rounded focus:outline-none focus:border-primary/40 focus:bg-orange-50/30 text-sm transition-colors disabled:bg-transparent disabled:cursor-default"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={line.rate}
                              disabled={isLocked}
                              onChange={(e) => updateLine(line._key, 'rate', e.target.value)}
                              className="w-full px-1.5 py-1.5 border border-transparent rounded text-right focus:outline-none focus:border-primary/40 focus:bg-orange-50/30 text-sm transition-colors disabled:bg-transparent disabled:cursor-default"
                            />
                          </td>
                          <td className="px-2 py-2 text-right font-mono text-sm text-foreground">
                            ${lineCalc(line).toFixed(2)}
                          </td>
                          <td className="px-2 py-2">
                            {!isLocked && (
                              <div className="flex items-center gap-0.5 justify-end">
                                <button onClick={() => moveLine(line._key, 'up')} disabled={idx === 0} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30">
                                  <ArrowUp size={12} />
                                </button>
                                <button onClick={() => moveLine(line._key, 'down')} disabled={idx === lines.length - 1} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30">
                                  <ArrowDown size={12} />
                                </button>
                                <button onClick={() => copyLine(line._key)} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                                  <Copy size={12} />
                                </button>
                                <button onClick={() => deleteLine(line._key)} className="p-1 rounded text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors">
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="md:hidden flex flex-col divide-y divide-border/50">
                  {lines.map((line, idx) => (
                    <div key={line._key} className="p-4 flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-muted-foreground">Line {idx + 1}</span>
                        {!isLocked && (
                          <div className="flex items-center gap-1">
                            <button onClick={() => moveLine(line._key, 'up')} disabled={idx === 0} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30"><ArrowUp size={12} /></button>
                            <button onClick={() => moveLine(line._key, 'down')} disabled={idx === lines.length - 1} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30"><ArrowDown size={12} /></button>
                            <button onClick={() => copyLine(line._key)} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted"><Copy size={12} /></button>
                            <button onClick={() => deleteLine(line._key)} className="p-1 rounded text-muted-foreground hover:text-red-600 hover:bg-red-50"><Trash2 size={12} /></button>
                          </div>
                        )}
                      </div>
                      <textarea
                        value={line.description}
                        disabled={isLocked}
                        onChange={(e) => updateLine(line._key, 'description', e.target.value)}
                        rows={2}
                        placeholder="Description"
                        className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none disabled:bg-muted"
                      />
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-xs text-muted-foreground">Qty</label>
                          <input type="number" min="0" step="any" value={line.quantity} disabled={isLocked} onChange={(e) => updateLine(line._key, 'quantity', e.target.value)} className="w-full px-2 py-1.5 border border-border rounded text-sm text-right focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:bg-muted" />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">Unit</label>
                          <input type="text" value={line.unit} disabled={isLocked} onChange={(e) => updateLine(line._key, 'unit', e.target.value)} placeholder="ea" className="w-full px-2 py-1.5 border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:bg-muted" />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">Rate</label>
                          <input type="number" min="0" step="any" value={line.rate} disabled={isLocked} onChange={(e) => updateLine(line._key, 'rate', e.target.value)} className="w-full px-2 py-1.5 border border-border rounded text-sm text-right focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:bg-muted" />
                        </div>
                      </div>
                      <div className="text-right text-sm font-mono font-semibold">${lineCalc(line).toFixed(2)}</div>
                    </div>
                  ))}
                </div>

                {/* Add line button (bottom) */}
                {!isLocked && (
                  <div className="border-t border-border/50 px-4 py-3">
                    <button onClick={addLine} className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary transition-colors">
                      <Plus size={13} />
                      Add line
                    </button>
                  </div>
                )}
              </div>

              {/* Totals */}
              {totals && (
                <div className="bg-white rounded-xl border border-border p-5">
                  <div className="flex flex-col gap-2 max-w-xs ml-auto">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span className="font-mono">${totals.subtotal.toFixed(2)}</span>
                    </div>
                    {parseFloat(estimate.markupPercent) > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Markup ({estimate.markupPercent}%)</span>
                        <span className="font-mono">${totals.markupAmount.toFixed(2)}</span>
                      </div>
                    )}
                    {totals.gst > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">GST (10%)</span>
                        <span className="font-mono">${totals.gst.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-base font-bold border-t border-border pt-2 mt-1">
                      <span>Total</span>
                      <span className="font-mono text-primary">${totals.total.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showPrint && estimate && (
        <PrintModal estimate={estimate} lines={lines} job={job} onClose={() => setShowPrint(false)} />
      )}
      {showCostPicker && !isLocked && (
        <CostGuidePicker onInsert={insertCostItem} onClose={() => setShowCostPicker(false)} />
      )}
      {showRecipePicker && !isLocked && (
        <RecipePicker onInsert={insertRecipe} onClose={() => setShowRecipePicker(false)} />
      )}
      {showCsvImport && estimate && (
        <CsvImportModal
          title="Import Estimate Lines from CSV"
          uploadUrl={`/api/estimates/${estimate.id}/import-csv`}
          locked={isLocked}
          lockedMessage="This estimate is Approved and locked. Change the status before importing."
          onSuccess={handleCsvImportSuccess}
          onClose={() => setShowCsvImport(false)}
        />
      )}
    </div>
  );
}
