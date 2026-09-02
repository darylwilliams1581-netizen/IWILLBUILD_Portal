/**
 * /jobs/:jobId/tasks — Standalone Tasks page (Path B).
 * Wraps the canonical JobTodos component in the shared feature shell.
 * @seo-exempt
 */
import { useNavigate } from 'react-router';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Loader2, AlertCircle } from 'lucide-react';
import PortalSidebar from '@/components/PortalSidebar';
import JobFeatureShell from '@/components/job/JobFeatureShell';
import JobTodos from '@/components/job/JobTodos';
import { useJobForFeature } from '@/lib/useJobForFeature';
import { getFeatureByKey } from '@/lib/jobFeatureRegistry';

const FEATURE = getFeatureByKey('tasks')!;

export default function JobTasksPage() {
  const navigate = useNavigate();
  const { jobId, job, loading, error } = useJobForFeature();

  function handleChangeJob() {
    navigate('/home?picker=tasks');
  }

  return (
    <div className="portal-page">
      <Helmet>
        <title>{job ? `Tasks — ${job.name}` : 'Tasks'} — IWIllBUILD</title>
        <meta name="description" content="Manage tasks and to-dos for this job in IWIllBUILD." />
        <meta name="robots" content="noindex" />
        {job && <link rel="canonical" href={`https://iwillbuild.com/jobs/${job.id}/tasks`} />}
      </Helmet>
      <h1 className="sr-only">{job ? `Tasks — ${job.name}` : 'Job Tasks'}</h1>
      <PortalSidebar />
      <div className="portal-content flex flex-col p-0">
        {loading && (
          <div className="flex items-center justify-center h-40 text-muted-foreground gap-2">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm">Loading…</span>
          </div>
        )}
        {error && (
          <div className="flex items-center justify-center h-40 text-destructive gap-2">
            <AlertCircle size={16} />
            <span className="text-sm">{error}</span>
          </div>
        )}
        {!loading && !error && job && jobId && (
          <JobFeatureShell
            Icon={FEATURE.icon}
            featureLabel={FEATURE.label}
            jobName={job.name}
            jobNumber={job.jobNumber}
            backTo="/home"
            onChangeJob={handleChangeJob}
          >
            <div className="p-4">
              <JobTodos jobId={jobId} />
            </div>
          </JobFeatureShell>
        )}
      </div>
    </div>
  );
}
