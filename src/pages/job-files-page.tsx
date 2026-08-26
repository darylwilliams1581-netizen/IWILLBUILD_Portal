/**
 * /jobs/:jobId/files — Standalone Files page (Path B).
 * Wraps the canonical FilePanel component in the shared feature shell.
 * @seo-exempt
 */
import { useNavigate } from 'react-router';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Loader2, AlertCircle } from 'lucide-react';
import PortalSidebar from '@/components/PortalSidebar';
import JobFeatureShell from '@/components/job/JobFeatureShell';
import FilePanel from '@/components/FilePanel';
import { useJobForFeature } from '@/lib/useJobForFeature';
import { getFeatureByKey } from '@/lib/jobFeatureRegistry';

const FEATURE = getFeatureByKey('files')!;

export default function JobFilesPage() {
  const navigate = useNavigate();
  const { jobId, job, loading, error } = useJobForFeature();

  function handleChangeJob() {
    navigate('/?picker=files');
  }

  return (
    <div className="portal-page">
      <Helmet>
        <title>{job ? `Files — ${job.name}` : 'Files'} — IWILLBUILD</title>
        <meta name="description" content="Manage documents and files for this job in IWILLBUILD." />
        <meta name="robots" content="noindex" />
        {job && <link rel="canonical" href={`https://iwillbuild.com/jobs/${job.id}/files`} />}
      </Helmet>
      <PortalSidebar />
      <h1 className="sr-only">{job ? `Files — ${job.name}` : 'Job Files'}</h1>
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
            backTo="/"
            onChangeJob={handleChangeJob}
          >
            <div className="p-4">
              <FilePanel jobId={jobId} />
            </div>
          </JobFeatureShell>
        )}
      </div>
    </div>
  );
}
