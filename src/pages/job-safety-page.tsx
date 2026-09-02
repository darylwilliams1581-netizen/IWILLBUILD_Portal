/**
 * /jobs/:jobId/safety — Standalone Safety page (Path B).
 * Wraps the canonical JobSafety component in the shared feature shell.
 * @seo-exempt
 */
import { useNavigate } from 'react-router';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Loader2, AlertCircle } from 'lucide-react';
import PortalSidebar from '@/components/PortalSidebar';
import JobFeatureShell from '@/components/job/JobFeatureShell';
import JobSafety from '@/components/job/JobSafety';
import { useJobForFeature } from '@/lib/useJobForFeature';
import { getFeatureByKey } from '@/lib/jobFeatureRegistry';

const FEATURE = getFeatureByKey('safety')!;

export default function JobSafetyPage() {
  const navigate = useNavigate();
  const { jobId, job, loading, error } = useJobForFeature();

  function handleChangeJob() {
    navigate('/home?picker=safety');
  }

  return (
    <div className="portal-page">
      <Helmet>
        <title>{job ? `Safety — ${job.name}` : 'Safety'} — IWIIlBUILD</title>
        <meta name="description" content="Manage safety records and SWMS for this job in IWIIlBUILD." />
        <meta name="robots" content="noindex" />
        {job && <link rel="canonical" href={`https://iwillbuild.com/jobs/${job.id}/safety`} />}
      </Helmet>
      <PortalSidebar />
      <h1 className="sr-only">{job ? `Safety — ${job.name}` : 'Job Safety'}</h1>
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
              <JobSafety jobId={jobId} />
            </div>
          </JobFeatureShell>
        )}
      </div>
    </div>
  );
}
