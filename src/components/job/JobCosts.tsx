import { useState, useEffect, useRef } from 'react';
import {
  Plus, Loader2, X, Pencil, Trash2, Receipt, Download,
  TrendingUp, TrendingDown, DollarSign, AlertTriangle, Check, Upload,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface JobCost {
  id: number;
  job_id: number;
  user_id: string;
  purchase_date: string | null;
  merchant: string | null;
  description: string;
  category: string;
  amount: string | number;
  gst_included: number | boolean;
  gst_amount: string | number;
  amount_ex_gst: string | number;
  receipt_file_id: number | null;
  notes: string | null;
  uploaded_by_name: string | null;
  created_at: string;
}

const CATEGORIES = [
  'Materials', 'Labour', 'Plant / Equipment', 'Subcontractor',
  'Fuel / Travel', 'Waste / Disposal', 'Fees / Permits', 'Other',
];

const CATEGORY_COLOURS: Record<string, string> = {
  'Materials':         'bg-blue-100 text-blue-700',
  'Labour':            'bg-purple-100 text-purple-700',
  'Plant / Equipment': 'bg-orange-100 text-orange-700',
  'Subcontractor':     'bg-teal-100 text-teal-700',
  'Fuel / Travel':     'bg-yellow-100 text-yellow-700',
  'Waste / Disposal':  'bg-red-100 text-red-700',
  'Fees / Permits':    'bg-pink-100 text-pink-700',
  'Other':             'bg-slate-100 text-slate-600',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: string | number | null | undefined) {
  const v = parseFloat(String(n ?? 0));
  return isNaN(v) ? '$0.00' : `$${v.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return d; }
}

function toNum(v: string | number | null | undefined) {
  return parseFloat(String(v ?? 0)) || 0;
}

// ── Summary card ──────────────────────────────────────────────────────────────

function SummaryCard({ label, value, sub, colour, icon: Icon }: {
  label: string; value: string; sub?: string; colour: string; icon: React.ElementType;
}) {
  return (
    <div className={`rounded-xl border p-4 flex items-start gap-3 ${colour}`}>
      <div className="p-2 rounded-lg bg-white/60 shrink-0"><Icon size={16} /></div>
      <div className="min-w-0">
        <p className="text-xs font-semibold opacity-70 mb-0.5">{label}</p>
        <p className="font-heading font-bold text-lg leading-tight">{value}</p>
        {sub && <p className="text-xs opacity-60 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Add / Edit modal ──────────────────────────────────────────────────────────

interface ModalProps {
  jobId: number;
  editing: JobCost | null;
  onClose: () => void;
  onSaved: (cost: JobCost) => void;
}

function CostModal({ jobId, editing, onClose, onSaved }: ModalProps) {
  const [form, setForm] = useState({
    purchaseDate: editing?.purchase_date?.slice(0, 10) ?? '',
    merchant: editing?.merchant ?? '',
    description: editing?.description ?? '',
    category: editing?.category ?? 'Materials',
    amount: editing ? String(toNum(editing.amount)) : '',
    gstIncluded: editing ? Boolean(editing.gst_included) : true,
    notes: editing?.notes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const receiptRef = useRef<HTMLInputElement>(null);

  const gstAmt = form.gstIncluded ? toNum(form.amount) / 11 : 0;
  const exGst = form.gstIncluded ? toNum(form.amount) - gstAmt : toNum(form.amount);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.description.trim()) return setError('Description is required');
    if (!form.amount || isNaN(parseFloat(form.amount))) return setError('Valid amount is required');
    setSaving(true); setError('');
    try {
      const url = editing
        ? `/api/jobs/${jobId}/costs/${editing.id}`
        : `/api/jobs/${jobId}/costs`;
      const r = await fetch(url, {
        method: editing ? 'PUT' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purchaseDate: form.purchaseDate || undefined,
          merchant: form.merchant || undefined,
          description: form.description,
          category: form.category,
          amount: parseFloat(form.amount),
          gstIncluded: form.gstIncluded,
          notes: form.notes || undefined,
        }),
      });
      const d = await r.json() as { cost?: JobCost; error?: string };
      if (!r.ok) throw new Error(d.error ?? 'Save failed');
      const saved = d.cost!;

      // Upload receipt if selected
      if (receiptFile) {
        setUploadingReceipt(true);
        const fd = new FormData();
        fd.append('receipt', receiptFile);
        await fetch(`/api/jobs/${jobId}/costs/${saved.id}/receipt`, {
          method: 'POST', credentials: 'include', body: fd,
        });
        setUploadingReceipt(false);
      }

      onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  function handleReceiptChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    if (ext === 'heic' || ext === 'heif') { setError('HEIC/HEIF not supported — convert to JPEG first.'); return; }
    if (f.size > 10 * 1024 * 1024) { setError('Receipt must be under 10MB.'); return; }
    setReceiptFile(f);
    setError('');
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
        className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50">
          <h2 className="font-heading font-bold text-slate-800">{editing ? 'Edit Cost' : 'Add Cost'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400"><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
              <AlertTriangle size={14} className="shrink-0" />{error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Purchase Date</label>
              <input type="date" value={form.purchaseDate} onChange={(e) => setForm((f) => ({ ...f, purchaseDate: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Category</label>
              <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white">
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Merchant / Supplier</label>
            <input type="text" value={form.merchant} onChange={(e) => setForm((f) => ({ ...f, merchant: e.target.value }))}
              placeholder="e.g. Bunnings, Kennards" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Description <span className="text-red-500">*</span></label>
            <input type="text" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="What was purchased?" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Amount <span className="text-red-500">*</span></label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-semibold">$</span>
              <input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="0.00" className="w-full border border-slate-200 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setForm((f) => ({ ...f, gstIncluded: !f.gstIncluded }))}
              className={`w-10 h-6 rounded-full transition-colors flex items-center ${form.gstIncluded ? 'bg-primary' : 'bg-slate-200'}`}>
              <span className={`w-4 h-4 bg-white rounded-full shadow transition-transform mx-1 ${form.gstIncluded ? 'translate-x-4' : 'translate-x-0'}`} />
            </button>
            <span className="text-sm font-semibold text-slate-700">GST Included</span>
            {form.amount && (
              <span className="text-xs text-slate-400 ml-auto">
                GST: {fmt(gstAmt)} &nbsp;|&nbsp; Ex GST: {fmt(exGst)}
              </span>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2} placeholder="Optional notes" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
          </div>

          {/* Receipt upload */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Receipt (optional)</label>
            <button type="button" onClick={() => receiptRef.current?.click()}
              className="flex items-center gap-2 border border-dashed border-slate-300 rounded-lg px-4 py-2.5 text-sm text-slate-500 hover:border-primary hover:text-primary transition-colors w-full justify-center">
              <Upload size={14} />
              {receiptFile ? receiptFile.name : editing?.receipt_file_id ? 'Replace receipt' : 'Upload receipt / photo'}
            </button>
            <input ref={receiptRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={handleReceiptChange} />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 border border-slate-200 text-slate-600 font-semibold text-sm py-2.5 rounded-xl hover:bg-slate-50 transition-colors">Cancel</button>
            <button type="submit" disabled={saving || uploadingReceipt}
              className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-orange-600 text-white font-bold text-sm py-2.5 rounded-xl transition-colors disabled:opacity-50">
              {(saving || uploadingReceipt) ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {saving ? 'Saving…' : uploadingReceipt ? 'Uploading receipt…' : editing ? 'Save Changes' : 'Add Cost'}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function JobCosts({ jobId }: { jobId: number }) {
  const [costs, setCosts] = useState<JobCost[]>([]);
  const [approvedTotal, setApprovedTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<JobCost | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetch(`/api/jobs/${jobId}/costs`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d: { costs?: JobCost[]; approvedTotal?: number }) => {
        setCosts(d.costs ?? []);
        setApprovedTotal(d.approvedTotal ?? 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [jobId]);

  function handleSaved(cost: JobCost) {
    setCosts((prev) => {
      const idx = prev.findIndex((c) => c.id === cost.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = cost; return next; }
      return [cost, ...prev];
    });
    setShowModal(false);
    setEditTarget(null);
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this cost entry?')) return;
    setDeleting(id);
    try {
      await fetch(`/api/jobs/${jobId}/costs/${id}`, { method: 'DELETE', credentials: 'include' });
      setCosts((prev) => prev.filter((c) => c.id !== id));
    } finally {
      setDeleting(null);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const r = await fetch(`/api/jobs/${jobId}/costs/export`, { credentials: 'include' });
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `job_costs_${jobId}.csv`; a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  // Totals
  const totalActual = costs.reduce((s, c) => s + toNum(c.amount), 0);
  const totalGst = costs.reduce((s, c) => s + toNum(c.gst_amount), 0);
  const totalExGst = costs.reduce((s, c) => s + toNum(c.amount_ex_gst), 0);
  const profit = approvedTotal - totalActual;
  const pct = approvedTotal > 0 ? (totalActual / approvedTotal) * 100 : null;
  const overBudget = approvedTotal > 0 && totalActual > approvedTotal;

  return (
    <div className="flex flex-col gap-4">

      {/* Header row */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{costs.length} cost entr{costs.length !== 1 ? 'ies' : 'y'}</p>
        <div className="flex items-center gap-2">
          {costs.length > 0 && (
            <button onClick={handleExport} disabled={exporting}
              className="flex items-center gap-1.5 border border-slate-200 text-slate-600 text-xs font-semibold px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50">
              {exporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
              <span className="hidden sm:inline">Export CSV</span>
            </button>
          )}
          <button onClick={() => { setEditTarget(null); setShowModal(true); }}
            className="flex items-center gap-1.5 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors">
            <Plus size={14} /> Add Cost
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {(costs.length > 0 || approvedTotal > 0) && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <SummaryCard label="Approved Estimate" value={fmt(approvedTotal)} icon={DollarSign}
            colour="border-slate-200 bg-slate-50 text-slate-700" />
          <SummaryCard label="Actual Costs" value={fmt(totalActual)}
            sub={pct !== null ? `${pct.toFixed(1)}% of approved` : undefined}
            icon={Receipt}
            colour={overBudget ? 'border-red-200 bg-red-50 text-red-700' : 'border-blue-200 bg-blue-50 text-blue-700'} />
          <SummaryCard
            label={profit >= 0 ? 'Profit / Margin' : 'Over Budget'}
            value={fmt(Math.abs(profit))}
            sub={approvedTotal > 0 ? `${Math.abs((profit / approvedTotal) * 100).toFixed(1)}%` : undefined}
            icon={profit >= 0 ? TrendingUp : TrendingDown}
            colour={profit >= 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'} />
          <SummaryCard label="GST Total" value={fmt(totalGst)} icon={Receipt} colour="border-slate-200 bg-slate-50 text-slate-600" />
          <SummaryCard label="Total Ex GST" value={fmt(totalExGst)} icon={DollarSign} colour="border-slate-200 bg-slate-50 text-slate-600" />
          {overBudget && (
            <div className="col-span-2 lg:col-span-1 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 font-semibold">
              <AlertTriangle size={16} className="shrink-0" /> Over budget by {fmt(Math.abs(profit))}
            </div>
          )}
        </div>
      )}

      {/* Progress bar */}
      {pct !== null && (
        <div>
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span>Cost to date</span>
            <span className={overBudget ? 'text-red-600 font-bold' : 'font-semibold'}>{pct.toFixed(1)}%</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${overBudget ? 'bg-red-500' : pct > 80 ? 'bg-orange-500' : 'bg-emerald-500'}`}
              style={{ width: `${Math.min(pct, 100)}%` }} />
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && <div className="flex items-center justify-center py-16"><Loader2 size={22} className="animate-spin text-primary" /></div>}

      {/* Empty state */}
      {!loading && costs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 bg-orange-50 rounded-xl flex items-center justify-center mb-4"><Receipt size={24} className="text-primary" /></div>
          <p className="font-heading font-bold text-slate-700 mb-1">No costs recorded yet</p>
          <p className="text-sm text-slate-400 mb-5 max-w-xs">Log materials, labour, subcontractors and receipts to track actual spend against your approved estimate.</p>
          <button onClick={() => { setEditTarget(null); setShowModal(true); }}
            className="flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-5 py-2.5 rounded-lg transition-colors">
            <Plus size={15} /> Add First Cost
          </button>
        </div>
      )}

      {/* Cost list — desktop table */}
      {!loading && costs.length > 0 && (
        <>
          {/* Desktop */}
          <div className="hidden md:block bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Description</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Category</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Amount</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">GST</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">By</th>
                  <th className="px-4 py-3 w-20" />
                </tr>
              </thead>
              <tbody>
                {costs.map((c, i) => (
                  <tr key={c.id} className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${i % 2 === 0 ? '' : 'bg-slate-50/40'}`}>
                    <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{fmtDate(c.purchase_date)}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800 text-sm">{c.description}</p>
                      {c.merchant && <p className="text-xs text-slate-400">{c.merchant}</p>}
                      {c.notes && <p className="text-xs text-slate-400 italic">{c.notes}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${CATEGORY_COLOURS[c.category] ?? 'bg-slate-100 text-slate-600'}`}>
                        {c.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-slate-800 whitespace-nowrap">{fmt(c.amount)}</td>
                    <td className="px-4 py-3 text-center">
                      {c.gst_included ? (
                        <span className="text-xs text-emerald-600 font-semibold">✓ {fmt(c.gst_amount)}</span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">{c.uploaded_by_name ?? '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        {c.receipt_file_id && (
                          <span title="Receipt attached" className="p-1 text-emerald-500"><Receipt size={13} /></span>
                        )}
                        <button onClick={() => { setEditTarget(c); setShowModal(true); }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-orange-50 transition-colors">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => handleDelete(c.id)} disabled={deleting === c.id}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                          {deleting === c.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 border-t-2 border-slate-200">
                  <td colSpan={3} className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Total</td>
                  <td className="px-4 py-3 text-right font-heading font-bold text-slate-900">{fmt(totalActual)}</td>
                  <td className="px-4 py-3 text-center text-xs text-slate-500">{fmt(totalGst)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden flex flex-col gap-2">
            {costs.map((c) => (
              <div key={c.id} className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-slate-800 truncate">{c.description}</p>
                    {c.merchant && <p className="text-xs text-slate-400">{c.merchant}</p>}
                  </div>
                  <p className="font-heading font-bold text-slate-900 shrink-0">{fmt(c.amount)}</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${CATEGORY_COLOURS[c.category] ?? 'bg-slate-100 text-slate-600'}`}>
                    {c.category}
                  </span>
                  {c.purchase_date && <span className="text-xs text-slate-400">{fmtDate(c.purchase_date)}</span>}
                  {c.gst_included ? <span className="text-xs text-emerald-600 font-semibold">GST {fmt(c.gst_amount)}</span> : null}
                  {c.receipt_file_id && <span className="text-xs text-emerald-600 flex items-center gap-1"><Receipt size={11} />Receipt</span>}
                </div>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
                  <button onClick={() => { setEditTarget(c); setShowModal(true); }}
                    className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-primary transition-colors">
                    <Pencil size={12} />Edit
                  </button>
                  <button onClick={() => handleDelete(c.id)} disabled={deleting === c.id}
                    className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-red-600 transition-colors ml-auto">
                    {deleting === c.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <AnimatePresence>
        {showModal && (
          <CostModal
            jobId={jobId}
            editing={editTarget}
            onClose={() => { setShowModal(false); setEditTarget(null); }}
            onSaved={handleSaved}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
