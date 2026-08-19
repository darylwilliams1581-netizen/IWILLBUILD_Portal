/**
 * FinanceLedgerTab — company-wide job cost ledger inside the Finance workspace.
 * Reads from GET /api/finance/ledger (additive endpoint; does not break job-scoped APIs).
 * + Add Entry opens JobPickerSheet → reuses AddEntryModal from JobCosts.
 * Clicking a job/entry navigates to /jobs/:id/costs?from=/finance?financeTab=ledger.
 *
 * "By Job" is a grouped view over the same data — not a separate store.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router';
import {
  Plus, Search, X, Loader2, AlertCircle, RefreshCw,
  BookOpen, ChevronRight, ChevronDown, Filter, TrendingUp,
  Clock, CheckCircle2, Briefcase,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import JobPickerSheet from '@/components/JobPickerSheet';
import { AddEntryModal, type LedgerEntry } from '@/components/job/JobCosts';

// ── Types ─────────────────────────────────────────────────────────────────────

interface FinanceLedgerEntry {
  id: number;
  jobId: number;
  jobName: string | null;
  jobNumber: string | null;
  eventType: string;
  description: string;
  subtotal: string | number;
  gst: string | number;
  total: string | number;
  status: string;
  entryDate: string;
  createdAt: string;
  supplierName: string | null;
  sourceModule: string | null;
  referenceNumber: string | null;
}

interface LedgerSummary {
  approvedTotal: number;
  pendingTotal: number;
  grandTotal: number;
  jobCount: number;
}

interface ApiResponse {
  entries: FinanceLedgerEntry[];
  hasMore: boolean;
  nextCursor: number | null;
  summary: LedgerSummary;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const EVENT_COLORS: Record<string, string> = {
  LABOUR:        'bg-blue-100 text-blue-800 border-blue-200',
  MATERIAL:      'bg-amber-100 text-amber-800 border-amber-200',
  PLANT:         'bg-purple-100 text-purple-800 border-purple-200',
  SUBCONTRACTOR: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  RECEIPT:       'bg-violet-100 text-violet-800 border-violet-200',
  PURCHASE:      'bg-red-100 text-red-800 border-red-200',
  VARIATION:     'bg-yellow-100 text-yellow-800 border-yellow-200',
  INVOICE_LINE:  'bg-indigo-100 text-indigo-800 border-indigo-200',
  CREDIT:        'bg-teal-100 text-teal-800 border-teal-200',
  ADJUSTMENT:    'bg-slate-100 text-slate-700 border-slate-200',
};

const STATUS_COLORS: Record<string, string> = {
  pending:  'bg-amber-100 text-amber-800 border-amber-200',
  approved: 'bg-emerald-100 text-emerald-800 border-emerald-200',
};

const EVENT_TYPES = [
  'LABOUR', 'MATERIAL', 'PLANT', 'SUBCONTRACTOR', 'RECEIPT',
  'PURCHASE', 'VARIATION', 'INVOICE_LINE', 'CREDIT', 'ADJUSTMENT',
];

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

type ViewMode = 'all' | 'by-job';

// ── Summary cards ─────────────────────────────────────────────────────────────

function SummaryCards({ summary, loading }: { summary: LedgerSummary | null; loading: boolean }) {
  const cards = [
    { label: 'Approved costs', value: summary?.approvedTotal ?? 0, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Pending costs',  value: summary?.pendingTotal  ?? 0, icon: Clock,         color: 'text-amber-600',  bg: 'bg-amber-50'  },
    { label: 'Total costs',    value: summary?.grandTotal    ?? 0, icon: TrendingUp,    color: 'text-primary',    bg: 'bg-primary/10' },
    { label: 'Jobs with entries', value: summary?.jobCount   ?? 0, icon: Briefcase,     color: 'text-blue-600',   bg: 'bg-blue-50', isCount: true },
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 px-4 py-3 border-b border-border shrink-0">
      {cards.map(c => (
        <div key={c.label} className="bg-card border border-border rounded-2xl px-4 py-3 flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl ${c.bg} flex items-center justify-center shrink-0`}>
            <c.icon size={16} className={c.color} />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate">{c.label}</p>
            {loading ? (
              <div className="h-4 w-16 bg-muted animate-pulse rounded mt-0.5" />
            ) : (
              <p className="font-bold text-foreground text-sm tabular-nums">
                {(c as { isCount?: boolean }).isCount ? String(c.value) : fmt(c.value)}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FinanceLedgerTab() {
  const navigate = useNavigate();

  const [entries, setEntries] = useState<FinanceLedgerEntry[]>([]);
  const [summary, setSummary] = useState<LedgerSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('all');

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [eventFilter, setEventFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Add Entry
  const [pickerOpen, setPickerOpen] = useState(false);
  const [addEntryJobId, setAddEntryJobId] = useState<number | null>(null);
  const [addEntryJobName, setAddEntryJobName] = useState<string>('');

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
    if (eventFilter)     p.set('event_type', eventFilter);
    if (cursor)          p.set('cursor', String(cursor));
    return `/api/finance/ledger?${p.toString()}`;
  }, [debouncedSearch, statusFilter, eventFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(buildUrl(), { credentials: 'include' });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as ApiResponse;
      setEntries(data.entries ?? []);
      setSummary(data.summary ?? null);
      setHasMore(data.hasMore ?? false);
      setNextCursor(data.nextCursor ?? null);
    } catch {
      setError('Failed to load ledger entries.');
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
      setEntries(prev => [...prev, ...(data.entries ?? [])]);
      setHasMore(data.hasMore ?? false);
      setNextCursor(data.nextCursor ?? null);
    } catch {
      // silent
    } finally {
      setLoadingMore(false);
    }
  }

  function handleJobSelected(job: { id: number; name: string }) {
    setPickerOpen(false);
    setAddEntryJobId(job.id);
    setAddEntryJobName(job.name);
  }

  function handleEntryCreated(entry: LedgerEntry) {
    setAddEntryJobId(null);
    // Prepend to list and refresh summary
    const newEntry: FinanceLedgerEntry = {
      id: entry.id,
      jobId: entry.job_id,
      jobName: entry.job_title ?? addEntryJobName,
      jobNumber: entry.job_number,
      eventType: entry.event_type,
      description: entry.description,
      subtotal: entry.subtotal,
      gst: entry.gst,
      total: entry.total,
      status: entry.status,
      entryDate: entry.entry_date,
      createdAt: entry.created_at,
      supplierName: entry.contact_name,
      sourceModule: entry.source_module,
      referenceNumber: entry.reference,
    };
    setEntries(prev => [newEntry, ...prev]);
    // Refresh summary silently
    void load();
  }

  function openJob(jobId: number) {
    const from = encodeURIComponent('/finance?financeTab=ledger');
    navigate(`/jobs/${jobId}/costs?from=${from}`);
  }

  const activeFilters = (statusFilter ? 1 : 0) + (eventFilter ? 1 : 0) + (debouncedSearch ? 1 : 0);

  // Group by job for "By Job" view
  const byJob = entries.reduce<Record<number, { jobName: string; jobNumber: string | null; entries: FinanceLedgerEntry[]; total: number }>>((acc, e) => {
    if (!acc[e.jobId]) acc[e.jobId] = { jobName: e.jobName ?? `Job #${e.jobId}`, jobNumber: e.jobNumber, entries: [], total: 0 };
    acc[e.jobId].entries.push(e);
    acc[e.jobId].total += parseFloat(String(e.total)) || 0;
    return acc;
  }, {});

  return (
    <div className="flex flex-col h-full">
      {/* ── Summary cards ───────────────────────────────────────────────── */}
      <SummaryCards summary={summary} loading={loading} />

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-background shrink-0 flex-wrap">
        {/* View mode toggle */}
        <div className="flex bg-muted rounded-xl p-0.5 shrink-0">
          {(['all', 'by-job'] as ViewMode[]).map(m => (
            <button
              key={m}
              onClick={() => setViewMode(m)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                viewMode === m ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {m === 'all' ? 'All Entries' : 'By Job'}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2 flex-1 min-w-[140px]">
          <Search size={14} className="text-muted-foreground shrink-0" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search entries, jobs…"
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

        {/* + Add Entry */}
        <button
          onClick={() => setPickerOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 active:bg-primary/80 transition-colors shrink-0"
        >
          <Plus size={14} />
          <span className="hidden sm:inline">Add Entry</span>
          <span className="sm:hidden">Add</span>
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
            <div className="flex flex-wrap gap-3 px-4 py-3 border-b border-border bg-muted/40">
              {/* Status */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-medium text-muted-foreground">Status:</span>
                {['', 'pending', 'approved'].map(s => (
                  <button
                    key={s || 'all'}
                    onClick={() => setStatusFilter(s)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                      statusFilter === s ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:bg-accent'
                    }`}
                  >{s || 'All'}</button>
                ))}
              </div>
              {/* Event type */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-medium text-muted-foreground">Type:</span>
                <button
                  onClick={() => setEventFilter('')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                    !eventFilter ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:bg-accent'
                  }`}
                >All</button>
                {EVENT_TYPES.map(t => (
                  <button
                    key={t}
                    onClick={() => setEventFilter(eventFilter === t ? '' : t)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                      eventFilter === t ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:bg-accent'
                    }`}
                  >{t.charAt(0) + t.slice(1).toLowerCase()}</button>
                ))}
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
            <span className="text-sm">Loading ledger…</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center px-4">
            <AlertCircle size={28} className="text-destructive" />
            <p className="text-sm text-muted-foreground">{error}</p>
            <button onClick={() => void load()} className="text-sm text-primary hover:underline">Retry</button>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center px-4">
            <BookOpen size={32} className="text-muted-foreground/40" />
            <p className="font-semibold text-foreground">No ledger entries found</p>
            <p className="text-sm text-muted-foreground">
              {debouncedSearch || statusFilter || eventFilter ? 'Try adjusting your filters.' : 'Add your first cost entry to get started.'}
            </p>
          </div>
        ) : viewMode === 'by-job' ? (
          /* ── By Job grouped view ── */
          <div className="divide-y divide-border">
            {Object.entries(byJob).map(([jobIdStr, group]) => {
              const jobId = parseInt(jobIdStr, 10);
              return (
                <div key={jobId}>
                  <button
                    onClick={() => openJob(jobId)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/60 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2">
                      <Briefcase size={14} className="text-primary shrink-0" />
                      <span className="font-semibold text-foreground text-sm">{group.jobName}</span>
                      {group.jobNumber && <span className="text-xs text-muted-foreground font-mono">{group.jobNumber}</span>}
                      <span className="text-xs text-muted-foreground">· {group.entries.length} entries</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-foreground text-sm tabular-nums">{fmt(group.total)}</span>
                      <ChevronRight size={13} className="text-muted-foreground" />
                    </div>
                  </button>
                  <div className="divide-y divide-border/60">
                    {group.entries.map(e => (
                      <div key={e.id} className="flex items-center gap-3 px-4 py-3 pl-10 hover:bg-muted/20 transition-colors">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground truncate">{e.description}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border ${EVENT_COLORS[e.eventType] ?? 'bg-muted text-muted-foreground border-border'}`}>
                              {e.eventType.charAt(0) + e.eventType.slice(1).toLowerCase()}
                            </span>
                            <span className="text-xs text-muted-foreground">{fmtDate(e.entryDate)}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-semibold text-foreground text-sm tabular-nums">{fmt(e.total)}</p>
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border ${STATUS_COLORS[e.status] ?? 'bg-muted text-muted-foreground border-border'}`}>
                            {e.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* ── All Entries view ── */
          <>
            {/* Desktop table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    <th className="text-left px-4 py-3">Date</th>
                    <th className="text-left px-4 py-3">Job</th>
                    <th className="text-left px-4 py-3">Description</th>
                    <th className="text-left px-4 py-3">Type</th>
                    <th className="text-left px-4 py-3">Supplier</th>
                    <th className="text-right px-4 py-3">Amount</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {entries.map(e => (
                    <tr
                      key={e.id}
                      onClick={() => openJob(e.jobId)}
                      className="hover:bg-muted/40 cursor-pointer transition-colors group"
                    >
                      <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{fmtDate(e.entryDate)}</td>
                      <td className="px-4 py-3">
                        <p className="text-foreground truncate max-w-[140px]">{e.jobName ?? '—'}</p>
                        {e.jobNumber && <p className="text-xs text-muted-foreground font-mono">{e.jobNumber}</p>}
                      </td>
                      <td className="px-4 py-3 text-foreground truncate max-w-[200px]">{e.description}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${EVENT_COLORS[e.eventType] ?? 'bg-muted text-muted-foreground border-border'}`}>
                          {e.eventType.charAt(0) + e.eventType.slice(1).toLowerCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs truncate max-w-[120px]">{e.supplierName ?? '—'}</td>
                      <td className="px-4 py-3 text-right font-semibold text-foreground tabular-nums">{fmt(e.total)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${STATUS_COLORS[e.status] ?? 'bg-muted text-muted-foreground border-border'}`}>
                          {e.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <ChevronRight size={14} className="text-muted-foreground group-hover:text-foreground transition-colors" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="lg:hidden divide-y divide-border">
              {entries.map(e => (
                <button
                  key={e.id}
                  onClick={() => openJob(e.jobId)}
                  className="w-full flex items-start gap-3 px-4 py-4 hover:bg-muted/40 active:bg-muted/60 transition-colors text-left"
                >
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <BookOpen size={16} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-foreground text-sm truncate">{e.description}</p>
                      <span className="font-bold text-foreground text-sm tabular-nums shrink-0">{fmt(e.total)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {e.jobName ?? 'No job'}{e.jobNumber ? ` · ${e.jobNumber}` : ''}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border ${EVENT_COLORS[e.eventType] ?? 'bg-muted text-muted-foreground border-border'}`}>
                        {e.eventType.charAt(0) + e.eventType.slice(1).toLowerCase()}
                      </span>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border ${STATUS_COLORS[e.status] ?? 'bg-muted text-muted-foreground border-border'}`}>
                        {e.status}
                      </span>
                      <span className="text-xs text-muted-foreground">{fmtDate(e.entryDate)}</span>
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

      {/* ── Job picker for + Add Entry ───────────────────────────────────── */}
      <JobPickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Select a Job"
        subtitle="Choose the job for this cost entry"
        iconBg="bg-emerald-100"
        iconFg="text-emerald-600"
        Icon={BookOpen}
        onSelect={handleJobSelected}
      />

      {/* ── Add Entry modal (reuses existing JobCosts modal) ─────────────── */}
      <AnimatePresence>
        {addEntryJobId !== null && (
          <AddEntryModal
            jobId={addEntryJobId}
            onClose={() => setAddEntryJobId(null)}
            onCreated={handleEntryCreated}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
