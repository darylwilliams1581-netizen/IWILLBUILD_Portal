/**
 * /jobs/:id/delays — Full-screen delays page for a job.
 * Mirrors the job-notes-page shell pattern.
 */
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, Loader2, Download, Home } from 'lucide-react';
import { Helmet } from '@dr.pogodin/react-helmet';
import JobDelays from '@/components/job/JobDelays';

interface Job {
  id: number;
  name: string;
  jobNumber?: string | null;
}

export default function JobDelaysPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const jobId = Number(id);

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

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

  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/jobs/${id}/delays/export-csv`, { credentials: 'include' });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `job-${id}-delays.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* silent */ } finally {
      setExporting(false);
    }
  };

  const title = job ? `${job.name} — Delays` : 'Job Delays';

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Helmet>
        <title>{title} — IWILLBUILD</title>
        <meta name="description" content="View and manage delay entries for this job." />
        <meta name="robots" content="noindex, nofollow" />
        <link rel="canonical" href={`https://iwillbuild.com/jobs/${id}/delays`} />
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
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={() => navigate('/home')} className="flex items-center justify-center w-9 h-9 rounded-lg bg-orange-500 text-white hover:bg-orange-600 active:bg-orange-700 transition-colors touch-manipulation shadow-sm" title="Dashboard"><Home size={18} /></button>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center min-w-0 px-2">
            {loading ? (
              <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
            ) : (
              <>
                <h1 className="text-gray-900 font-bold text-sm leading-tight truncate text-center w-full">{job?.name ?? 'Job Delays'}</h1>
                <div className="flex items-center gap-1 text-xs text-gray-400 leading-tight">
                  <button onClick={() => navigate('/jobs')} className="hover:text-orange-500 transition-colors">Jobs</button>
                  <span>/</span>
                  <button onClick={() => navigate(`/jobs/${id}`)} className="hover:text-orange-500 transition-colors truncate max-w-[80px]">{job?.name ?? '...'}</button>
                  <span>/</span>
                  <span className="text-gray-500 font-medium">Delays</span>
                </div>
              </>
            )}
          </div>
          <button
            onClick={exportCsv}
            disabled={exporting}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 text-xs font-semibold text-gray-600 rounded-lg transition-colors shrink-0"
          >
            {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            <span>Export CSV</span>
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
        <Home size={16} />
      </button>

      {/* ── Mobile: export CSV floats top-right ── */}
      <button
        onClick={exportCsv}
        disabled={exporting}
        className="md:hidden fixed top-3 right-3 z-20 h-9 px-3 rounded-xl bg-white/90 backdrop-blur-sm shadow-sm border border-gray-100 flex items-center gap-1.5 text-xs font-semibold text-gray-600 active:bg-gray-100 disabled:opacity-40 transition-colors"
        aria-label="Export CSV"
      >
        {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
        CSV
      </button>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-red-400" />
          </div>
        ) : (
          <div className="px-4 py-4 pb-24 md:pb-6 max-w-3xl mx-auto w-full">
            <JobDelays jobId={jobId} />
          </div>
        )}
      </div>

      {/* ── Mobile bottom bar ── */}
      <div
        className="md:hidden fixed bottom-0 inset-x-0 z-10 bg-white border-t border-gray-100"
        style={{ boxShadow: '0 -1px 0 rgba(0,0,0,0.05)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-8 h-8 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
            <Clock size={15} className="text-red-500" />
          </div>
          <div className="flex-1 min-w-0">
            {loading ? (
              <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
            ) : (
              <>
                <p className="text-gray-900 font-bold text-sm leading-tight truncate">
                  {job?.name ?? 'Job Delays'}
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
