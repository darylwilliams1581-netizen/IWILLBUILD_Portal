/**
 * /ledger — Finance → Ledger job picker.
 *
 * The Job Cost Ledger is job-scoped (GET /api/jobs/:id/ledger requires a job_id).
 * This page is a thin job-picker shell: fetch the company's jobs list, let the
 * user search and select a job, then navigate to /jobs/:id/costs where the full
 * JobCosts component renders.
 *
 * No new API, no second Ledger implementation — reuses the existing route.
 */
import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  BookOpen, Search, ArrowRight, Loader2, AlertCircle,
  HardHat, Home, ChevronRight,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Job {
  id: number;
  job_number?: string | null;
  jobNumber?: string | null;
  name: string;
  client?: string | null;
  address?: string | null;
  status?: string | null;
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  Active:     'bg-emerald-100 text-emerald-800 border-emerald-200',
  New:        'bg-blue-100 text-blue-800 border-blue-200',
  Completed:  'bg-slate-100 text-slate-600 border-slate-200',
  'On Hold':  'bg-amber-100 text-amber-800 border-amber-200',
  Cancelled:  'bg-red-100 text-red-700 border-red-200',
};

function StatusBadge({ status }: { status?: string | null }) {
  if (!status) return null;
  const cls = STATUS_COLORS[status] ?? 'bg-muted text-muted-foreground border-border';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold ${cls}`}>
      {status}
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function LedgerPage() {
  const navigate = useNavigate();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    fetch('/api/jobs', { credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) throw new Error('Failed to load jobs');
        const data = await r.json() as { jobs?: Job[] } | Job[];
        const list = Array.isArray(data) ? data : (data as { jobs?: Job[] }).jobs ?? [];
        setJobs(list);
      })
      .catch(() => setError('Could not load jobs. Please try again.'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter((j) => {
      const num = (j.jobNumber ?? j.job_number ?? '').toLowerCase();
      return (
        j.name.toLowerCase().includes(q) ||
        num.includes(q) ||
        (j.client ?? '').toLowerCase().includes(q) ||
        (j.address ?? '').toLowerCase().includes(q)
      );
    });
  }, [jobs, query]);

  function openLedger(job: Job) {
    navigate(`/jobs/${job.id}/costs`);
  }

  const jobNum = (j: Job) => j.jobNumber ?? j.job_number ?? null;

  return (
    <div className="flex-1 bg-gray-50 flex flex-col overflow-hidden">
      <Helmet>
        <title>Job Cost Ledger — IWILLBUILD</title>
        <meta name="description" content="Select a job to view its cost ledger." />
        <meta name="robots" content="noindex, nofollow" />
        <link rel="canonical" href="https://iwillbuild.com/ledger" />
      </Helmet>

      {/* ── Desktop top bar ── */}
      <div className="hidden md:flex bg-white border-b border-gray-100 px-4 py-3 items-center gap-3 shrink-0 shadow-[0_1px_0_hsl(var(--border))]">
        <button
          onClick={() => navigate('/home')}
          className="w-9 h-9 rounded-xl bg-violet-500 flex items-center justify-center text-white hover:bg-violet-700 transition-colors shrink-0"
          title="Dashboard"
        >
          <Home size={18} />
        </button>

        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <button onClick={() => navigate('/invoices')} className="hover:text-violet-600 transition-colors font-medium">Finance</button>
          <ChevronRight size={12} className="text-gray-300" />
          <span className="text-gray-600 font-semibold">Ledger</span>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-2 text-xs text-gray-400">
          <BookOpen size={14} className="text-emerald-500" />
          <span className="font-semibold text-gray-600">Job Cost Ledger</span>
        </div>
      </div>

      {/* ── Mobile top bar ── */}
      <div
        className="md:hidden bg-white border-b border-gray-100 shrink-0"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)' }}
      >
        <div className="flex items-center gap-3 px-4 pb-3">
          <button
            onClick={() => navigate('/home')}
            className="w-9 h-9 rounded-xl bg-violet-500 flex items-center justify-center text-white shrink-0"
          >
            <Home size={16} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-gray-900 font-bold text-sm leading-tight">Job Cost Ledger</h1>
            <p className="text-gray-400 text-xs leading-tight">Select a job to view its ledger</p>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto w-full px-4 py-6 pb-24 md:pb-8">

          {/* Page header */}
          <div className="flex items-center gap-3 mb-5">
            <div className="w-11 h-11 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
              <BookOpen size={20} className="text-emerald-600" />
            </div>
            <div>
              <h2 className="font-heading font-bold text-lg text-foreground leading-tight">Job Cost Ledger</h2>
              <p className="text-xs text-muted-foreground leading-tight mt-0.5">
                Select a job to view its cost entries, totals, and export options.
              </p>
            </div>
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by job name, number or client…"
              className="w-full pl-9 pr-4 py-2.5 border border-border rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400"
              autoComplete="off"
            />
          </div>

          {/* States */}
          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="animate-spin text-emerald-400" />
            </div>
          )}

          {!loading && error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
              <AlertCircle size={15} className="shrink-0" />
              {error}
            </div>
          )}

          {!loading && !error && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-3">
                <HardHat size={20} className="text-muted-foreground" />
              </div>
              <p className="text-sm font-semibold text-foreground mb-1">
                {query ? 'No jobs match your search' : 'No jobs found'}
              </p>
              <p className="text-xs text-muted-foreground max-w-xs">
                {query
                  ? 'Try a different name, number or client.'
                  : 'Create a job first, then return here to log costs.'}
              </p>
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="mt-3 text-xs text-emerald-600 hover:text-emerald-700 font-semibold"
                >
                  Clear search
                </button>
              )}
            </div>
          )}

          {/* Job list */}
          {!loading && !error && filtered.length > 0 && (
            <div className="flex flex-col gap-2">
              {filtered.map((job) => (
                <button
                  key={job.id}
                  onClick={() => openLedger(job)}
                  className="w-full text-left bg-white border border-border rounded-xl px-4 py-3.5 hover:border-emerald-300 hover:bg-emerald-50/30 active:bg-emerald-50 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    {/* Icon */}
                    <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0 group-hover:bg-emerald-200 transition-colors">
                      <BookOpen size={15} className="text-emerald-600" />
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-foreground truncate">{job.name}</span>
                        {jobNum(job) && (
                          <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                            #{jobNum(job)}
                          </span>
                        )}
                        <StatusBadge status={job.status} />
                      </div>
                      {(job.client || job.address) && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {[job.client, job.address].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>

                    {/* Arrow */}
                    <ArrowRight
                      size={16}
                      className="text-muted-foreground group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all shrink-0"
                    />
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Count footer */}
          {!loading && !error && jobs.length > 0 && (
            <p className="text-center text-xs text-muted-foreground mt-4">
              {filtered.length === jobs.length
                ? `${jobs.length} job${jobs.length !== 1 ? 's' : ''}`
                : `${filtered.length} of ${jobs.length} jobs`}
            </p>
          )}
        </div>
      </div>

      {/* ── Mobile bottom bar ── */}
      <div
        className="md:hidden fixed bottom-0 inset-x-0 z-10 bg-white border-t border-gray-100"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center gap-2 px-3 py-2">
          <button
            onClick={() => navigate('/home')}
            className="w-10 h-10 rounded-xl bg-violet-50 border border-violet-200 flex items-center justify-center text-violet-600 active:bg-violet-100 transition-colors touch-manipulation shrink-0"
          >
            <Home size={16} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-gray-900 font-bold text-sm leading-tight">Job Cost Ledger</p>
            <p className="text-gray-400 text-xs leading-tight">Select a job to view costs</p>
          </div>
        </div>
      </div>
    </div>
  );
}
