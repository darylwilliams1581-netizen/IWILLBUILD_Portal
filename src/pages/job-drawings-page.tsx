/**
 * /jobs/:id/drawings — Standalone drawings page for a job.
 * Path B standalone page — reached via Work & Field launcher.
 * @seo-exempt
 */
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Layers, Loader2 } from 'lucide-react';
import JobPlanManagerTab from '@/components/PlanManager/JobPlanManagerTab';
import JobFeatureShell from '@/components/job/JobFeatureShell';

interface Job {
  id: number;
  name: string;
  job_number?: string;
  jobNumber?: string | null;
}

export default function JobDrawingsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const jobId = Number(id);
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!jobId) { setLoading(false); return; }
    fetch(`/api/jobs/${jobId}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() as Promise<{ job?: Job }> : null)
      .then(d => { if (d?.job) setJob(d.job); })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [jobId]);

  function handleChangeJob() {
    navigate('/work-field/drawings');
  }

  return (
    <div className="portal-page">
      <Helmet>
        <title>{job ? `Drawings — ${job.name}` : 'Drawings'} — IWILLBUILD</title>
        <meta name="description" content="View and manage drawings for this job." />
        <link rel="canonical" href={`https://iwillbuild.com/jobs/${jobId}/drawings`} />
        <meta name="robots" content="noindex" />
      </Helmet>
      <h1 className="sr-only">{job ? `Drawings — ${job.name}` : 'Job Drawings'}</h1>

      <div className="portal-content flex flex-col p-0">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground gap-2">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm">Loading…</span>
          </div>
        ) : (
          <JobFeatureShell
            Icon={Layers}
            featureLabel="Drawings"
            jobName={job?.name ?? 'Job'}
            jobNumber={job?.job_number ?? job?.jobNumber}
            onChangeJob={handleChangeJob}
          >
            <div className="flex-1 overflow-auto pb-16 md:pb-0">
              <JobPlanManagerTab jobId={jobId} jobName={job?.name} />
            </div>
          </JobFeatureShell>
        )}
      </div>
    </div>
  );
}
