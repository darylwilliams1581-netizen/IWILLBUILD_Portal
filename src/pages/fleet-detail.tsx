import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  Truck,
  ChevronLeft,
  Edit2,
  Check,
  X,
  Loader2,
  AlertCircle,
  ClipboardList,
  Calendar as _Calendar,
  Wrench as _Wrench,
  Archive,
  Menu,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Plus,
  Clock,
  FolderOpen,
} from 'lucide-react';
import PortalSidebar from '@/components/PortalSidebar';
import FilePanel from '@/components/FilePanel';
import {
  fetchAsset,
  updateAsset,
  fetchPrestarts,
  submitPrestart,
  ASSET_TYPES,
  ASSET_STATUSES,
  getAssetStatusStyle,
  type FleetAsset,
  type FleetPrestart,
  type CreateAssetPayload,
} from '@/lib/fleet-api';

type Tab = 'details' | 'prestarts' | 'files';

// ── Prestart Modal ────────────────────────────────────────────────────────────
interface PrestartModalProps {
  asset: FleetAsset;
  onClose: () => void;
  onSaved: (p: FleetPrestart) => void;
}

function PrestartModal({ asset, onClose, onSaved }: PrestartModalProps) {
  const [form, setForm] = useState({
    kmHours: '',
    safeToOperate: true,
    issueNeedsAttention: false,
    issueComment: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.issueNeedsAttention && !form.issueComment.trim()) {
      setError('Please describe the issue that needs attention');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const prestart = await submitPrestart(asset.id, {
        kmHours: form.kmHours.trim() || undefined,
        safeToOperate: form.safeToOperate,
        issueNeedsAttention: form.issueNeedsAttention,
        issueComment: form.issueNeedsAttention ? form.issueComment.trim() : undefined,
        notes: form.notes.trim() || undefined,
      });
      onSaved(prestart);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save prestart');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.15 }}
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-border">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-heading font-bold text-base">Daily Prestart</h2>
            <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
              <X size={18} />
            </button>
          </div>
          <p className="text-xs text-muted-foreground">{asset.name}</p>
          <p className="text-xs text-primary font-semibold mt-0.5">{dateStr} · {timeStr}</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-5">
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-700">
              <AlertCircle size={14} className="shrink-0" />
              {error}
            </div>
          )}

          {/* KM / Hours */}
          <div>
            <label className="block text-xs font-semibold mb-1.5">KM / Hours Reading</label>
            <input
              type="text"
              value={form.kmHours}
              onChange={(e) => setForm((f) => ({ ...f, kmHours: e.target.value }))}
              placeholder="e.g. 87,420 km or 2,340 hrs"
              className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
            />
          </div>

          {/* Safe to operate */}
          <div>
            <p className="text-xs font-semibold mb-2">Safe to operate? <span className="text-red-500">*</span></p>
            <div className="flex gap-3">
              {[true, false].map((val) => (
                <button
                  key={String(val)}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, safeToOperate: val }))}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 text-sm font-bold transition-colors ${
                    form.safeToOperate === val
                      ? val
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                        : 'border-red-500 bg-red-50 text-red-700'
                      : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                  }`}
                >
                  {val ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
                  {val ? 'Yes' : 'No'}
                </button>
              ))}
            </div>
          </div>

          {/* Issue needs attention */}
          <div>
            <p className="text-xs font-semibold mb-2">Any issue needs attention? <span className="text-red-500">*</span></p>
            <div className="flex gap-3">
              {[false, true].map((val) => (
                <button
                  key={String(val)}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, issueNeedsAttention: val }))}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 text-sm font-bold transition-colors ${
                    form.issueNeedsAttention === val
                      ? val
                        ? 'border-amber-500 bg-amber-50 text-amber-700'
                        : 'border-emerald-500 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                  }`}
                >
                  {val ? <AlertTriangle size={15} /> : <Check size={15} />}
                  {val ? 'Yes' : 'No'}
                </button>
              ))}
            </div>
          </div>

          {/* Issue comment — shown only if issue = yes */}
          <AnimatePresence>
            {form.issueNeedsAttention && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.15 }}
              >
                <label className="block text-xs font-semibold mb-1.5 text-amber-700">
                  Describe the issue <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={form.issueComment}
                  onChange={(e) => setForm((f) => ({ ...f, issueComment: e.target.value }))}
                  rows={3}
                  placeholder="Describe what needs attention…"
                  className="w-full px-3 py-2.5 border border-amber-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 transition-colors resize-none bg-amber-50"
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold mb-1.5">Notes (optional)</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              placeholder="Any other observations…"
              className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors resize-none"
            />
          </div>

          <div className="flex gap-3 justify-end pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 bg-primary hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-bold px-5 py-2 rounded-lg transition-colors"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {saving ? 'Saving…' : 'Submit Prestart'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ── Edit Asset Modal ──────────────────────────────────────────────────────────
interface EditAssetModalProps {
  asset: FleetAsset;
  onClose: () => void;
  onSaved: (a: FleetAsset) => void;
}

function EditAssetModal({ asset, onClose, onSaved }: EditAssetModalProps) {
  const [form, setForm] = useState<CreateAssetPayload & { archived: boolean }>({
    name: asset.name,
    assetNumber: asset.assetNumber ?? '',
    type: asset.type,
    makeModel: asset.makeModel ?? '',
    rego: asset.rego ?? '',
    regoNotApplicable: asset.regoNotApplicable,
    serviceDate: asset.serviceDate ? asset.serviceDate.slice(0, 10) : '',
    regoExpiry: asset.regoExpiry ? asset.regoExpiry.slice(0, 10) : '',
    status: asset.status,
    notes: asset.notes ?? '',
    archived: asset.archived,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof typeof form, v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError('Asset name is required'); return; }
    setSaving(true);
    setError('');
    try {
      const updated = await updateAsset(asset.id, form);
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update asset');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.15 }}
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-heading font-bold text-base">Edit Asset</h2>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-700">
              <AlertCircle size={14} className="shrink-0" />
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold mb-1.5">Asset Name <span className="text-red-500">*</span></label>
              <input type="text" value={form.name} onChange={(e) => set('name', e.target.value)}
                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5">Asset / Rego Number</label>
              <input type="text" value={form.assetNumber} onChange={(e) => set('assetNumber', e.target.value)}
                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5">Type</label>
              <select value={form.type} onChange={(e) => set('type', e.target.value)}
                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors bg-white">
                {ASSET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold mb-1.5">Make / Model</label>
              <input type="text" value={form.makeModel} onChange={(e) => set('makeModel', e.target.value)}
                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5">Rego Plate</label>
              <input type="text" value={form.rego} onChange={(e) => set('rego', e.target.value)}
                disabled={form.regoNotApplicable}
                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors disabled:opacity-40 disabled:bg-slate-50" />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={form.regoNotApplicable} onChange={(e) => set('regoNotApplicable', e.target.checked)}
                  className="w-4 h-4 accent-primary" />
                <span className="text-xs font-semibold text-slate-600">Rego not applicable</span>
              </label>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5">Service Due Date</label>
              <input type="date" value={form.serviceDate} onChange={(e) => set('serviceDate', e.target.value)}
                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5">Rego Expiry Date</label>
              <input type="date" value={form.regoExpiry} onChange={(e) => set('regoExpiry', e.target.value)}
                disabled={form.regoNotApplicable}
                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors disabled:opacity-40 disabled:bg-slate-50" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5">Status</label>
              <select value={form.status} onChange={(e) => set('status', e.target.value)}
                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors bg-white">
                {ASSET_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={form.archived} onChange={(e) => set('archived', e.target.checked)}
                  className="w-4 h-4 accent-primary" />
                <span className="text-xs font-semibold text-slate-600">Archive this asset</span>
              </label>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold mb-1.5">Notes</label>
              <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3}
                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors resize-none" />
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 bg-primary hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-bold px-5 py-2 rounded-lg transition-colors">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ── Detail row helper ─────────────────────────────────────────────────────────
function DetailRow({ label, value, mono = false }: { label: string; value: string | null | undefined; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2 border-b border-slate-50 last:border-0">
      <span className="text-xs font-semibold text-muted-foreground w-32 shrink-0 pt-0.5">{label}</span>
      <span className={`text-sm text-foreground flex-1 ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function FleetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [asset, setAsset] = useState<FleetAsset | null>(null);
  const [prestarts, setPrestarts] = useState<FleetPrestart[]>([]);
  const [loading, setLoading] = useState(true);
  const [prestartLoading, setPrestartLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('details');
  const [showPrestartModal, setShowPrestartModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  function openMobileMenu() {
    window.dispatchEvent(new Event('portal:open-menu'));
  }

  const loadAsset = useCallback(async () => {
    if (!id) return;
    try {
      const a = await fetchAsset(parseInt(id, 10));
      setAsset(a);
    } catch {
      setError('Asset not found');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadPrestarts = useCallback(async () => {
    if (!id) return;
    setPrestartLoading(true);
    try {
      const data = await fetchPrestarts(parseInt(id, 10));
      setPrestarts(data);
    } catch {
      // silently fail
    } finally {
      setPrestartLoading(false);
    }
  }, [id]);

  useEffect(() => { void loadAsset(); }, [loadAsset]);

  useEffect(() => {
    if (activeTab === 'prestarts') void loadPrestarts();
  }, [activeTab, loadPrestarts]);

  if (!loading && !asset && !error) return null;

  const statusStyle = asset ? getAssetStatusStyle(asset.status) : null;

  return (
    <div className="portal-page">
      <Helmet>
        <title>{asset ? `${asset.name} — Fleet` : 'Fleet Asset'} — IWILLBUILD Portal</title>
        <meta name="description" content="View asset details, daily prestarts, service dates and rego for this fleet asset." />
        <link rel="canonical" href={`https://iwillbuild.com/fleet/${id ?? ''}`} />
        <meta name="robots" content="noindex" />
      </Helmet>

      <PortalSidebar />

      <div className="portal-main">
        {/* Top bar */}
        <header className="h-16 bg-white border-b border-border flex items-center justify-between px-4 md:px-6 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={openMobileMenu}
              className="md:hidden p-2 -ml-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>
            <Link to="/fleet" className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors shrink-0">
              <ChevronLeft size={16} />
              <span className="text-sm font-semibold hidden sm:inline">Fleet</span>
            </Link>
            <span className="text-slate-300 hidden sm:inline">/</span>
            <div className="flex items-center gap-2 min-w-0">
              <Truck size={16} className="text-primary shrink-0" />
              <h1 className="font-heading font-bold text-base truncate">
                {asset?.name ?? 'Asset'}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {asset && (
              <>
                <button
                  onClick={() => setShowPrestartModal(true)}
                  className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-bold px-3 py-2 rounded-lg transition-colors"
                >
                  <ClipboardList size={14} />
                  <span className="hidden sm:inline">Start Prestart</span>
                </button>
                <button
                  onClick={() => setShowEditModal(true)}
                  className="flex items-center gap-2 border border-border hover:bg-muted text-sm font-semibold px-3 py-2 rounded-lg transition-colors"
                >
                  <Edit2 size={14} />
                  <span className="hidden sm:inline">Edit</span>
                </button>
              </>
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
              <button onClick={() => navigate('/fleet')} className="ml-auto font-semibold underline">Back to Fleet</button>
            </div>
          )}

          {asset && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' as const }}
              className="max-w-2xl flex flex-col gap-4"
            >
              {/* Status bar */}
              <div className="bg-white rounded-xl border border-border p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 flex-wrap">
                  {statusStyle && (
                    <span className={`inline-flex items-center gap-1.5 text-sm font-bold px-3 py-1 rounded-full border ${statusStyle.bg} ${statusStyle.color}`}>
                      <span className={`w-2 h-2 rounded-full ${statusStyle.dot}`} />
                      {asset.status}
                    </span>
                  )}
                  <span className="text-xs bg-slate-100 text-slate-500 font-semibold px-2 py-0.5 rounded-full">
                    {asset.type}
                  </span>
                  {asset.archived && (
                    <span className="flex items-center gap-1 text-xs bg-slate-100 text-slate-500 font-bold px-2 py-0.5 rounded-full">
                      <Archive size={10} /> Archived
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  Updated {new Date(asset.updatedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 bg-white rounded-xl border border-border p-1">
                {([
                  { key: 'details',   label: 'Details',   icon: Truck },
                  { key: 'prestarts', label: 'Prestarts', icon: ClipboardList },
                  { key: 'files',     label: 'Files',     icon: FolderOpen },
                ] as const).map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    onClick={() => setActiveTab(key)}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-semibold transition-colors ${
                      activeTab === key
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Icon size={14} />
                    {label}
                  </button>
                ))}
              </div>

              {/* ── Details tab ── */}
              {activeTab === 'details' && (
                <div className="bg-white rounded-xl border border-border p-5 flex flex-col gap-1">
                  <h2 className="font-heading font-bold text-sm text-muted-foreground uppercase tracking-wider mb-3">Asset Details</h2>
                  <DetailRow label="Asset Name"    value={asset.name} />
                  <DetailRow label="Asset Number"  value={asset.assetNumber} mono />
                  <DetailRow label="Type"          value={asset.type} />
                  <DetailRow label="Make / Model"  value={asset.makeModel} />
                  <DetailRow label="Rego Plate"    value={asset.regoNotApplicable ? 'Not applicable' : asset.rego} />
                  <DetailRow
                    label="Service Due"
                    value={asset.serviceDate
                      ? new Date(asset.serviceDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
                      : null}
                  />
                  <DetailRow
                    label="Rego Expiry"
                    value={asset.regoNotApplicable
                      ? 'Not applicable'
                      : asset.regoExpiry
                        ? new Date(asset.regoExpiry).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
                        : null}
                  />
                  <DetailRow
                    label="Added"
                    value={new Date(asset.createdAt).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  />
                  {asset.notes && (
                    <div className="pt-3 border-t border-slate-50 mt-1">
                      <p className="text-xs font-semibold text-muted-foreground mb-1.5">Notes</p>
                      <p className="text-sm text-foreground whitespace-pre-wrap">{asset.notes}</p>
                    </div>
                  )}
                </div>
              )}

              {/* ── Prestarts tab ── */}
              {activeTab === 'prestarts' && (
                <div className="bg-white rounded-xl border border-border overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                    <h2 className="font-heading font-bold text-sm text-muted-foreground uppercase tracking-wider">Prestart Log</h2>
                    <button
                      onClick={() => setShowPrestartModal(true)}
                      className="flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
                    >
                      <Plus size={12} /> New Prestart
                    </button>
                  </div>

                  {prestartLoading && (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 size={20} className="animate-spin text-primary" />
                    </div>
                  )}

                  {!prestartLoading && prestarts.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-14 text-center px-6">
                      <ClipboardList size={28} className="text-slate-200 mb-3" />
                      <p className="text-sm font-semibold text-slate-500 mb-1">No prestarts yet</p>
                      <p className="text-xs text-slate-400 mb-4">Start a daily prestart to log the condition of this asset.</p>
                      <button
                        onClick={() => setShowPrestartModal(true)}
                        className="flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors"
                      >
                        <Plus size={12} /> Start First Prestart
                      </button>
                    </div>
                  )}

                  {!prestartLoading && prestarts.length > 0 && (
                    <div className="divide-y divide-border">
                      {prestarts.map((p) => (
                        <div key={p.id} className="px-5 py-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full border ${
                                  p.safeToOperate
                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                    : 'bg-red-50 border-red-200 text-red-700'
                                }`}>
                                  {p.safeToOperate ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
                                  {p.safeToOperate ? 'Safe to operate' : 'NOT safe'}
                                </span>
                                {p.issueNeedsAttention && (
                                  <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full border bg-amber-50 border-amber-200 text-amber-700">
                                    <AlertTriangle size={10} /> Issue flagged
                                  </span>
                                )}
                              </div>
                              {p.kmHours && (
                                <p className="text-sm font-semibold text-slate-700">{p.kmHours}</p>
                              )}
                              {p.issueComment && (
                                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5 mt-1.5">
                                  {p.issueComment}
                                </p>
                              )}
                              {p.notes && (
                                <p className="text-xs text-slate-500 mt-1">{p.notes}</p>
                              )}
                            </div>
                            <div className="text-right shrink-0">
                              <div className="flex items-center gap-1 text-xs text-muted-foreground justify-end">
                                <Clock size={10} />
                                {new Date(p.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5">
                                {new Date(p.createdAt).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
                              </div>
                              {p.operatorName && (
                                <div className="text-xs text-muted-foreground mt-0.5 font-semibold">{p.operatorName}</div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Files tab ── */}
              {activeTab === 'files' && (
                <div className="bg-white rounded-xl border border-border">
                  <FilePanel fleetAssetId={asset.id} />
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showPrestartModal && asset && (
          <PrestartModal
            asset={asset}
            onClose={() => setShowPrestartModal(false)}
            onSaved={(p) => {
              setPrestarts((prev) => [p, ...prev]);
              setShowPrestartModal(false);
              setActiveTab('prestarts');
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showEditModal && asset && (
          <EditAssetModal
            asset={asset}
            onClose={() => setShowEditModal(false)}
            onSaved={(updated) => {
              setAsset(updated);
              setShowEditModal(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
