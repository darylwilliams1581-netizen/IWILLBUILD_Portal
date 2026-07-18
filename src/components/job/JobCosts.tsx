import { useState, useEffect, useCallback, useRef } from 'react';
import {
  BookOpen, RefreshCw, Plus, Download, CheckCircle2, Clock,
  AlertCircle, Loader2, X, ChevronDown, Pencil, Trash2,
  Filter, FileSpreadsheet, FileText, BarChart3, Camera,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface LedgerEntry {
  id: number;
  company_id: number;
  job_id: number;
  job_number: string | null;
  job_title: string | null;
  entry_date: string;
  event_type: string;
  source_module: string;
  source_id: string | null;
  description: string;
  qty: string;
  unit: string | null;
  rate: string;
  subtotal: string;
  gst: string;
  total: string;
  gst_inclusive: number;
  account_code: string | null;
  tax_code: string | null;
  contact_name: string | null;
  contact_type: string | null;
  reference: string | null;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  created_by_name: string | null;
  created_at: string;
  photo_url: string | null;
}

interface Totals {
  subtotal: number;
  gst: number;
  total: number;
  byType: Record<string, { subtotal: number; gst: number; total: number; count: number }>;
}

interface Props {
  jobId: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const EVENT_TYPES = [
  'LABOUR', 'MATERIAL', 'PLANT', 'SUBCONTRACTOR', 'RECEIPT',
  'PURCHASE', 'VARIATION', 'INVOICE_LINE', 'CREDIT', 'ADJUSTMENT',
];

const EVENT_COLORS: Record<string, string> = {
  LABOUR:       'bg-blue-100 text-blue-800 border-blue-200',
  MATERIAL:     'bg-amber-100 text-amber-800 border-amber-200',
  PLANT:        'bg-purple-100 text-purple-800 border-purple-200',
  SUBCONTRACTOR:'bg-emerald-100 text-emerald-800 border-emerald-200',
  RECEIPT:      'bg-orange-100 text-orange-800 border-orange-200',
  PURCHASE:     'bg-red-100 text-red-800 border-red-200',
  VARIATION:    'bg-yellow-100 text-yellow-800 border-yellow-200',
  INVOICE_LINE: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  CREDIT:       'bg-teal-100 text-teal-800 border-teal-200',
  ADJUSTMENT:   'bg-slate-100 text-slate-700 border-slate-200',
};

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Manual',
  estimate_line: 'Estimate',
  invoice_line: 'Invoice',
  job_cost: 'Receipt',
  timesheet: 'Timesheet',
  purchase_order: 'PO',
};

const DEFAULT_ACCOUNT: Record<string, string> = {
  LABOUR: '4000', MATERIAL: '5000', PLANT: '5100', SUBCONTRACTOR: '5200',
  RECEIPT: '5000', PURCHASE: '5000', VARIATION: '4100', INVOICE_LINE: '4000',
  CREDIT: '4900', ADJUSTMENT: '9000',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number | string) {
  return (parseFloat(String(n)) || 0).toLocaleString('en-AU', {
    style: 'currency', currency: 'AUD', minimumFractionDigits: 2,
  });
}

function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return d; }
}

// ── Add Entry Modal ───────────────────────────────────────────────────────────

interface AddEntryModalProps {
  jobId: number;
  onClose: () => void;
  onCreated: (entry: LedgerEntry) => void;
  editEntry?: LedgerEntry | null;
}

function AddEntryModal({ jobId, onClose, onCreated, editEntry }: AddEntryModalProps) {
  const [form, setForm] = useState({
    entryDate: editEntry?.entry_date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    eventType: editEntry?.event_type ?? 'MATERIAL',
    description: editEntry?.description ?? '',
    qty: editEntry?.qty ?? '1',
    unit: editEntry?.unit ?? '',
    rate: editEntry?.rate ?? '0',
    accountCode: editEntry?.account_code ?? '',
    taxCode: editEntry?.tax_code ?? 'GST',
    contactName: editEntry?.contact_name ?? '',
    reference: editEntry?.reference ?? '',
    status: editEntry?.status ?? 'pending',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Photo state
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(editEntry?.photo_url ?? null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  function clearPhoto() {
    setPhotoFile(null);
    setPhotoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const subtotal = Math.round((parseFloat(form.qty) || 0) * (parseFloat(form.rate) || 0) * 100) / 100;
  const gst = Math.round(subtotal * 0.1 * 100) / 100;
  const total = subtotal + gst;

  function set(field: string, value: string) {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      // Auto-fill account code when event type changes
      if (field === 'eventType' && !editEntry) {
        next.accountCode = DEFAULT_ACCOUNT[value] ?? '5000';
      }
      return next;
    });
  }

  async function handleSave() {
    if (!form.description.trim()) { setError('Description is required'); return; }
    setSaving(true); setError('');
    try {
      const url = editEntry
        ? `/api/jobs/${jobId}/ledger/${editEntry.id}`
        : `/api/jobs/${jobId}/ledger`;
      const method = editEntry ? 'PUT' : 'POST';

      const payload = {
        entryDate: form.entryDate,
        eventType: form.eventType,
        description: form.description.trim(),
        qty: parseFloat(form.qty) || 1,
        unit: form.unit.trim() || null,
        rate: parseFloat(form.rate) || 0,
        accountCode: form.accountCode.trim() || null,
        taxCode: form.taxCode || 'GST',
        contactName: form.contactName.trim() || null,
        reference: form.reference.trim() || null,
        status: form.status,
      };

      let res: Response;
      if (photoFile) {
        const fd = new FormData();
        fd.append('photo', photoFile);
        Object.entries(payload).forEach(([k, v]) => {
          if (v != null) fd.append(k, String(v));
        });
        res = await fetch(url, { method, credentials: 'include', body: fd });
      } else {
        res = await fetch(url, {
          method, credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json() as { entry?: LedgerEntry; error?: string };
      if (!res.ok) { setError(data.error ?? 'Failed to save'); return; }
      onCreated(data.entry!);
    } catch {
      setError('Failed to save entry');
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-white';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border shrink-0">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <BookOpen size={14} className="text-primary" />
          </div>
          <p className="font-bold text-sm flex-1">{editEntry ? 'Edit Ledger Entry' : 'Add Ledger Entry'}</p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
              <AlertCircle size={12} />{error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Date *</label>
              <input type="date" value={form.entryDate} onChange={(e) => set('entryDate', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Event Type *</label>
              <select value={form.eventType} onChange={(e) => set('eventType', e.target.value)} className={inputCls}>
                {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Description *</label>
            <input type="text" value={form.description} onChange={(e) => set('description', e.target.value)}
              placeholder="e.g. Carpenter labour — framing" className={inputCls} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Qty</label>
              <input type="number" step="0.001" value={form.qty} onChange={(e) => set('qty', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Unit</label>
              <input type="text" value={form.unit} onChange={(e) => set('unit', e.target.value)} placeholder="hr, m², t…" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Rate ($)</label>
              <input type="number" step="0.01" value={form.rate} onChange={(e) => set('rate', e.target.value)} className={inputCls} />
            </div>
          </div>

          {/* Live total preview */}
          <div className="bg-muted/30 rounded-xl p-3 grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-xs text-muted-foreground">Subtotal</p>
              <p className="text-sm font-bold font-mono">{fmt(subtotal)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">GST (10%)</p>
              <p className="text-sm font-bold font-mono">{fmt(gst)}</p>
            </div>
            <div>
              <p className="text-xs text-primary">Total</p>
              <p className="text-sm font-bold font-mono text-primary">{fmt(total)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Account Code</label>
              <input type="text" value={form.accountCode} onChange={(e) => set('accountCode', e.target.value)}
                placeholder="e.g. 5000" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Tax Code</label>
              <select value={form.taxCode} onChange={(e) => set('taxCode', e.target.value)} className={inputCls}>
                <option value="GST">GST</option>
                <option value="FRE">FRE (GST Free)</option>
                <option value="N-T">N-T (Not Reportable)</option>
                <option value="CAP">CAP (Capital)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Contact / Supplier</label>
              <input type="text" value={form.contactName} onChange={(e) => set('contactName', e.target.value)}
                placeholder="Supplier or contractor name" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Reference</label>
              <input type="text" value={form.reference} onChange={(e) => set('reference', e.target.value)}
                placeholder="Invoice #, docket #…" className={inputCls} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Status</label>
            <select value={form.status} onChange={(e) => set('status', e.target.value)} className={inputCls}>
              <option value="pending">Pending (awaiting approval)</option>
              <option value="approved">Approved</option>
            </select>
          </div>

          {/* Photo attachment */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Receipt / Invoice Photo</label>
            {photoPreview ? (
              <div className="relative rounded-xl overflow-hidden border border-border">
                <img src={photoPreview} alt="Receipt preview" className="w-full max-h-48 object-contain bg-muted/30" />
                <button
                  type="button"
                  onClick={clearPhoto}
                  className="absolute top-2 right-2 w-7 h-7 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center transition-colors"
                >
                  <X size={12} className="text-white" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-border hover:border-primary/50 rounded-xl py-5 flex flex-col items-center gap-2 text-muted-foreground hover:text-primary transition-colors"
              >
                <Camera size={20} />
                <span className="text-xs font-medium">Tap to attach photo or file</span>
                <span className="text-[10px] opacity-60">JPG, PNG, PDF up to 10 MB</span>
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              capture="environment"
              className="hidden"
              onChange={handlePhotoChange}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-border bg-muted/20 shrink-0">
          <button onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground px-4 py-2 rounded-xl">Cancel</button>
          <button onClick={() => void handleSave()} disabled={saving}
            className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-bold px-5 py-2.5 rounded-xl disabled:opacity-50">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <BookOpen size={13} />}
            {editEntry ? 'Save Changes' : 'Add Entry'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function JobCosts({ jobId }: Props) {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [syncMsg, setSyncMsg] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved'>('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const [editEntry, setEditEntry] = useState<LedgerEntry | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [approving, setApproving] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ status: statusFilter });
      if (typeFilter !== 'all') params.set('event_type', typeFilter);
      const res = await fetch(`/api/jobs/${jobId}/ledger?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error();
      const data = await res.json() as { entries: LedgerEntry[]; totals: Totals };
      setEntries(data.entries ?? []);
      setTotals(data.totals ?? null);
    } catch {
      setError('Failed to load ledger');
    } finally {
      setLoading(false);
    }
  }, [jobId, statusFilter, typeFilter]);

  useEffect(() => { void load(); }, [load]);

  async function handleSync() {
    setSyncing(true); setError(''); setSyncMsg('');
    try {
      const res = await fetch(`/api/jobs/${jobId}/ledger/sync`, { method: 'POST', credentials: 'include' });
      const data = await res.json() as { inserted?: number; message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Sync failed');
      setSyncMsg(data.message ?? `${data.inserted ?? 0} entries imported`);
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  async function handleApprove(entry: LedgerEntry) {
    setApproving(entry.id);
    try {
      const res = await fetch(`/api/jobs/${jobId}/ledger/${entry.id}`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json() as { entry: LedgerEntry };
      setEntries((prev) => prev.map((e) => e.id === entry.id ? data.entry : e));
    } catch {
      setError('Failed to approve entry');
    } finally {
      setApproving(null);
    }
  }

  async function handleDelete(entry: LedgerEntry) {
    if (!confirm(`Delete this ledger entry? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/jobs/${jobId}/ledger/${entry.id}`, {
        method: 'DELETE', credentials: 'include',
      });
      if (!res.ok) throw new Error();
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
      void load(); // refresh totals
    } catch {
      setError('Failed to delete entry');
    }
  }

  function exportUrl(format: string) {
    const status = statusFilter === 'all' ? 'all' : statusFilter;
    return `/api/jobs/${jobId}/ledger/export?format=${format}&status=${status}`;
  }

  const pendingCount = entries.filter((e) => e.status === 'pending').length;
  const approvedCount = entries.filter((e) => e.status === 'approved').length;

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-border p-8 flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Header ── */}
      <div className="bg-white rounded-xl border border-border p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h2 className="font-heading font-bold text-base text-foreground flex items-center gap-2">
              <BookOpen size={16} className="text-primary" />
              Job Cost Ledger
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Single source of truth for all job financial events — feeds Xero, MYOB, and reporting.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => void handleSync()}
              disabled={syncing}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs font-semibold hover:bg-muted disabled:opacity-40 transition-colors"
            >
              <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Importing…' : 'Import from Estimates / Invoices'}
            </button>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:bg-primary/90 transition-colors"
            >
              <Plus size={12} />Add Entry
            </button>
          </div>
        </div>

        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-2 mb-3">
            <AlertCircle size={12} />{error}
          </p>
        )}
        {syncMsg && (
          <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-3">{syncMsg}</p>
        )}

        {/* Summary cards */}
        {totals && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl bg-muted/40 p-3 text-center">
              <p className="text-xs text-muted-foreground mb-0.5">Total Entries</p>
              <p className="font-heading font-bold text-lg text-foreground">{entries.length}</p>
            </div>
            <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 text-center">
              <p className="text-xs text-amber-700 mb-0.5">Subtotal (ex GST)</p>
              <p className="font-heading font-bold text-sm text-amber-800">{fmt(totals.subtotal)}</p>
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-center">
              <p className="text-xs text-slate-600 mb-0.5">GST</p>
              <p className="font-heading font-bold text-sm text-slate-700">{fmt(totals.gst)}</p>
            </div>
            <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 text-center">
              <p className="text-xs text-primary mb-0.5">Total (inc GST)</p>
              <p className="font-heading font-bold text-sm text-primary">{fmt(totals.total)}</p>
            </div>
          </div>
        )}

        {/* By-type breakdown */}
        {totals && Object.keys(totals.byType).length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {Object.entries(totals.byType).map(([type, t]) => (
              <div key={type} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold ${EVENT_COLORS[type] ?? 'bg-muted text-muted-foreground border-border'}`}>
                <span>{type}</span>
                <span className="opacity-70">·</span>
                <span>{t.count}</span>
                <span className="opacity-70">·</span>
                <span className="font-mono">{fmt(t.total)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Ledger table ── */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        {/* Toolbar */}
        <div className="px-4 py-3 border-b border-border bg-muted/20 flex items-center gap-2 flex-wrap">
          {/* Status filter */}
          <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
            {(['all', 'pending', 'approved'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                  statusFilter === s ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {s === 'all' ? 'All' : s === 'pending' ? `Pending${pendingCount > 0 ? ` (${pendingCount})` : ''}` : `Approved${approvedCount > 0 ? ` (${approvedCount})` : ''}`}
              </button>
            ))}
          </div>

          {/* Event type filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
          >
            <option value="all">All types</option>
            {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>

          <div className="flex-1" />

          {/* Export dropdown */}
          <div className="relative">
            <button
              onClick={() => setExportOpen((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs font-semibold hover:bg-muted transition-colors"
            >
              <Download size={12} />Export <ChevronDown size={10} />
            </button>
            {exportOpen && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-border rounded-xl shadow-lg overflow-hidden z-10 min-w-[200px]">
                <a href={exportUrl('standard')} download className="flex items-center gap-2 px-3 py-2.5 text-xs hover:bg-muted transition-colors">
                  <FileText size={12} className="text-primary" />
                  <div>
                    <p className="font-semibold">IWILLBUILD Standard</p>
                    <p className="text-muted-foreground">Full ledger CSV</p>
                  </div>
                </a>
                <a href={exportUrl('myob')} download className="flex items-center gap-2 px-3 py-2.5 text-xs hover:bg-muted transition-colors border-t border-border">
                  <FileSpreadsheet size={12} className="text-emerald-600" />
                  <div>
                    <p className="font-semibold">MYOB Import</p>
                    <p className="text-muted-foreground">Spend Money format</p>
                  </div>
                </a>
                <a href={exportUrl('xero')} download className="flex items-center gap-2 px-3 py-2.5 text-xs hover:bg-muted transition-colors border-t border-border">
                  <FileSpreadsheet size={12} className="text-blue-600" />
                  <div>
                    <p className="font-semibold">Xero Import</p>
                    <p className="text-muted-foreground">Bills / Purchases CSV</p>
                  </div>
                </a>
                <a href={exportUrl('excel')} download className="flex items-center gap-2 px-3 py-2.5 text-xs hover:bg-muted transition-colors border-t border-border">
                  <BarChart3 size={12} className="text-green-600" />
                  <div>
                    <p className="font-semibold">Excel / Power BI</p>
                    <p className="text-muted-foreground">Tab-separated (UTF-8)</p>
                  </div>
                </a>
              </div>
            )}
          </div>
        </div>

        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center px-4">
            <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-3">
              <BookOpen size={20} className="text-muted-foreground" />
            </div>
            <p className="text-sm font-semibold text-foreground mb-1">No ledger entries yet</p>
            <p className="text-xs text-muted-foreground max-w-sm mb-4">
              Click "Import from Estimates / Invoices" to pull in existing data, or "Add Entry" to create a manual entry.
            </p>
            <div className="flex gap-2">
              <button onClick={() => void handleSync()} disabled={syncing}
                className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg text-xs font-semibold hover:bg-muted transition-colors">
                <RefreshCw size={11} className={syncing ? 'animate-spin' : ''} />Import
              </button>
              <button onClick={() => setShowAdd(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:bg-primary/90 transition-colors">
                <Plus size={11} />Add Entry
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-3 py-3 font-semibold text-muted-foreground whitespace-nowrap">Date</th>
                  <th className="text-left px-3 py-3 font-semibold text-muted-foreground">Type</th>
                  <th className="text-left px-3 py-3 font-semibold text-muted-foreground">Description</th>
                  <th className="text-center px-2 py-3 font-semibold text-muted-foreground whitespace-nowrap">Qty / Unit</th>
                  <th className="text-right px-2 py-3 font-semibold text-muted-foreground">Rate</th>
                  <th className="text-right px-2 py-3 font-semibold text-muted-foreground">Subtotal</th>
                  <th className="text-right px-2 py-3 font-semibold text-muted-foreground">GST</th>
                  <th className="text-right px-3 py-3 font-semibold text-muted-foreground">Total</th>
                  <th className="text-left px-2 py-3 font-semibold text-muted-foreground">Acct</th>
                  <th className="text-left px-2 py-3 font-semibold text-muted-foreground">Contact</th>
                  <th className="text-left px-2 py-3 font-semibold text-muted-foreground">Ref</th>
                  <th className="text-left px-2 py-3 font-semibold text-muted-foreground">Source</th>
                  <th className="text-center px-2 py-3 font-semibold text-muted-foreground">Status</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entries.map((entry) => (
                  <tr key={entry.id} className={`hover:bg-muted/10 transition-colors ${entry.status === 'pending' ? 'bg-amber-50/30' : ''}`}>
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{fmtDate(entry.entry_date)}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-bold ${EVENT_COLORS[entry.event_type] ?? 'bg-muted text-muted-foreground border-border'}`}>
                        {entry.event_type}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-foreground max-w-[200px]">
                      <div className="flex items-center gap-2">
                        {entry.photo_url && (
                          <a
                            href={entry.photo_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="View receipt"
                            className="shrink-0"
                          >
                            <img
                              src={entry.photo_url}
                              alt="Receipt"
                              className="w-8 h-8 rounded-lg object-cover border border-border hover:opacity-80 transition-opacity"
                            />
                          </a>
                        )}
                        <p className="truncate">{entry.description}</p>
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-center text-muted-foreground whitespace-nowrap">
                      {entry.qty}{entry.unit ? ` ${entry.unit}` : ''}
                    </td>
                    <td className="px-2 py-2.5 text-right font-mono text-muted-foreground">{fmt(entry.rate)}</td>
                    <td className="px-2 py-2.5 text-right font-mono text-foreground">{fmt(entry.subtotal)}</td>
                    <td className="px-2 py-2.5 text-right font-mono text-muted-foreground">{fmt(entry.gst)}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold text-foreground">{fmt(entry.total)}</td>
                    <td className="px-2 py-2.5 text-muted-foreground font-mono">{entry.account_code ?? '—'}</td>
                    <td className="px-2 py-2.5 text-muted-foreground max-w-[100px]">
                      <p className="truncate">{entry.contact_name ?? '—'}</p>
                    </td>
                    <td className="px-2 py-2.5 text-muted-foreground max-w-[80px]">
                      <p className="truncate">{entry.reference ?? '—'}</p>
                    </td>
                    <td className="px-2 py-2.5">
                      <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        {SOURCE_LABELS[entry.source_module] ?? entry.source_module}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-center">
                      {entry.status === 'approved' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                          <CheckCircle2 size={9} />Approved
                        </span>
                      ) : (
                        <button
                          onClick={() => void handleApprove(entry)}
                          disabled={approving === entry.id}
                          className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full hover:bg-amber-100 transition-colors disabled:opacity-50"
                        >
                          {approving === entry.id ? <Loader2 size={9} className="animate-spin" /> : <Clock size={9} />}
                          Pending
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1">
                        <button onClick={() => setEditEntry(entry)} className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted transition-colors">
                          <Pencil size={11} />
                        </button>
                        <button onClick={() => void handleDelete(entry)} className="text-muted-foreground hover:text-red-600 p-1 rounded hover:bg-red-50 transition-colors">
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer totals row */}
        {entries.length > 0 && totals && (
          <div className="border-t border-border px-4 py-3 bg-muted/20 flex items-center justify-end gap-6 text-xs flex-wrap">
            <span className="text-muted-foreground">{entries.length} entries</span>
            <span className="text-muted-foreground">Subtotal: <strong className="text-foreground font-mono">{fmt(totals.subtotal)}</strong></span>
            <span className="text-muted-foreground">GST: <strong className="text-foreground font-mono">{fmt(totals.gst)}</strong></span>
            <span className="text-primary font-bold">Total: <span className="font-mono">{fmt(totals.total)}</span></span>
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {(showAdd || editEntry) && (
        <AddEntryModal
          jobId={jobId}
          editEntry={editEntry}
          onClose={() => { setShowAdd(false); setEditEntry(null); }}
          onCreated={(entry) => {
            if (editEntry) {
              setEntries((prev) => prev.map((e) => e.id === entry.id ? entry : e));
            } else {
              setEntries((prev) => [entry, ...prev]);
            }
            setShowAdd(false);
            setEditEntry(null);
            void load(); // refresh totals
          }}
        />
      )}
    </div>
  );
}
