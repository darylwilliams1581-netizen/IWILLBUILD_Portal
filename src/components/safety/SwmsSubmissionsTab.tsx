/**
 * SwmsSubmissionsTab
 *
 * Displays the company-scoped SWMS sign-off register.
 * One row per worker acknowledgement — two workers signing the same SWMS
 * produce two rows.
 *
 * Data source: GET /api/safety/swms-submissions
 * Permission: owner / admin / permAdmin only (enforced server-side).
 * Company isolation is enforced server-side.
 *
 * A job SWMS with no sign-offs does not appear here.
 * Detail links are only rendered when a valid job_swms_id is present.
 *
 * Pagination: cursor-based, Load More control.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Search, Loader2, AlertCircle, CheckCircle2, User,
  Building2, HardHat, Calendar, Hash, ChevronDown,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SwmsSubmission {
  id: number;
  worker_name: string;
  company_name: string | null;
  role: string | null;
  signed_at: string;
  job_swms_id: number;
  swms_title: string | null;
  job_id: number | null;
  job_name: string | null;
  job_number: string | null;
}

interface SubmissionsResponse {
  submissions: SwmsSubmission[];
  hasMore: boolean;
  nextCursor: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-AU', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SwmsSubmissionsTab() {
  const [submissions, setSubmissions] = useState<SwmsSubmission[]>([]);
  const [loading, setLoading]         = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [fetchError, setFetchError]   = useState<string | null>(null);
  const [search, setSearch]           = useState('');
  const [hasMore, setHasMore]         = useState(false);
  const [nextCursor, setNextCursor]   = useState<string | null>(null);

  const fetchPage = useCallback(async (cursor: string | null, append: boolean) => {
    const url = cursor
      ? `/api/safety/swms-submissions?cursor=${encodeURIComponent(cursor)}`
      : '/api/safety/swms-submissions';

    const r = await fetch(url, { credentials: 'include' });
    if (!r.ok) {
      if (r.status === 403) throw new Error('You do not have permission to view submissions.');
      throw new Error(`HTTP ${r.status}`);
    }
    const d = await r.json() as SubmissionsResponse;
    setSubmissions((prev) => append ? [...prev, ...(d.submissions ?? [])] : (d.submissions ?? []));
    setHasMore(d.hasMore ?? false);
    setNextCursor(d.nextCursor ?? null);
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchPage(null, false)
      .catch((err) => setFetchError(err instanceof Error ? err.message : 'Failed to load SWMS submissions.'))
      .finally(() => setLoading(false));
  }, [fetchPage]);

  async function handleLoadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      await fetchPage(nextCursor, true);
    } catch {
      // silently ignore load-more errors; user can retry
    } finally {
      setLoadingMore(false);
    }
  }

  const q = search.toLowerCase();
  const filtered = submissions.filter((s) => {
    if (!q) return true;
    return (
      s.worker_name.toLowerCase().includes(q) ||
      (s.swms_title ?? '').toLowerCase().includes(q) ||
      (s.job_name ?? '').toLowerCase().includes(q) ||
      (s.job_number ?? '').toLowerCase().includes(q)
    );
  });

  const hasResults = !loading && !fetchError && filtered.length > 0;
  const isEmpty    = !loading && !fetchError && submissions.length === 0;
  const noMatch    = !loading && !fetchError && submissions.length > 0 && filtered.length === 0;

  return (
    <div className="flex flex-col gap-4">

      {/* Search bar */}
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search worker, SWMS or job…"
          aria-label="Search submissions"
          className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
        />
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16" data-testid="submissions-loading">
          <Loader2 size={22} className="animate-spin text-primary" />
        </div>
      )}

      {/* Error */}
      {!loading && fetchError && (
        <div
          className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700"
          data-testid="submissions-error"
        >
          <AlertCircle size={14} className="shrink-0" />
          {fetchError}
        </div>
      )}

      {/* Empty — no sign-offs at all */}
      {isEmpty && (
        <div
          className="flex flex-col items-center justify-center py-16 text-center"
          data-testid="submissions-empty"
        >
          <div className="w-14 h-14 bg-violet-50 rounded-xl flex items-center justify-center mb-4">
            <CheckCircle2 size={24} className="text-primary" />
          </div>
          <p className="font-heading font-bold text-slate-700 mb-1">No submissions yet</p>
          <p className="text-sm text-slate-400 max-w-xs">
            Sign-offs appear here once workers acknowledge a SWMS via the sign-off link.
          </p>
        </div>
      )}

      {/* No search results */}
      {noMatch && (
        <div
          className="flex flex-col items-center justify-center py-12 text-center"
          data-testid="submissions-no-results"
        >
          <Search size={20} className="text-slate-300 mb-3" />
          <p className="text-sm font-semibold text-slate-600">No results for "{search}"</p>
          <p className="text-xs text-slate-400 mt-1">Try a different worker name, SWMS title or job.</p>
        </div>
      )}

      {/* Table — desktop */}
      {hasResults && (
        <>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm" data-testid="submissions-table">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">Worker</th>
                  <th className="px-4 py-3 text-left">SWMS</th>
                  <th className="px-4 py-3 text-left">Job</th>
                  <th className="px-4 py-3 text-left">Company</th>
                  <th className="px-4 py-3 text-left">Role</th>
                  <th className="px-4 py-3 text-left">Signed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50 transition-colors" data-testid="submission-row">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-violet-50 rounded-full flex items-center justify-center shrink-0">
                          <User size={13} className="text-primary" />
                        </div>
                        <span className="font-semibold text-slate-800">{s.worker_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-slate-700">{s.swms_title ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="text-slate-700">{s.job_name ?? '—'}</span>
                        {s.job_number && (
                          <span className="text-xs text-slate-400 flex items-center gap-1">
                            <Hash size={9} />{s.job_number}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{s.company_name ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{s.role ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                      {fmtDateTime(s.signed_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden flex flex-col gap-2" data-testid="submissions-cards">
            {filtered.map((s) => (
              <div
                key={s.id}
                className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-2"
                data-testid="submission-row"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                  <span className="font-bold text-sm text-slate-800">{s.worker_name}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-500">
                  {s.swms_title && (
                    <div className="col-span-2 flex items-center gap-1">
                      <HardHat size={11} className="text-slate-400 shrink-0" />
                      <span className="truncate">{s.swms_title}</span>
                    </div>
                  )}
                  {s.job_name && (
                    <div className="flex items-center gap-1">
                      <Building2 size={11} className="text-slate-400 shrink-0" />
                      <span className="truncate">{s.job_name}</span>
                    </div>
                  )}
                  {s.job_number && (
                    <div className="flex items-center gap-1">
                      <Hash size={11} className="text-slate-400 shrink-0" />
                      <span>{s.job_number}</span>
                    </div>
                  )}
                  {s.company_name && <span>{s.company_name}</span>}
                  {s.role && <span>{s.role}</span>}
                  <div className="col-span-2 flex items-center gap-1 text-slate-400">
                    <Calendar size={10} />
                    <span>{fmtDateTime(s.signed_at)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Row count + Load More */}
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-400">
              {filtered.length} submission{filtered.length !== 1 ? 's' : ''}
              {search ? ` matching "${search}"` : ''}
            </p>
            {hasMore && !search && (
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                data-testid="load-more-btn"
                className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                {loadingMore
                  ? <Loader2 size={12} className="animate-spin" />
                  : <ChevronDown size={12} />}
                Load more
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
