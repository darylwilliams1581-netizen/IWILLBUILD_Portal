/**
 * /jobs/:jobId/estimates — Standalone Estimates page (Path B).
 * Wraps the canonical JobEstimates component in the shared feature shell.
 *
 * Note: the existing /jobs/:id/quotes route uses job-quotes-page.tsx which
 * has its own full-page implementation. This page is the Path B standalone
 * wrapper that reuses the JobEstimates component directly.
 * @seo-exempt
 */
import { useNavigate } from 'react-router';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Loader2, AlertCircle } from 'lucide-react';
import PortalSidebar from '@/components/PortalSidebar';
import JobFeatureShell from '@/components/job/JobFeatureShell';
import JobEstimates from '@/components/JobEstimates';
import { useJobForFeature } from '@/lib/useJobForFeature';
import { getFeatureByKey } from '@/lib/jobFeatureRegistry';

const FEATURE = getFeatureByKey('estimates')!;

export default function JobEstimatesPage() {
  const navigate = useNavigate();
  const { jobId, job, loading, error } = useJobForFeature();

  function handleChangeJob() {
    navigate('/home?picker=estimates');
  }

  return (
    <div className="portal-page">
      <Helmet>
        <title>{job ? `Estimates — ${job.name}` : 'Estimates'} — IWIllBUIlD</title>
        <meta name="description" content="View and manage estimates for this job in IWIllBUIlD." />
        <meta name="robots" content="noindex" />
        {job && <link rel="canonical" href={`https://iwillbuild.com/jobs/${job.id}/quotes`} />}
      </Helmet>
      <PortalSidebar />
      <h1 className="sr-only">{job ? `Estimates — ${job.name}` : 'Job Estimates'}</h1>
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
              <JobEstimates jobId={jobId} />
            </div>
          </JobFeatureShell>
        )}
      </div>
    </div>
  );
}
