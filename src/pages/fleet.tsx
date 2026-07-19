import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { motion, AnimatePresence } from 'motion/react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  Truck,
  Plus,
  Search,
  AlertTriangle,
  Loader2,
  ChevronRight,
  Archive as _Archive,
  Wrench as _Wrench,
  XCircle as _XCircle,
  Menu as _Menu,
  X,
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
} from 'lucide-react';
import PortalErrorBoundary from '@/components/PortalErrorBoundary';
import {
  fetchFleet,
  createAsset,
  ASSET_TYPES,
  ASSET_STATUSES,
  getAssetStatusStyle,
  type FleetAsset,
  type CreateAssetPayload,
} from '@/lib/fleet-api';
import { useViewOnly } from '@/components/ViewOnlyGuard';
import { lazy, Suspense } from 'react';
import { Navigation } from 'lucide-react';

// Google Maps-based live map (no leaflet dependency)
const FleetLiveMap = lazy(() => import('@/components/fleet/FleetLiveMap'));

// ── Module-level Leaflet error suppressor ─────────────────────────────────────
// Stale browser-cached leaflet.js fires _leaflet_pos errors before React mounts.
// Install the suppressor immediately at module parse time so it catches errors
// that occur before componentDidMount can run.
if (typeof window !== 'undefined') {
  const _prev = window.onerror;
  window.onerror = function(msg, src, line, col, err) {
    const m = String(msg ?? err?.message ?? '');
    if (m.includes('_leaflet_pos') || (typeof src === 'string' && src.includes('leaflet'))) {
      return true; // suppress — stale cached leaflet.js, not our code
    }
    return typeof _prev === 'function' ? _prev(msg, src, line, col, err) : false;
  };
  // Also suppress unhandledrejection from leaflet promises
  window.addEventListener('unhandledrejection', (e) => {
    const m = String(e?.reason?.message ?? e?.reason ?? '');
    if (m.includes('_leaflet_pos') || m.includes('leaflet')) e.preventDefault();
  }, { capture: true });
  // Patch _leaflet_pos on Element.prototype so getPosition(el) never throws,
  // even when el is undefined (stale cached leaflet calls it before the map pane exists).
  try {
    const desc = Object.getOwnPropertyDescriptor(Element.prototype, '_leaflet_pos');
    // Only install if not already patched by index.html inline script
    if (!desc || typeof desc.get !== 'function') {
      Object.defineProperty(Element.prototype, '_leaflet_pos', {
        get() { return (this as HTMLElement & { __lpos?: { x: number; y: number } }).__lpos ?? { x: 0, y: 0 }; },
        set(v: { x: number; y: number }) { (this as HTMLElement & { __lpos?: { x: number; y: number } }).__lpos = v; },
        configurable: true,
      });
    }
  } catch { /* ignore */ }
}

// ── Leaflet crash boundary ────────────────────────────────────────────────────
// Silently catches any _leaflet_pos errors from stale cached leaflet.js.
// The Google Maps live map is unaffected — it does not use leaflet at all.
class LeafletCrashBoundary extends React.Component<
  { children: React.ReactNode },
  { crashed: boolean }
> {
  private _onerror: OnErrorEventHandler = null;

  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { crashed: false };
  }

  componentDidMount() {
    // Suppress _leaflet_pos errors at the window level so they never reach
    // the React error boundary or the browser console.
    this._onerror = window.onerror;
    window.onerror = (msg, _src, _line, _col, err) => {
      const m = String(msg ?? err?.message ?? '');
      if (m.includes('_leaflet_pos') || m.includes('leaflet')) return true; // suppress
      return typeof this._onerror === 'function'
        ? this._onerror(msg, _src, _line, _col, err)
        : false;
    };
  }

  componentWillUnmount() {
    window.onerror = this._onerror;
  }

  static getDerivedStateFromError(error: Error) {
    const m = String(error?.message ?? error ?? '');
    // Swallow leaflet errors silently — don't mark as crashed
    if (m.includes('_leaflet_pos') || m.includes('leaflet')) {
      return { crashed: false };
    }
    return { crashed: true };
  }

  componentDidCatch(error: Error) {
    const m = String(error?.message ?? error ?? '');
    if (!m.includes('_leaflet_pos') && !m.includes('leaflet')) {
      console.error('[FleetPage] Unexpected render error:', error);
    }
  }

  render() {
    if (this.state.crashed) return null;
    return this.props.children;
  }
}

// ── Purge any browser-cached leaflet chunks on mount ─────────────────────────
// The old pre-bundled leaflet.js?v=05d76b4a may live in the browser's HTTP
// disk cache and execute before the SW can intercept it. This runs once on
// first render and forces a reload if it finds and deletes a stale entry.
async function purgeLeafletCache(): Promise<void> {
  const PURGE_KEY = '__leaflet_purge_v8';
  // Only run once per session to avoid reload loops
  try {
    if (sessionStorage.getItem(PURGE_KEY)) return;
  } catch { /* ignore */ }

  let didPurge = false;

  // 1. Unregister ALL service workers so the new SW can take over cleanly
  if ('serviceWorker' in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
      if (regs.length > 0) didPurge = true;
    } catch { /* ignore */ }
  }

  // 2. Nuke ALL Cache Storage entries (covers Vite dep cache, old SW caches)
  if ('caches' in window) {
    try {
      const names = await caches.keys();
      if (names.length > 0) {
        await Promise.all(names.map((n) => caches.delete(n)));
        didPurge = true;
      }
    } catch { /* ignore */ }
  }

  // 3. Mark done AFTER purge so a failed reload retries
  try { sessionStorage.setItem(PURGE_KEY, '1'); } catch { /* ignore */ }

  // 4. Hard reload so the browser re-fetches leaflet.js from the server stub
  if (didPurge) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (location as any).reload(true);
    } catch {
      const url = new URL(location.href);
      url.searchParams.set('_lkill', '8');
      location.replace(url.toString());
    }
  }
}

// ── Status icon map (reserved for future use) ─────────────────────────────────

// ── New Asset Modal ───────────────────────────────────────────────────────────
interface NewAssetModalProps {
  onClose: () => void;
  onCreated: (asset: FleetAsset) => void;
}

function NewAssetModal({ onClose, onCreated }: NewAssetModalProps) {
  const [form, setForm] = useState<CreateAssetPayload>({
    name: '',
    assetNumber: '',
    type: 'Vehicle',
    makeModel: '',
    vin: '',
    rego: '',
    regoNotApplicable: false,
    serviceDate: '',
    regoExpiry: '',
    status: 'Active',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof CreateAssetPayload, v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError('Asset name is required'); return; }
    if (saving) return; // prevent double-submit
    setSaving(true);
    setError('');
    try {
      const asset = await createAsset(form);
      onCreated(asset);
      // modal closes via onCreated — no further state updates needed
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create asset');
      setSaving(false); // only reset on error so button stays disabled on success
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
          <h2 className="font-heading font-bold text-base">New Fleet Asset</h2>
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
              <input
                type="text"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="e.g. Toyota HiLux SR5 — White"
                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5">Asset / Rego Number</label>
              <input
                type="text"
                value={form.assetNumber}
                onChange={(e) => set('assetNumber', e.target.value)}
                placeholder="e.g. FLT-001"
                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5">Type</label>
              <select
                value={form.type}
                onChange={(e) => set('type', e.target.value)}
                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors bg-white"
              >
                {ASSET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-semibold mb-1.5">Make / Model</label>
              <input
                type="text"
                value={form.makeModel}
                onChange={(e) => set('makeModel', e.target.value)}
                placeholder="e.g. Toyota HiLux SR5 2022"
                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-semibold mb-1.5">VIN</label>
              <input
                type="text"
                value={form.vin ?? ''}
                onChange={(e) => set('vin', e.target.value)}
                placeholder="e.g. 1HGBH41JXMN109186"
                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5">Rego Plate</label>
              <input
                type="text"
                value={form.rego}
                onChange={(e) => set('rego', e.target.value)}
                disabled={form.regoNotApplicable}
                placeholder="e.g. 123 ABC"
                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors disabled:opacity-40 disabled:bg-slate-50"
              />
            </div>

            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.regoNotApplicable}
                  onChange={(e) => set('regoNotApplicable', e.target.checked)}
                  className="w-4 h-4 accent-primary"
                />
                <span className="text-xs font-semibold text-slate-600">Rego not applicable</span>
              </label>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5">Service Due Date</label>
              <input
                type="date"
                value={form.serviceDate}
                onChange={(e) => set('serviceDate', e.target.value)}
                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5">Rego Expiry Date</label>
              <input
                type="date"
                value={form.regoExpiry}
                onChange={(e) => set('regoExpiry', e.target.value)}
                disabled={form.regoNotApplicable}
                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors disabled:opacity-40 disabled:bg-slate-50"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5">Status</label>
              <select
                value={form.status}
                onChange={(e) => set('status', e.target.value)}
                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors bg-white"
              >
                {ASSET_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-semibold mb-1.5">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                rows={3}
                placeholder="Any additional notes…"
                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors resize-none"
              />
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-2">
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
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              {saving ? 'Creating…' : 'Create Asset'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ── Fleet Page ────────────────────────────────────────────────────────────────

type FilterStatus = 'all' | 'Active' | 'Maintenance' | 'Out of Service';

const FILTERS: { label: string; value: FilterStatus }[] = [
  { label: 'All Assets',      value: 'all' },
  { label: 'Active',          value: 'Active' },
  { label: 'Maintenance',     value: 'Maintenance' },
  { label: 'Out of Service',  value: 'Out of Service' },
];

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: 'easeOut' as const } },
} as const;

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
} as const;

export default function FleetPage() {
  const [assets, setAssets] = useState<FleetAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [showModal, setShowModal] = useState(false);
  const [successName, setSuccessName] = useState('');
  const [view, setView] = useState<'assets' | 'live-map'>('assets');
  const { isViewOnly } = useViewOnly();
  const navigate = useNavigate();

  useEffect(() => { void purgeLeafletCache(); }, []);

  const load = useCallback(async () => {
    try {
      const data = await fetchFleet();
      setAssets(data);
    } catch {
      setError('Failed to load fleet assets');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = assets.filter((a) => {
    if (filter !== 'all' && a.status !== filter) return false;
    const q = search.toLowerCase();
    return (
      a.name.toLowerCase().includes(q) ||
      (a.assetNumber ?? '').toLowerCase().includes(q) ||
      (a.rego ?? '').toLowerCase().includes(q) ||
      a.type.toLowerCase().includes(q) ||
      (a.makeModel ?? '').toLowerCase().includes(q)
    );
  });

  const counts = {
    Active:         assets.filter((a) => a.status === 'Active').length,
    Maintenance:    assets.filter((a) => a.status === 'Maintenance').length,
    'Out of Service': assets.filter((a) => a.status === 'Out of Service').length,
  };

  const attentionCount = counts.Maintenance + counts['Out of Service'];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Helmet>
        <title>Fleet — IWILLBUILD Portal</title>
        <meta name="description" content="Track fleet assets, daily prestarts, service dates and rego in the IWILLBUILD portal." />
        <link rel="canonical" href="https://iwillbuild.com/fleet" />
        <meta name="robots" content="noindex" />
        <meta property="og:title" content="Fleet — IWILLBUILD Portal" />
        <meta property="og:description" content="Track fleet assets, daily prestarts, service dates and rego in the IWILLBUILD portal." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://iwillbuild.com/fleet" />
        <meta property="og:image" content="https://iwillbuild.com/airo-assets/images/pages/home/og-image" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Fleet — IWILLBUILD Portal" />
        <meta name="twitter:description" content="Track fleet assets, daily prestarts, service dates and rego in the IWILLBUILD portal." />
        <meta name="twitter:image" content="https://iwillbuild.com/airo-assets/images/pages/home/og-image" />
      </Helmet>

      <PortalErrorBoundary inline>
      <div className="flex flex-col flex-1">
        {/* Slim top bar — title + back only, no controls (avoids iPhone status bar overlap) */}
        <header className="sticky top-0 z-30 h-12 bg-white border-b border-border flex items-center px-4 shrink-0 gap-2 safe-top">
          <button
            onClick={() => navigate('/home')}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
            aria-label="Back to Home"
          >
            <ArrowLeft size={16} />
            <span className="hidden sm:inline">Home</span>
          </button>
          <span className="text-gray-300">|</span>
          <Truck size={17} className="text-primary shrink-0" />
          <h1 className="font-heading font-bold text-base truncate flex-1">Fleet</h1>
          {!loading && (
            <span className="text-xs bg-slate-100 text-slate-500 font-semibold px-2 py-0.5 rounded-full shrink-0">
              {assets.length} asset{assets.length !== 1 ? 's' : ''}
            </span>
          )}
          {attentionCount > 0 && (
            <span className="hidden sm:flex items-center gap-1 text-xs bg-amber-100 text-amber-700 font-bold px-2 py-0.5 rounded-full shrink-0">
              <AlertTriangle size={10} />
              {attentionCount}
            </span>
          )}
        </header>

        {/* Content — extra bottom padding so floating bar doesn't overlap */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0 pb-20">
          {/* ── Live Map view ── */}
          {view === 'live-map' && (
            <LeafletCrashBoundary>
              <Suspense fallback={
                <div className="flex items-center justify-center flex-1 gap-2 text-slate-400">
                  <Loader2 size={20} className="animate-spin" />
                  <span className="text-sm">Loading map…</span>
                </div>
              }>
                <FleetLiveMap key="fleet-live-map" />
              </Suspense>
            </LeafletCrashBoundary>
          )}

          {/* ── Assets view ── */}
          {view === 'assets' && (
          <div className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col gap-5">

          {/* Success banner */}
          <AnimatePresence>
            {successName && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-800"
              >
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                <span><span className="font-bold">{successName}</span> was added to your fleet.</span>
                <button onClick={() => setSuccessName('')} className="ml-auto text-emerald-600 hover:text-emerald-800 transition-colors">
                  <X size={14} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              <AlertCircle size={15} className="shrink-0" />
              {error}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={24} className="animate-spin text-primary" />
            </div>
          )}

          {!loading && (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Active',          count: counts.Active,           color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100' },
                  { label: 'Maintenance',     count: counts.Maintenance,      color: 'text-blue-600',    bg: 'bg-blue-50 border-blue-100' },
                  { label: 'Out of Service',  count: counts['Out of Service'], color: 'text-red-600',     bg: 'bg-red-50 border-red-100' },
                  { label: 'Total',           count: assets.length,           color: 'text-slate-700',   bg: 'bg-white border-slate-200' },
                ].map((s) => (
                  <div key={s.label} className={`${s.bg} rounded-xl p-4 border`}>
                    <div className={`text-2xl font-black ${s.color}`}>{s.count}</div>
                    <div className="text-xs font-semibold text-slate-500 mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Search + filter */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search name, rego, type…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                  />
                </div>
                <div className="scroll-x-hide flex items-center gap-2 pb-0.5">
                  {FILTERS.map((f) => (
                    <button
                      key={f.value}
                      onClick={() => setFilter(f.value)}
                      className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap ${
                        filter === f.value
                          ? 'bg-primary text-white border-primary'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-primary hover:text-primary'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Empty state */}
              {assets.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                    <Truck size={28} className="text-slate-300" />
                  </div>
                  <h2 className="font-heading font-bold text-base text-slate-700 mb-2">No fleet assets yet</h2>
                  <p className="text-sm text-slate-400 mb-6 max-w-xs">
                    Add your vehicles, plant, and equipment to track prestarts, service dates, and rego.
                  </p>
                  <button
                    onClick={() => !isViewOnly && setShowModal(true)}
                    disabled={isViewOnly}
                    title={isViewOnly ? 'Subscribe to continue' : undefined}
                    className="flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus size={15} />
                    Add First Asset
                  </button>
                </div>
              )}

              {/* No results */}
              {assets.length > 0 && filtered.length === 0 && (
                <div className="text-center py-16 text-slate-400 text-sm">No assets match your search.</div>
              )}

              {/* Asset list */}
              {filtered.length > 0 && (
                <motion.div
                  variants={stagger}
                  initial="hidden"
                  animate="visible"
                  className="flex flex-col gap-3"
                >
                  {filtered.map((asset) => {
                    const style = getAssetStatusStyle(asset.status);
                    return (
                      <motion.div key={asset.id} variants={fadeUp}>
                        <Link
                          to={`/fleet/${asset.id}`}
                          className="block bg-white border border-slate-200 rounded-xl p-5 hover:border-primary/40 hover:shadow-md transition-all duration-150 group"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                {asset.assetNumber && (
                                  <span className="text-xs font-mono text-slate-400">{asset.assetNumber}</span>
                                )}
                                <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2 py-0.5 rounded-full border ${style.bg} ${style.color}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                                  {asset.status}
                                </span>
                                <span className="text-xs bg-slate-100 text-slate-500 font-semibold px-2 py-0.5 rounded-full">
                                  {asset.type}
                                </span>
                              </div>
                              <h2 className="font-bold text-base text-slate-900 truncate">{asset.name}</h2>
                              <div className="flex items-center gap-4 mt-1 text-xs text-slate-500 flex-wrap">
                                {asset.makeModel && <span>{asset.makeModel}</span>}
                                {!asset.regoNotApplicable && asset.rego && (
                                  <span>Rego: {asset.rego}</span>
                                )}
                                {asset.regoNotApplicable && (
                                  <span className="text-slate-400">Rego N/A</span>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1 shrink-0">
                              {asset.serviceDate && (
                                <span className="text-xs text-slate-400">
                                  Service: {new Date(asset.serviceDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </span>
                              )}
                              {!asset.regoNotApplicable && asset.regoExpiry && (
                                <span className="text-xs text-slate-400">
                                  Rego exp: {new Date(asset.regoExpiry).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </span>
                              )}
                            </div>
                            <ChevronRight size={16} className="text-slate-300 group-hover:text-primary transition-colors shrink-0 mt-1" />
                          </div>
                        </Link>
                      </motion.div>
                    );
                  })}
                </motion.div>
              )}
            </>
          )}
          </div>
          )}
        </div>

        {/* New Asset Modal */}
        <AnimatePresence>
          {showModal && (
            <NewAssetModal
              onClose={() => setShowModal(false)}
              onCreated={(asset) => {
                setAssets((prev) => [asset, ...prev]);
                setShowModal(false);
                setSuccessName(asset.name);
                setTimeout(() => setSuccessName(''), 5000);
              }}
            />
          )}
        </AnimatePresence>
      </div>

        {/* ── Floating bottom action bar ── */}
        {/* Sits above iPhone home indicator; avoids status-bar overlap at top */}
        <div className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-between gap-3 px-4 bg-white/95 backdrop-blur-sm border-t border-border shadow-[0_-2px_12px_rgba(0,0,0,0.08)]"
          style={{ paddingTop: '12px', paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}
        >
          {/* View toggle */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 border border-slate-200 flex-1 max-w-[200px]">
            <button
              onClick={() => setView('assets')}
              title="Assets list"
              className={[
                'flex items-center justify-center gap-1.5 flex-1 py-2 rounded-lg text-xs font-semibold transition-colors',
                view === 'assets' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500',
              ].join(' ')}
            >
              <Truck size={14} />
              <span>Assets</span>
            </button>
            <button
              onClick={() => setView('live-map')}
              title="Live GPS map"
              className={[
                'flex items-center justify-center gap-1.5 flex-1 py-2 rounded-lg text-xs font-semibold transition-colors',
                view === 'live-map' ? 'bg-primary text-white shadow-sm' : 'text-slate-500',
              ].join(' ')}
            >
              <Navigation size={14} />
              <span>Live Map</span>
            </button>
          </div>

          {/* Add Asset */}
          <button
            onClick={() => !isViewOnly && setShowModal(true)}
            disabled={isViewOnly}
            title={isViewOnly ? 'Subscribe to continue' : undefined}
            className="flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
          >
            <Plus size={16} />
            <span>Add Asset</span>
          </button>
        </div>
      </PortalErrorBoundary>
    </div>
  );
}
