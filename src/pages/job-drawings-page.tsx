/**
 * /jobs/:id/drawings — Standalone drawings page for a job.
 * Full-screen version of the JobPlanManagerTab with its own URL,
 * matching the pattern of /jobs/:id/photos, /jobs/:id/forms etc.
 */
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import { ArrowLeft, Layers, House } from 'lucide-react';
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
        {/* Header */}
        <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 shrink-0">
          <button
            onClick={() => navigate(`/jobs/${id}`)}
            className="p-2 -ml-1 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
            aria-label="Back"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="w-8 h-8 rounded-xl bg-lime-100 flex items-center justify-center shrink-0">
            <Layers size={16} className="text-lime-600" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1 text-xs text-gray-400 leading-tight">
              <button onClick={() => navigate('/home')} className="hover:text-orange-500 transition-colors flex items-center gap-0.5" title="Dashboard"><House size={11} /></button>
              <span>/</span>
              <button onClick={() => navigate('/jobs')} className="hover:text-orange-500 transition-colors">Jobs</button>
              <span>/</span>
              <button onClick={() => navigate(`/jobs/${id}`)} className="hover:text-orange-500 transition-colors truncate max-w-[120px]">{job?.name ?? '...'}</button>
              <span>/</span>
              <span className="text-gray-600 font-medium">Drawings</span>
            </div>
            <h1 className="text-sm font-bold text-slate-900 truncate">
              {job?.name ?? 'Loading…'}
            </h1>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          <JobPlanManagerTab jobId={jobId} jobName={job?.name} />
        </div>
      </div>
    </>
  );
}
