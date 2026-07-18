import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePermissions } from '@/lib/usePermissions';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  ChevronLeft, Plus, Trash2, ArrowUp, ArrowDown, Copy, Loader2,
  AlertCircle, Lock, FileText, Printer, Check, ChevronDown,
  Upload, Download, Share2, Calculator, BookOpen,
} from 'lucide-react';
import ShareLinkModal from '@/components/ShareLinkModal';
import JobContextTab from '@/components/JobContextTab';
import OutlookEmailButton from '@/components/OutlookEmailButton';
import {
  fetchEstimate, updateEstimate, createEstimate, getEstimateStatusStyle,
  estimateTotals, lineCalc, ESTIMATE_STATUSES, GST_MODES,
  type Estimate, type EstimateLine,
} from '@/lib/estimates-api';
import { fetchJob, type Job } from '@/lib/jobs-api';
import CsvImportModal from '@/components/CsvImportModal';
import { LIMITS } from '@/lib/limits';
import EstimatePrintModal, { type LocalLine } from '@/components/estimate/EstimatePrintModal';
import { CostGuidePicker, RecipePicker, type CostItem, type Recipe } from '@/components/estimate/EstimatePickerModals';

// ── Local helpers ─────────────────────────────────────────────────────────────
let _keyCounter = 0;
function newKey() { return `line-${++_keyCounter}`; }
function blankLine(order: number): LocalLine {
  return { _key: newKey(), category: '', description: '', quantity: '1', unit: '', rate: '0', lineOrder: order };
}
function fromApiLine(l: EstimateLine): LocalLine {
  return { _key: newKey(), id: l.id, category: (l as EstimateLine & { category?: string }).category ?? '', description: l.description, quantity: l.quantity, unit: l.unit ?? '', rate: l.rate, lineOrder: l.lineOrder };
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
  const [showShare, setShowShare] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [showCostPicker, setShowCostPicker] = useState(false);
  const [showRecipePicker, setShowRecipePicker] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [estimateCategories, setEstimateCategories] = useState<string[]>([]);
  // Refs for save-on-back — always hold latest values without stale closures
  const estimateRef = useRef<Estimate | null>(null);
  const linesRef = useRef<LocalLine[]>([]);

  useEffect(() => {
    if (id) load(parseInt(id, 10));
  }, [id]);

  // Load estimate categories from company structure settings
  useEffect(() => {
    fetch('/api/company-settings', { credentials: 'include' })
      .then((r) => r.json() as Promise<{ structure?: { estimateCategories?: string[] } }>)
      .then((d) => {
        const cats = d.structure?.estimateCategories;
        if (Array.isArray(cats) && cats.length > 0) setEstimateCategories(cats);
      })
      .catch(() => { /* non-critical */ });
  }, []);

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
          category: l.category || undefined,
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
      navigate(`/jobs/${est.jobId}/quotes`);
    } else {
      navigate('/home');
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

  async function handleExportPdf() {
    if (!estimate) return;
    setExportingPdf(true);
    try {
      const res = await fetch(`/api/estimates/${estimate.id}/export-pdf`, { credentials: 'include' });
      if (!res.ok) { alert('PDF export failed'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeName = (estimate.title ?? 'estimate').replace(/[^a-z0-9]/gi, '-').toLowerCase();
      a.download = `estimate-${safeName}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportingPdf(false);
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

  const totals = estimate ? estimateTotals(lines, estimate.markupPercent, estimate.gstMode) : null;
  const statusStyle = estimate ? getEstimateStatusStyle(estimate.status) : null;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Helmet>
        <title>{estimate ? `${estimate.title} — Estimate — IWILLBUILD` : 'Estimate — IWILLBUILD'}</title>
        <meta name="description" content={estimate ? `Estimate: ${estimate.title}` : 'Estimate editor — IWILLBUILD Portal'} />
        <link rel="canonical" href={`https://iwillbuild.com/estimates/${id}`} />
        <meta name="robots" content="noindex" />
      </Helmet>

        {/* Top bar */}
        <header className="bg-white border-b border-gray-100 flex items-center justify-between px-4 md:px-6 shrink-0 gap-3 h-16" style={{ boxShadow: '0 1px 0 rgba(0,0,0,0.05)' }}>
          <div className="flex items-center gap-3 min-w-0">
            {/* Back button — saves if dirty before navigating */}
            <button
              onClick={() => void handleBack()}
              className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors shrink-0"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="min-w-0">
              <p className="text-gray-400 text-xs font-medium truncate leading-tight">
                {job ? (job.jobNumber ?? job.name) : 'Estimate'}
              </p>
              <p className="font-bold text-gray-900 text-sm truncate leading-tight">
                {estimate?.title ?? 'Loading…'}
                {dirty && !saving && <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 ml-1.5 mb-0.5" title="Unsaved changes" />}
              </p>
            </div>
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

            {/* Send via Outlook */}
            {estimate && (
              <OutlookEmailButton
                context={{
                  kind: 'estimate',
                  estimateNumber: estimate.estimateNumber ?? `#${estimate.id}`,
                  jobName: job?.name,
                  customerName: estimate.customerName ?? undefined,
                  totalAmount: (() => { const t = estimateTotals(lines, estimate.markupPercent ?? '0', estimate.gstMode ?? 'No GST'); return t.total.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' }); })(),
                  status: estimate.status,
                  link: `${typeof window !== 'undefined' ? window.location.origin : 'https://iwillbuild.com'}/view/estimate/${estimate.id}`,
                }}
                size="sm"
                showCopy
              />
            )}

            {/* Export PDF */}
            <button
              onClick={handleExportPdf}
              disabled={exportingPdf || !estimate}
              className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5 hover:bg-muted transition-colors disabled:opacity-50"
              title="Download PDF"
            >
              {exportingPdf ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              <span className="hidden sm:inline">PDF</span>
            </button>

            {/* Share link */}
            <button
              onClick={() => setShowShare(true)}
              disabled={!estimate}
              className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5 hover:bg-muted transition-colors disabled:opacity-50"
              title="Share link"
            >
              <Share2 size={14} />
              <span className="hidden sm:inline">Share</span>
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
        <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 sm:pb-6">
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
                        <th className="text-left px-4 py-2.5 w-[42%]">Description</th>
                        <th className="text-left px-2 py-2.5 w-[13%]">Category</th>
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
                          {/* Category dropdown */}
                          <td className="px-2 py-2">
                            {estimateCategories.length > 0 ? (
                              <select
                                value={line.category ?? ''}
                                disabled={isLocked}
                                onChange={(e) => updateLine(line._key, 'category', e.target.value)}
                                className="w-full px-1.5 py-1.5 border border-transparent rounded text-xs focus:outline-none focus:border-primary/40 focus:bg-orange-50/30 transition-colors bg-transparent disabled:cursor-default text-slate-500"
                              >
                                <option value="">— none —</option>
                                {estimateCategories.map((c) => (
                                  <option key={c} value={c}>{c}</option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type="text"
                                value={line.category ?? ''}
                                disabled={isLocked}
                                onChange={(e) => updateLine(line._key, 'category', e.target.value)}
                                placeholder="Category"
                                className="w-full px-1.5 py-1.5 border border-transparent rounded text-xs focus:outline-none focus:border-primary/40 focus:bg-orange-50/30 transition-colors disabled:bg-transparent disabled:cursor-default text-slate-500"
                              />
                            )}
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
                      {/* Category — mobile */}
                      {estimateCategories.length > 0 && (
                        <div>
                          <label className="text-xs text-muted-foreground">Category</label>
                          <select
                            value={line.category ?? ''}
                            disabled={isLocked}
                            onChange={(e) => updateLine(line._key, 'category', e.target.value)}
                            className="w-full px-2 py-1.5 border border-border rounded text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:bg-muted"
                          >
                            <option value="">— none —</option>
                            {estimateCategories.map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        </div>
                      )}
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
        {/* ── Mobile sticky bottom save bar ── */}
        {estimate && !isLocked && (
          <div className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-border px-4 py-3 flex items-center gap-3 z-30 safe-bottom">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground truncate">{estimate.title}</p>
              {dirty && <p className="text-xs text-amber-600 font-semibold">Unsaved changes</p>}
              {!dirty && saved && <p className="text-xs text-emerald-600 font-semibold">Saved</p>}
            </div>
            <button
              onClick={() => setShowPrint(true)}
              className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Printer size={16} />
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className={`flex items-center gap-2 text-sm font-bold px-4 py-2 rounded-lg transition-colors disabled:opacity-60 ${
                dirty ? 'bg-primary hover:bg-orange-600 text-white' : 'bg-muted text-muted-foreground'
              }`}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {dirty ? 'Save' : 'Saved'}
            </button>
          </div>
        )}

      {showPrint && estimate && (
        <EstimatePrintModal estimate={estimate} lines={lines} job={job} onClose={() => setShowPrint(false)} />
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
      {showShare && estimate && (
        <ShareLinkModal
          open={showShare}
          onClose={() => setShowShare(false)}
          targetType="estimate"
          targetId={String(estimate.id)}
          title={estimate.title ?? `Estimate #${estimate.id}`}
        />
      )}
      <JobContextTab />
    </div>
  );
}