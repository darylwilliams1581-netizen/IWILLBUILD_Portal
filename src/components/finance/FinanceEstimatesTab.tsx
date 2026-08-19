/**
 * FinanceEstimatesTab — company-wide estimates list inside the Finance workspace.
 * Reads from GET /api/finance/estimates (additive endpoint; does not break job-scoped GET /api/estimates).
 * + New Estimate opens JobPickerSheet → navigates to /jobs/:id/quotes (existing workflow).
 * Clicking an estimate opens /estimates/:id?from=/finance?financeTab=estimates so Back returns here.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router';
import {
  Plus, Search, X, Loader2, AlertCircle, RefreshCw,
  FileText, ChevronRight, ChevronDown, Filter,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import JobPickerSheet from '@/components/JobPickerSheet';

// ── Types ─────────────────────────────────────────────────────────────────────

interface FinanceEstimate {
  id: number;
  jobId: number;
  jobName: string | null;
  jobNumber: string | null;
  customerName: string | null;
  title: string;
  status: string;
  total: number;
  createdAt: string;
  updatedAt: string;
  locked: number | boolean | null;
}

interface ApiResponse {
  estimates: FinanceEstimate[];
  hasMore: boolean;
  nextCursor: number | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  Draft:    'bg-slate-100 text-slate-700 border-slate-200',
  Sent:     'bg-blue-100 text-blue-700 border-blue-200',
  Accepted: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  Approved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  Declined: 'bg-red-100 text-red-700 border-red-200',
  Locked:   'bg-amber-100 text-amber-700 border-amber-200',
};

function fmt(n: number) {
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2 });
}
function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return d; }
}

const STATUSES = ['Draft', 'Sent', 'Accepted', 'Declined', 'Approved'];

// ── Component ─────────────────────────────────────────────────────────────────

export default function FinanceEstimatesTab() {
  const navigate = useNavigate();

  const [estimates, setEstimates] = useState<FinanceEstimate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<number | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Job picker for + New Estimate
  const [pickerOpen, setPickerOpen] = useState(false);

  // Debounce search
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(search), 350);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search]);

  const buildUrl = useCallback((cursor?: number | null) => {
    const p = new URLSearchParams();
    p.set('limit', '50');
    if (debouncedSearch) p.set('search', debouncedSearch);
    if (statusFilter)    p.set('status', statusFilter);
    if (cursor)          p.set('cursor', String(cursor));
    return `/api/finance/estimates?${p.toString()}`;
  }, [debouncedSearch, statusFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(buildUrl(), { credentials: 'include' });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as ApiResponse;
      setEstimates(data.estimates ?? []);
      setHasMore(data.hasMore ?? false);
      setNextCursor(data.nextCursor ?? null);
    } catch {
      setError('Failed to load estimates.');
    } finally {
      setLoading(false);
    }
  }, [buildUrl]);

  useEffect(() => { void load(); }, [load]);

  async function loadMore() {
    if (!hasMore || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(buildUrl(nextCursor), { credentials: 'include' });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as ApiResponse;
      setEstimates(prev => [...prev, ...(data.estimates ?? [])]);
      setHasMore(data.hasMore ?? false);
      setNextCursor(data.nextCursor ?? null);
    } catch {
      // silent — user can retry
    } finally {
      setLoadingMore(false);
    }
  }

  function openEstimate(est: FinanceEstimate) {
    // Pass ?from= so the editor's Back button returns to Finance
    const from = encodeURIComponent('/finance?financeTab=estimates');
    navigate(`/estimates/${est.id}?from=${from}`);
  }

  function handleJobSelected(job: { id: number }) {
    setPickerOpen(false);
    navigate(`/jobs/${job.id}/quotes`);
  }

  const activeFilters = (statusFilter ? 1 : 0) + (debouncedSearch ? 1 : 0);

  return (
    <div className="flex flex-col h-full">
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-background shrink-0 flex-wrap">
        {/* Search */}
        <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2 flex-1 min-w-[160px]">
          <Search size={14} className="text-muted-foreground shrink-0" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search estimates, jobs, customers…"
            className="flex-1 bg-transparent text-sm text-foreground placeholder-muted-foreground outline-none min-w-0"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-muted-foreground hover:text-foreground">
              <X size={13} />
            </button>
          )}
        </div>

        {/* Filter toggle */}
        <button
          onClick={() => setShowFilters(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${
            activeFilters > 0
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-muted text-muted-foreground border-border hover:bg-accent'
          }`}
        >
          <Filter size={13} />
          Filters
          {activeFilters > 0 && (
            <span className="ml-0.5 bg-white/20 rounded-full px-1.5 text-xs">{activeFilters}</span>
          )}
          <ChevronDown size={12} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
        </button>

        {/* Refresh */}
        <button
          onClick={() => void load()}
          disabled={loading}
          className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center text-muted-foreground hover:bg-accent transition-colors disabled:opacity-40"
          aria-label="Refresh"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>

        {/* + New Estimate */}
        <button
          onClick={() => setPickerOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 active:bg-primary/80 transition-colors shrink-0"
        >
          <Plus size={14} />
          <span className="hidden sm:inline">New Estimate</span>
          <span className="sm:hidden">New</span>
        </button>
      </div>

      {/* ── Filter row ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden shrink-0"
          >
            <div className="flex flex-wrap gap-2 px-4 py-3 border-b border-border bg-muted/40">
              {/* Status */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Status:</span>
                <div className="flex gap-1 flex-wrap">
                  <button
                    onClick={() => setStatusFilter('')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                      !statusFilter ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:bg-accent'
                    }`}
                  >All</button>
                  {STATUSES.map(s => (
                    <button
                      key={s}
                      onClick={() => setStatusFilter(statusFilter === s ? '' : s)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                        statusFilter === s ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:bg-accent'
                      }`}
                    >{s}</button>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">Loading estimates…</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center px-4">
            <AlertCircle size={28} className="text-destructive" />
            <p className="text-sm text-muted-foreground">{error}</p>
            <button onClick={() => void load()} className="text-sm text-primary hover:underline">Retry</button>
          </div>
        ) : estimates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center px-4">
            <FileText size={32} className="text-muted-foreground/40" />
            <p className="font-semibold text-foreground">No estimates found</p>
            <p className="text-sm text-muted-foreground">
              {debouncedSearch || statusFilter ? 'Try adjusting your filters.' : 'Create your first estimate to get started.'}
            </p>
            {!debouncedSearch && !statusFilter && (
              <button
                onClick={() => setPickerOpen(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors mt-1"
              >
                <Plus size={14} /> New Estimate
              </button>
            )}
          </div>
        ) : (
          <>
            {/* ── Desktop table ── */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    <th className="text-left px-4 py-3">Estimate</th>
                    <th className="text-left px-4 py-3">Job</th>
                    <th className="text-left px-4 py-3">Customer</th>
                    <th className="text-right px-4 py-3">Total</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-left px-4 py-3">Updated</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {estimates.map(est => (
                    <tr
                      key={est.id}
                      onClick={() => openEstimate(est)}
                      className="hover:bg-muted/40 cursor-pointer transition-colors group"
                    >
                      <td className="px-4 py-3">
                        <p className="font-semibold text-foreground truncate max-w-[200px]">{est.title}</p>
                        <p className="text-xs text-muted-foreground font-mono">#{est.id}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-foreground truncate max-w-[160px]">{est.jobName ?? '—'}</p>
                        {est.jobNumber && <p className="text-xs text-muted-foreground font-mono">{est.jobNumber}</p>}
                      </td>
                      <td className="px-4 py-3 text-foreground truncate max-w-[160px]">{est.customerName ?? '—'}</td>
                      <td className="px-4 py-3 text-right font-semibold text-foreground tabular-nums">{fmt(est.total)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${STATUS_COLORS[est.status] ?? 'bg-muted text-muted-foreground border-border'}`}>
                          {est.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{fmtDate(est.updatedAt)}</td>
                      <td className="px-4 py-3">
                        <ChevronRight size={14} className="text-muted-foreground group-hover:text-foreground transition-colors" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Mobile / tablet cards ── */}
            <div className="lg:hidden divide-y divide-border">
              {estimates.map(est => (
                <button
                  key={est.id}
                  onClick={() => openEstimate(est)}
                  className="w-full flex items-start gap-3 px-4 py-4 hover:bg-muted/40 active:bg-muted/60 transition-colors text-left"
                >
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <FileText size={16} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-foreground text-sm truncate">{est.title}</p>
                      <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${STATUS_COLORS[est.status] ?? 'bg-muted text-muted-foreground border-border'}`}>
                        {est.status}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {est.jobName ?? 'No job'}{est.jobNumber ? ` · ${est.jobNumber}` : ''}
                    </p>
                    {est.customerName && (
                      <p className="text-xs text-muted-foreground truncate">{est.customerName}</p>
                    )}
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-sm font-bold text-foreground tabular-nums">{fmt(est.total)}</span>
                      <span className="text-xs text-muted-foreground">{fmtDate(est.updatedAt)}</span>
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-muted-foreground shrink-0 mt-1" />
                </button>
              ))}
            </div>

            {/* Load more */}
            {hasMore && (
              <div className="flex justify-center py-4">
                <button
                  onClick={() => void loadMore()}
                  disabled={loadingMore}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-primary hover:underline disabled:opacity-50"
                >
                  {loadingMore ? <Loader2 size={14} className="animate-spin" /> : null}
                  Load more
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Job picker for + New Estimate ──────────────────────────────── */}
      <JobPickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Select a Job"
        subtitle="Choose the job for this estimate"
        iconBg="bg-violet-100"
        iconFg="text-violet-600"
        Icon={FileText}
        onSelect={handleJobSelected}
      />
    </div>
  );
}
