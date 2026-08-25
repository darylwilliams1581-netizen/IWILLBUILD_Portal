/**
 * FinanceTimesheetsTab
 * Timesheet list inside the Finance workspace.
 *
 * Features:
 *  - Status tabs: All | Draft | Submitted | Approved | Rejected
 *  - Status counts
 *  - Search (employee name, job)
 *  - Cursor-based pagination
 *  - + New Timesheet → NewTimesheetSheet
 *  - Row actions: view/edit, approve, reject, delete
 *  - Admins see all employees; staff see only their own
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, Search, X, Loader2, AlertCircle, RefreshCw,
  Clock, ChevronRight, CheckCircle2, XCircle, Trash2,
  FileText, RotateCcw,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import NewTimesheetSheet from './NewTimesheetSheet';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Timesheet {
  id: number;
  profile_id: number;
  job_id: number | null;
  week_ending: string;
  status: string;
  notes: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  employee_name: string;
  employee_email: string;
  job_number: string | null;
  job_name: string | null;
  total_hours: number;
}

interface ApiResponse {
  timesheets: Timesheet[];
  hasMore: boolean;
  nextCursor: number | null;
  counts: Record<string, number>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_TABS = ['all', 'draft', 'submitted', 'approved', 'rejected'] as const;
type StatusTab = typeof STATUS_TABS[number];

const STATUS_COLORS: Record<string, string> = {
  draft:     'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  submitted: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  approved:  'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  rejected:  'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300',
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft', submitted: 'Submitted', approved: 'Approved', rejected: 'Rejected',
};

function fmtDate(d: string): string {
  try { return new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return d; }
}

// ── Reject dialog ─────────────────────────────────────────────────────────────

function RejectDialog({
  open, onClose, onConfirm, loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  loading: boolean;
}) {
  const [reason, setReason] = useState('');
  useEffect(() => { if (!open) setReason(''); }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-background rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
        <h3 className="text-base font-bold text-foreground">Reject timesheet</h3>
        <div>
          <label className="block text-xs font-semibold text-muted-foreground mb-1">
            Reason (optional)
          </label>
          <textarea
            rows={3}
            placeholder="Let the employee know why…"
            value={reason}
            onChange={e => setReason(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 h-10 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reason)}
            disabled={loading}
            className="flex-1 h-10 rounded-xl bg-destructive text-destructive-foreground text-sm font-semibold hover:bg-destructive/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function FinanceTimesheetsTab() {
  const [activeTab, setActiveTab] = useState<StatusTab>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSheet, setShowSheet] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [rejectTarget, setRejectTarget] = useState<number | null>(null);
  const [rejectLoading, setRejectLoading] = useState(false);
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search
  useEffect(() => {
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => setDebouncedSearch(search), 350);
    return () => { if (searchRef.current) clearTimeout(searchRef.current); };
  }, [search]);

  const buildUrl = useCallback((cursor?: number | null) => {
    const p = new URLSearchParams({ status: activeTab });
    if (debouncedSearch) p.set('search', debouncedSearch);
    if (cursor) p.set('cursor', String(cursor));
    return `/api/finance/timesheets?${p}`;
  }, [activeTab, debouncedSearch]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(buildUrl(), { credentials: 'include' });
      if (!r.ok) throw new Error('Failed to load timesheets');
      const data: ApiResponse = await r.json();
      setTimesheets(data.timesheets);
      setCounts(data.counts ?? {});
      setHasMore(data.hasMore);
      setNextCursor(data.nextCursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error loading timesheets');
    } finally {
      setLoading(false);
    }
  }, [buildUrl]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const r = await fetch(buildUrl(nextCursor), { credentials: 'include' });
      if (!r.ok) throw new Error('Failed to load more');
      const data: ApiResponse = await r.json();
      setTimesheets(prev => [...prev, ...data.timesheets]);
      setHasMore(data.hasMore);
      setNextCursor(data.nextCursor);
    } catch {
      // silent
    } finally {
      setLoadingMore(false);
    }
  }, [buildUrl, nextCursor, loadingMore]);

  useEffect(() => { load(); }, [load]);

  async function transition(id: number, status: string, rejectionReason?: string) {
    setActionLoading(id);
    try {
      const r = await fetch(`/api/finance/timesheets/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status, rejectionReason: rejectionReason ?? null }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? 'Failed');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setActionLoading(null);
    }
  }

  async function deleteTs(id: number) {
    if (!confirm('Delete this draft timesheet?')) return;
    setActionLoading(id);
    try {
      const r = await fetch(`/api/finance/timesheets/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!r.ok) {
        const d = await r.json();
        throw new Error(d.error ?? 'Failed to delete');
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setActionLoading(null);
    }
  }

  function openEdit(id: number) {
    setEditId(id);
    setShowSheet(true);
  }

  function onSaved(_id: number, _submitted: boolean) {
    setShowSheet(false);
    setEditId(null);
    load();
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search employee or job…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full h-9 pl-9 pr-8 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X size={13} />
            </button>
          )}
        </div>
        <button
          onClick={load}
          className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <RefreshCw size={14} />
        </button>
        <button
          onClick={() => { setEditId(null); setShowSheet(true); }}
          className="flex items-center gap-1.5 h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <Plus size={14} />
          <span className="hidden sm:inline">New timesheet</span>
        </button>
      </div>

      {/* Status tabs */}
      <div className="flex border-b border-border shrink-0 overflow-x-auto">
        {STATUS_TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
          >
            {tab === 'all' ? 'All' : STATUS_LABELS[tab]}
            {counts[tab] != null && counts[tab] > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                activeTab === tab ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
              }`}>
                {counts[tab]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Error banner */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-2 px-4 py-2.5 bg-destructive/10 text-destructive text-sm shrink-0"
          >
            <AlertCircle size={14} />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)}><X size={13} /></button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 size={20} className="animate-spin mr-2" />
            Loading timesheets…
          </div>
        ) : timesheets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-6">
            <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
              <Clock size={22} className="text-muted-foreground" />
            </div>
            <p className="text-sm font-semibold text-foreground mb-1">No timesheets yet</p>
            <p className="text-xs text-muted-foreground mb-4">
              {activeTab === 'all'
                ? 'Employees can fill out and submit timesheets here.'
                : `No ${STATUS_LABELS[activeTab]?.toLowerCase()} timesheets.`}
            </p>
            {activeTab === 'all' && (
              <button
                onClick={() => { setEditId(null); setShowSheet(true); }}
                className="flex items-center gap-1.5 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                <Plus size={14} />
                New timesheet
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {timesheets.map(ts => (
              <motion.div
                key={ts.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-start gap-3 px-4 py-3.5 hover:bg-muted/30 transition-colors"
              >
                {/* Icon */}
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <FileText size={16} className="text-primary" />
                </div>

                {/* Main info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-foreground truncate">
                      {ts.employee_name}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[ts.status] ?? 'bg-muted text-muted-foreground'}`}>
                      {STATUS_LABELS[ts.status] ?? ts.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    <span className="text-xs text-muted-foreground">
                      Week ending {fmtDate(ts.week_ending)}
                    </span>
                    {ts.job_name && (
                      <span className="text-xs text-muted-foreground truncate">
                        {ts.job_number ? `${ts.job_number} — ` : ''}{ts.job_name}
                      </span>
                    )}
                    <span className="text-xs font-semibold text-foreground">
                      {Number(ts.total_hours).toFixed(2)} hrs
                    </span>
                  </div>
                  {ts.rejection_reason && (
                    <p className="text-xs text-destructive mt-1 truncate">
                      Rejected: {ts.rejection_reason}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {actionLoading === ts.id ? (
                    <Loader2 size={16} className="animate-spin text-muted-foreground" />
                  ) : (
                    <>
                      {/* Edit draft / rejected */}
                      {(ts.status === 'draft' || ts.status === 'rejected') && (
                        <button
                          onClick={() => openEdit(ts.id)}
                          title="Edit"
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        >
                          <ChevronRight size={15} />
                        </button>
                      )}

                      {/* Submit draft */}
                      {ts.status === 'draft' && (
                        <button
                          onClick={() => transition(ts.id, 'submitted')}
                          title="Submit to office"
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                        >
                          <ChevronRight size={15} />
                        </button>
                      )}

                      {/* Approve submitted */}
                      {ts.status === 'submitted' && (
                        <>
                          <button
                            onClick={() => transition(ts.id, 'approved')}
                            title="Approve"
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
                          >
                            <CheckCircle2 size={15} />
                          </button>
                          <button
                            onClick={() => setRejectTarget(ts.id)}
                            title="Reject"
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-destructive hover:bg-destructive/10 transition-colors"
                          >
                            <XCircle size={15} />
                          </button>
                        </>
                      )}

                      {/* Reopen rejected → draft */}
                      {ts.status === 'rejected' && (
                        <button
                          onClick={() => transition(ts.id, 'draft')}
                          title="Reopen as draft"
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        >
                          <RotateCcw size={14} />
                        </button>
                      )}

                      {/* Delete draft */}
                      {ts.status === 'draft' && (
                        <button
                          onClick={() => deleteTs(ts.id)}
                          title="Delete"
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </motion.div>
            ))}

            {/* Load more */}
            {hasMore && (
              <div className="flex justify-center py-4">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="flex items-center gap-2 h-9 px-4 rounded-lg border border-border text-sm font-semibold text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                >
                  {loadingMore ? <Loader2 size={14} className="animate-spin" /> : null}
                  Load more
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* New / Edit sheet */}
      <NewTimesheetSheet
        open={showSheet}
        onClose={() => { setShowSheet(false); setEditId(null); }}
        onSaved={onSaved}
        editId={editId}
      />

      {/* Reject dialog */}
      <RejectDialog
        open={rejectTarget !== null}
        onClose={() => setRejectTarget(null)}
        loading={rejectLoading}
        onConfirm={async (reason) => {
          if (!rejectTarget) return;
          setRejectLoading(true);
          await transition(rejectTarget, 'rejected', reason);
          setRejectLoading(false);
          setRejectTarget(null);
        }}
      />
    </div>
  );
}
