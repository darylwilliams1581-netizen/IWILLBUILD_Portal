/**
 * /signin-history
 *
 * Unified sign-in / sign-out history across all jobs and fleet assets.
 * Filterable by date range, job, fleet asset, actor type, source.
 * Supports CSV export.
 */
import { useState, useEffect, useCallback } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  LogIn, LogOut, Loader2, AlertCircle, RefreshCw,
  Download, Filter, X, ChevronLeft, ChevronRight,
  Truck, HardHat, Clock, Users,
} from 'lucide-react';

interface HistoryRow {
  id: string;
  record_type: 'job_attendance' | 'fleet_usage';
  action: string;
  source: string;
  actor_type: string;
  user_name: string | null;
  user_email: string | null;
  job_id: number | null;
  job_name: string | null;
  fleet_id: number | null;
  fleet_name: string | null;
  notes: string | null;
  created_at: string;
  signed_out_at: string | null;
  duration_minutes: number | null;
}

interface HistoryResponse {
  ok: boolean;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  rows: HistoryRow[];
}

const ACTOR_LABELS: Record<string, string> = {
  employee:        'Employee',
  contractor:      'Contractor',
  consultant:      'Consultant',
  delivery_driver: 'Delivery driver',
  guest:           'Guest',
};

const SOURCE_LABELS: Record<string, string> = {
  portal:              'Portal',
  qr:                  'QR scan',
  manual:              'Manual',
  supervisor_override: 'Supervisor override',
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-AU', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtDuration(mins: number | null) {
  if (mins === null || mins === undefined) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export default function SignInHistoryPage() {
  const [data, setData]       = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  // Filters
  const [dateFrom, setDateFrom]   = useState('');
  const [dateTo, setDateTo]       = useState('');
  const [actorType, setActorType] = useState('');
  const [source, setSource]       = useState('');
  const [page, setPage]           = useState(1);
  const [showFilters, setShowFilters] = useState(false);

  const buildQuery = useCallback(() => {
    const p = new URLSearchParams();
    p.set('page', String(page));
    p.set('pageSize', '50');
    if (dateFrom)  p.set('dateFrom', dateFrom);
    if (dateTo)    p.set('dateTo', dateTo);
    if (actorType) p.set('actorType', actorType);
    if (source)    p.set('source', source);
    return p.toString();
  }, [page, dateFrom, dateTo, actorType, source]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/signin-history?${buildQuery()}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load history');
      setData(await res.json() as HistoryResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => { void load(); }, [load]);

  function applyFilters() {
    setPage(1);
    setShowFilters(false);
    void load();
  }

  function clearFilters() {
    setDateFrom(''); setDateTo(''); setActorType(''); setSource('');
    setPage(1);
  }

  const hasFilters = !!(dateFrom || dateTo || actorType || source);

  function buildExportUrl() {
    const p = new URLSearchParams();
    p.set('format', 'csv');
    if (dateFrom)  p.set('dateFrom', dateFrom);
    if (dateTo)    p.set('dateTo', dateTo);
    if (actorType) p.set('actorType', actorType);
    if (source)    p.set('source', source);
    return `/api/signin-history?${p.toString()}`;
  }

  return (
    <>
      <Helmet>
        <title>Sign-In History — IWILLBUILD Portal</title>
        <meta name="description" content="Unified sign-in and sign-out history across all jobs and fleet assets for your company." />
        <link rel="canonical" href="https://iwillbuild.com/signin-history" />
        <meta name="robots" content="noindex, nofollow" />
        <meta property="og:title" content="Sign-In History — IWILLBUILD Portal" />
        <meta property="og:description" content="Unified sign-in and sign-out history across all jobs and fleet assets for your company." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://iwillbuild.com/signin-history" />
        <meta property="og:image" content="https://iwillbuild.com/airo-assets/images/pages/home/og-image" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Sign-In History — IWILLBUILD Portal" />
        <meta name="twitter:description" content="Unified sign-in and sign-out history across all jobs and fleet assets for your company." />
        <meta name="twitter:image" content="https://iwillbuild.com/airo-assets/images/pages/home/og-image" />
      </Helmet>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">

        {/* ── Page header ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-black text-slate-800 flex items-center gap-2">
              <Users size={20} className="text-orange-500" />
              Sign-In History
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              All job attendance and fleet sign-on/off records across your company.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg border transition-colors ${
                hasFilters
                  ? 'bg-orange-50 border-orange-300 text-orange-700'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Filter size={14} />
              Filters
              {hasFilters && (
                <span className="w-4 h-4 rounded-full bg-orange-500 text-white text-[10px] font-black flex items-center justify-center">
                  !
                </span>
              )}
            </button>

            <a
              href={buildExportUrl()}
              download
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
            >
              <Download size={14} />
              Export CSV
            </a>

            <button
              onClick={() => void load()}
              disabled={loading}
              className="p-2 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
              title="Refresh"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* ── Filter panel ────────────────────────────────────────────────── */}
        {showFilters && (
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-slate-700">Filter records</p>
              <button onClick={() => setShowFilters(false)} className="text-slate-600 hover:text-slate-800">
                <X size={15} />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Date from</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/30"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Date to</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/30"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Actor type</label>
                <select
                  value={actorType}
                  onChange={e => setActorType(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/30"
                >
                  <option value="">All types</option>
                  {Object.entries(ACTOR_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Source</label>
                <select
                  value={source}
                  onChange={e => setSource(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/30"
                >
                  <option value="">All sources</option>
                  {Object.entries(SOURCE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={applyFilters}
                className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-lg transition-colors"
              >
                Apply filters
              </button>
              {hasFilters && (
                <button
                  onClick={clearFilters}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Error ───────────────────────────────────────────────────────── */}
        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            <AlertCircle size={15} className="shrink-0" />
            {error}
          </div>
        )}

        {/* ── Table ───────────────────────────────────────────────────────── */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">

          {/* Summary bar */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
            <p className="text-xs text-slate-500">
              {loading ? 'Loading…' : `${data?.total ?? 0} record${(data?.total ?? 0) !== 1 ? 's' : ''}`}
            </p>
            {data && data.totalPages > 1 && (
              <div className="flex items-center gap-1 text-xs text-slate-500">
                <span>Page {data.page} of {data.totalPages}</span>
              </div>
            )}
          </div>

          {/* Loading skeleton */}
          {loading && (
            <div className="divide-y divide-slate-100">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
                  <div className="w-7 h-7 rounded-full bg-slate-100 shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-40 bg-slate-100 rounded" />
                    <div className="h-2.5 w-64 bg-slate-100 rounded" />
                  </div>
                  <div className="h-2.5 w-24 bg-slate-100 rounded" />
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!loading && (data?.rows ?? []).length === 0 && (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <Clock size={28} className="text-slate-300" />
              <p className="text-sm font-semibold text-slate-500">No records found</p>
              {hasFilters && (
                <p className="text-xs text-slate-400">Try adjusting your filters.</p>
              )}
            </div>
          )}

          {/* Rows */}
          {!loading && (data?.rows ?? []).length > 0 && (
            <div className="divide-y divide-slate-100">
              {data!.rows.map(row => {
                const isFleet = row.record_type === 'fleet_usage';
                const isSignIn = row.action === 'signin';

                return (
                  <div key={row.id} className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
                    {/* Icon */}
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                      isFleet
                        ? 'bg-blue-100'
                        : isSignIn ? 'bg-green-100' : 'bg-slate-100'
                    }`}>
                      {isFleet
                        ? <Truck size={13} className="text-blue-600" />
                        : isSignIn
                          ? <LogIn size={13} className="text-green-600" />
                          : <LogOut size={13} className="text-slate-500" />
                      }
                    </div>

                    {/* Main content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">
                        {row.user_name ?? row.user_email ?? 'Unknown user'}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                        <span className={`text-xs font-semibold ${
                          isFleet ? 'text-blue-600' : isSignIn ? 'text-green-600' : 'text-slate-500'
                        }`}>
                          {isFleet
                            ? (row.signed_out_at ? 'Fleet sign-off' : 'Fleet sign-on')
                            : isSignIn ? 'Signed in' : 'Signed out'
                          }
                        </span>
                        <span className="text-slate-300 text-xs">·</span>
                        {row.job_name && (
                          <>
                            <span className="text-xs text-slate-500 flex items-center gap-0.5">
                              <HardHat size={10} />
                              {row.job_name}
                            </span>
                            <span className="text-slate-300 text-xs">·</span>
                          </>
                        )}
                        {row.fleet_name && (
                          <>
                            <span className="text-xs text-slate-500 flex items-center gap-0.5">
                              <Truck size={10} />
                              {row.fleet_name}
                            </span>
                            <span className="text-slate-300 text-xs">·</span>
                          </>
                        )}
                        <span className="text-xs text-slate-400">
                          {ACTOR_LABELS[row.actor_type] ?? row.actor_type}
                        </span>
                        <span className="text-slate-300 text-xs">·</span>
                        <span className="text-xs text-slate-400">
                          {SOURCE_LABELS[row.source] ?? row.source}
                        </span>
                        {row.duration_minutes !== null && (
                          <>
                            <span className="text-slate-300 text-xs">·</span>
                            <span className="text-xs text-slate-400">
                              {fmtDuration(row.duration_minutes)}
                            </span>
                          </>
                        )}
                      </div>
                      {row.notes && (
                        <p className="text-xs text-slate-400 mt-0.5 italic truncate">{row.notes}</p>
                      )}
                    </div>

                    {/* Timestamp */}
                    <span className="text-xs text-slate-400 shrink-0 text-right">
                      {fmtDate(row.created_at)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {data && data.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200 disabled:opacity-40 rounded-lg transition-colors"
              >
                <ChevronLeft size={13} />
                Previous
              </button>
              <span className="text-xs text-slate-500">
                {page} / {data.totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(data.totalPages, p + 1))}
                disabled={page >= data.totalPages || loading}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200 disabled:opacity-40 rounded-lg transition-colors"
              >
                Next
                <ChevronRight size={13} />
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
