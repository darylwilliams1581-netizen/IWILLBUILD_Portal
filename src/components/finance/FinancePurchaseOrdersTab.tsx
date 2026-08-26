/**
 * FinancePurchaseOrdersTab
 * Company-wide Purchase Orders list inside the Finance workspace.
 *
 * Features:
 *  - Status tabs: All | Draft | Sent | Completed | Cancelled
 *  - Status counts
 *  - Search (PO number, title, job, contractor)
 *  - Job filter, Contractor filter, Date range filter
 *  - Cursor-based pagination
 *  - + New Purchase Order → NewPOSheet
 *  - Row click → PO detail (navigates to job PO detail with return context)
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router';
import {
  Plus, Search, X, Loader2, AlertCircle, RefreshCw,
  FileText, ChevronRight, Filter, Download, Mail,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import NewPOSheet from './NewPOSheet';

// ── Types ─────────────────────────────────────────────────────────────────────

interface FinancePO {
  id: number;
  job_id: number;
  contractor_id: number | null;
  po_number: string;
  title: string;
  status: string;
  subtotal?: number;
  gst?: number;
  total?: number;
  created_at: string;
  contractor_name: string | null;
  job_number: string | null;
  job_name: string | null;
}

interface ApiResponse {
  purchaseOrders: FinancePO[];
  hasMore: boolean;
  nextCursor: number | null;
  counts: { all: number; draft: number; sent: number; completed: number; cancelled: number };
  canSeeDollars: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_TABS = ['all', 'draft', 'sent', 'completed', 'cancelled'] as const;
type StatusTab = typeof STATUS_TABS[number];

const STATUS_COLORS: Record<string, string> = {
  draft:     'bg-gray-100 text-gray-600',
  sent:      'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-600',
  paid:      'bg-purple-100 text-purple-700',
};

function fmtCurrency(n: number | undefined | null): string {
  if (n == null) return '—';
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2 });
}

function fmtDate(d: string): string {
  try { return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return d; }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FinancePurchaseOrdersTab() {
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<StatusTab>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [pos, setPos] = useState<FinancePO[]>([]);
  const [counts, setCounts] = useState({ all: 0, draft: 0, sent: 0, completed: 0, cancelled: 0 });
  const [canSeeDollars, setCanSeeDollars] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const [showNewPO, setShowNewPO] = useState(false);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(search), 350);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search]);

  const buildUrl = useCallback((cursor?: number) => {
    const params = new URLSearchParams({ status: activeTab, limit: '25' });
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo)   params.set('dateTo', dateTo);
    if (cursor)   params.set('cursor', String(cursor));
    return `/api/finance/purchase-orders?${params}`;
  }, [activeTab, debouncedSearch, dateFrom, dateTo]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(buildUrl());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ApiResponse = await res.json();
      setPos(data.purchaseOrders ?? []);
      setCounts(data.counts ?? { all: 0, draft: 0, sent: 0, completed: 0, cancelled: 0 });
      setCanSeeDollars(data.canSeeDollars ?? true);
      setHasMore(data.hasMore ?? false);
      setNextCursor(data.nextCursor ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load purchase orders');
    } finally {
      setLoading(false);
    }
  }, [buildUrl]);

  useEffect(() => { load(); }, [load]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(buildUrl(nextCursor));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ApiResponse = await res.json();
      setPos((prev) => [...prev, ...(data.purchaseOrders ?? [])]);
      setHasMore(data.hasMore ?? false);
      setNextCursor(data.nextCursor ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load more');
    } finally {
      setLoadingMore(false);
    }
  };

  const handlePOCreated = (po: FinancePO) => {
    setShowNewPO(false);
    // Navigate to the job PO detail with return context
    navigate(`/jobs/${po.job_id}/purchase-orders/${po.id}?from=finance`);
  };

  const openPO = (po: FinancePO) => {
    navigate(`/jobs/${po.job_id}/purchase-orders/${po.id}?from=finance`);
  };

  const hasActiveFilters = dateFrom || dateTo;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search PO number, title, job…"
            className="w-full pl-8 pr-8 py-1.5 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X size={12} />
            </button>
          )}
        </div>

        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
            hasActiveFilters
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border text-muted-foreground hover:text-foreground hover:border-border'
          }`}
        >
          <Filter size={13} />
          Filters
          {hasActiveFilters && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
        </button>

        <button onClick={load} className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg border border-border transition-colors">
          <RefreshCw size={14} />
        </button>

        <button
          onClick={() => setShowNewPO(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors ml-auto"
        >
          <Plus size={14} />
          New Purchase Order
        </button>
      </div>

      {/* ── Filter panel ────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden border-b border-border shrink-0"
          >
            <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-muted/30">
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground whitespace-nowrap">From</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="text-sm border border-border rounded-lg px-2 py-1 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground whitespace-nowrap">To</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="text-sm border border-border rounded-lg px-2 py-1 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              {hasActiveFilters && (
                <button
                  onClick={() => { setDateFrom(''); setDateTo(''); }}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  <X size={11} /> Clear filters
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Status tabs ─────────────────────────────────────────────────────── */}
      <div className="flex border-b border-border shrink-0 overflow-x-auto">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
            {tab !== 'all' && counts[tab] > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                activeTab === tab ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
              }`}>
                {counts[tab]}
              </span>
            )}
            {tab === 'all' && counts.all > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                activeTab === tab ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
              }`}>
                {counts.all}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-4">
            <AlertCircle size={24} className="text-destructive" />
            <p className="text-sm text-muted-foreground">{error}</p>
            <button onClick={load} className="text-sm text-primary hover:underline">Try again</button>
          </div>
        )}

        {!loading && !error && pos.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-4">
            <FileText size={32} className="text-muted-foreground/40" />
            <p className="text-sm font-medium text-foreground">No purchase orders</p>
            <p className="text-xs text-muted-foreground">
              {debouncedSearch || hasActiveFilters
                ? 'No results match your filters.'
                : activeTab === 'all'
                  ? 'Create your first purchase order to get started.'
                  : `No ${activeTab} purchase orders.`}
            </p>
            {activeTab === 'all' && !debouncedSearch && !hasActiveFilters && (
              <button
                onClick={() => setShowNewPO(true)}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors mt-1"
              >
                <Plus size={14} /> New Purchase Order
              </button>
            )}
          </div>
        )}

        {!loading && !error && pos.length > 0 && (
          <>
            {/* Desktop table */}
            <div className="hidden md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">PO Number</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Title</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Job</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Contractor</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Date</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Status</th>
                    {canSeeDollars && (
                      <>
                        <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">Subtotal</th>
                        <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">GST</th>
                        <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">Total</th>
                      </>
                    )}
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {pos.map((po) => (
                    <tr
                      key={po.id}
                      onClick={() => openPO(po)}
                      className="border-b border-border hover:bg-muted/20 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-primary">{po.po_number}</td>
                      <td className="px-4 py-3 font-medium text-foreground max-w-[180px] truncate">{po.title}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {po.job_number ? `#${po.job_number}` : ''}{po.job_name ? ` ${po.job_name}` : ''}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs max-w-[140px] truncate">
                        {po.contractor_name ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{fmtDate(po.created_at)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[po.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {po.status.charAt(0).toUpperCase() + po.status.slice(1)}
                        </span>
                      </td>
                      {canSeeDollars && (
                        <>
                          <td className="px-4 py-3 text-right text-xs text-muted-foreground">{fmtCurrency(po.subtotal)}</td>
                          <td className="px-4 py-3 text-right text-xs text-muted-foreground">{fmtCurrency(po.gst)}</td>
                          <td className="px-4 py-3 text-right text-sm font-semibold text-foreground">{fmtCurrency(po.total)}</td>
                        </>
                      )}
                      <td className="px-2 py-3 text-muted-foreground">
                        <ChevronRight size={14} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-border">
              {pos.map((po) => (
                <button
                  key={po.id}
                  onClick={() => openPO(po)}
                  className="w-full text-left px-4 py-3.5 hover:bg-muted/20 transition-colors flex items-start gap-3"
                >
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <FileText size={14} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-mono text-xs font-semibold text-primary">{po.po_number}</span>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[po.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {po.status.charAt(0).toUpperCase() + po.status.slice(1)}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-foreground truncate">{po.title}</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {po.job_number ? `#${po.job_number} ` : ''}{po.job_name ?? ''}
                      {po.contractor_name ? ` · ${po.contractor_name}` : ''}
                    </p>
                    {canSeeDollars && po.total != null && (
                      <p className="text-xs font-semibold text-foreground mt-1">{fmtCurrency(po.total)}</p>
                    )}
                  </div>
                  <ChevronRight size={14} className="text-muted-foreground shrink-0 mt-1" />
                </button>
              ))}
            </div>

            {/* Load more */}
            {hasMore && (
              <div className="flex justify-center py-4">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg transition-colors disabled:opacity-50"
                >
                  {loadingMore ? <Loader2 size={14} className="animate-spin" /> : null}
                  Load more
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── New PO Sheet ─────────────────────────────────────────────────────── */}
      {showNewPO && (
        <NewPOSheet
          onClose={() => setShowNewPO(false)}
          onCreated={handlePOCreated}
        />
      )}
    </div>
  );
}
