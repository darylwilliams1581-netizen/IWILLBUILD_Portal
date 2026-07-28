/**
 * /jobs/:id/drawings — Standalone drawings page for a job.
 * Full-screen version of the JobPlanManagerTab with its own URL,
 * matching the pattern of /jobs/:id/photos, /jobs/:id/forms etc.
 */
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import { ArrowLeft, Layers, Home } from 'lucide-react';
import JobPlanManagerTab from '@/components/PlanManager/JobPlanManagerTab';

interface Job { id: number; name: string; job_number?: string }

export default function JobDrawingsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const jobId = Number(id);
  const [job, setJob] = useState<Job | null>(null);

  useEffect(() => {
    if (!jobId) return;
    fetch(`/api/jobs/${jobId}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() as Promise<{ job?: Job }> : null)
      .then(d => { if (d?.job) setJob(d.job); })
      .catch(() => null);
  }, [jobId]);

  const title = job ? `${job.name} — Drawings` : 'Drawings';

  return (
    <>
      <Helmet>
        <title>{title} — IWILLBUILD</title>
        <meta name="description" content="View and manage drawings for this job." />
        <link rel="canonical" href={`https://iwillbuild.com/jobs/${jobId}/drawings`} />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="min-h-screen bg-[#F4F5F7] flex flex-col">
        {/* Header — desktop: back+home left, title center; mobile: title only, safe-area padded */}
        <div
          className="bg-white border-b border-slate-200 shrink-0"
          style={{ paddingTop: 'max(env(safe-area-inset-top), 0px)' }}
        >
          <div className="flex items-center gap-3 px-4 py-3">
            <button
              onClick={() => navigate(`/jobs/${id}`)}
              className="hidden md:flex p-2 -ml-1 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
              aria-label="Back"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="hidden md:flex items-center gap-1.5 shrink-0">
              <button onClick={() => navigate('/home')} className="flex items-center justify-center w-9 h-9 rounded-lg bg-violet-500 text-white hover:bg-violet-700 active:bg-violet-800 transition-colors touch-manipulation shadow-sm" title="Dashboard"><Home size={18} /></button>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center min-w-0 px-2">
              <h1 className="text-sm font-bold text-slate-900 truncate text-center w-full">{job?.name ?? 'Loading…'}</h1>
              <div className="hidden md:flex items-center gap-1 text-xs text-gray-400 leading-tight">
                <button onClick={() => navigate('/jobs')} className="hover:text-violet-600 transition-colors">Jobs</button>
                <span>/</span>
                <button onClick={() => navigate(`/jobs/${id}`)} className="hover:text-violet-600 transition-colors truncate max-w-[80px]">{job?.name ?? '...'}</button>
                <span>/</span>
                <span className="text-gray-500 font-medium">Drawings</span>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto pb-16 md:pb-0">
          <JobPlanManagerTab jobId={jobId} jobName={job?.name} />
        </div>

        {/* Mobile bottom bar with back + home */}
        <div
          className="md:hidden fixed bottom-0 inset-x-0 z-10 bg-white border-t border-slate-200"
          style={{ boxShadow: '0 -1px 0 rgba(0,0,0,0.05)', paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="flex items-center gap-2 px-3 py-2">
            <button onClick={() => navigate(`/jobs/${id}`)} aria-label="Back" className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-600 active:bg-gray-200 transition-colors touch-manipulation shrink-0">
              <ArrowLeft size={16} />
            </button>
            <button onClick={() => navigate('/home')} aria-label="Dashboard" className="w-10 h-10 rounded-xl bg-violet-50 border border-violet-200 flex items-center justify-center text-violet-600 active:bg-violet-100 transition-colors touch-manipulation shrink-0">
              <Home size={16} />
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-gray-900 font-bold text-sm leading-tight truncate">{job?.name ?? 'Drawings'}</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
