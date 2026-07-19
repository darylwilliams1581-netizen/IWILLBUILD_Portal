/**
 * /jobs/:id/costs — Full-screen Job Cost Ledger page.
 * Mirrors the job-delays-page shell pattern with emerald theme.
 * Header has a + Add Entry button that opens the AddEntryModal inside JobCosts.
 */
import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, Loader2, Plus, House } from 'lucide-react';
import { Helmet } from '@dr.pogodin/react-helmet';
import JobCosts from '@/components/job/JobCosts';

interface Job {
  id: number;
  name: string;
  jobNumber?: string | null;
}

export default function JobCostsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const jobId = Number(id);

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);

  // Ref to trigger the Add Entry modal inside JobCosts
  const addEntryRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    fetch(`/api/jobs/${id}`, { credentials: 'include' })
      .then(async r => {
        const ct = r.headers.get('content-type') ?? '';
        if (!ct.includes('application/json')) { setLoading(false); return; }
        const data = await r.json() as { job?: Job } | Job;
        const j = data && typeof data === 'object' && 'job' in data ? data.job : data as Job;
        setJob(j ?? null);
      })
      .catch(() => setJob(null))
      .finally(() => setLoading(false));
  }, [id]);

  const title = job ? `${job.name} — Job Costs` : 'Job Costs';

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Helmet>
        <title>{title} — IWILLBUILD</title>
        <meta name="description" content="View and manage cost ledger entries for this job." />
        <meta name="robots" content="noindex, nofollow" />
        <link rel="canonical" href={`https://iwillbuild.com/jobs/${id}/costs`} />
      </Helmet>

      {/* ── Desktop top bar ── */}
      <div
        className="hidden md:flex bg-white border-b border-gray-100 px-4 py-3 items-center gap-3 shrink-0"
        style={{ boxShadow: '0 1px 0 rgba(0,0,0,0.05)' }}
      >
        <button
          onClick={() => navigate(`/jobs/${id}`)}
          className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-gray-200 active:bg-gray-300 transition-colors shrink-0"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
            <BookOpen size={15} className="text-emerald-600" />
          </div>
          <div className="min-w-0">
            {loading ? (
              <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
            ) : (
              <>
                <div className="flex items-center gap-1 text-xs text-gray-400 leading-tight">
                  <button onClick={() => navigate('/home')} className="hover:text-orange-500 transition-colors flex items-center" title="Dashboard"><House size={11} /></button>
                  <span>/</span>
                  <button onClick={() => navigate('/jobs')} className="hover:text-orange-500 transition-colors">Jobs</button>
                  <span>/</span>
                  <button onClick={() => navigate(`/jobs/${id}`)} className="hover:text-orange-500 transition-colors truncate max-w-[120px]">{job?.name ?? '...'}</button>
                  <span>/</span>
                  <span className="text-gray-600 font-medium">Costs</span>
                </div>
                <h1 className="text-gray-900 font-bold text-sm leading-tight truncate">
                  {job?.name ?? 'Job Costs'}
                </h1>
              </>
            )}
          </div>
        </div>
        <button
          onClick={() => addEntryRef.current?.()}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors"
        >
          <Plus size={13} />
          Add Entry
        </button>
      </div>

      {/* ── Mobile: back arrow floats top-left ── */}
      <button
        onClick={() => navigate(`/jobs/${id}`)}
        className="md:hidden fixed top-3 left-3 z-20 w-9 h-9 rounded-xl bg-white/90 backdrop-blur-sm shadow-sm border border-gray-100 flex items-center justify-center text-gray-600 active:bg-gray-100 transition-colors"
        aria-label="Back"
      >
        <ArrowLeft size={18} />
      </button>
      {/* ── Mobile: Dashboard button ── */}
      <button
        onClick={() => navigate('/home')}
        className="md:hidden fixed top-3 left-14 z-20 w-9 h-9 rounded-xl bg-orange-50/90 backdrop-blur-sm shadow-sm border border-orange-200 flex items-center justify-center text-orange-500 active:bg-orange-100 transition-colors"
        aria-label="Dashboard"
      >
        <House size={16} />
      </button>

      {/* ── Mobile: + Add Entry floats top-right ── */}
      <button
        onClick={() => addEntryRef.current?.()}
        className="md:hidden fixed top-3 right-3 z-20 h-9 px-3 rounded-xl bg-emerald-500 shadow-sm flex items-center gap-1.5 text-xs font-bold text-white active:bg-emerald-600 transition-colors"
        aria-label="Add Entry"
      >
        <Plus size={13} />
        Add Entry
      </button>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-emerald-400" />
          </div>
        ) : (
          <div className="px-4 py-4 pb-24 md:pb-6 max-w-5xl mx-auto w-full">
            <JobCosts jobId={jobId} onRegisterAddEntry={(fn) => { addEntryRef.current = fn; }} />
          </div>
        )}
      </div>

      {/* ── Mobile bottom bar ── */}
      <div
        className="md:hidden fixed bottom-0 inset-x-0 z-10 bg-white border-t border-gray-100"
        style={{ boxShadow: '0 -1px 0 rgba(0,0,0,0.05)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
            <BookOpen size={15} className="text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            {loading ? (
              <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
            ) : (
              <>
                <p className="text-gray-900 font-bold text-sm leading-tight truncate">
                  {job?.name ?? 'Job Costs'}
                </p>
                {job?.jobNumber && (
                  <p className="text-gray-400 text-xs font-mono leading-tight">{job.jobNumber}</p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
