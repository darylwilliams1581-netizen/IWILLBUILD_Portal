/**
 * /jobs/:jobId/invoices — Standalone Invoices page (Path B).
 * Wraps the canonical JobInvoices component in the shared feature shell.
 * @seo-exempt
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Loader2, AlertCircle } from 'lucide-react';
import PortalSidebar from '@/components/PortalSidebar';
import JobFeatureShell from '@/components/job/JobFeatureShell';
import JobInvoices from '@/components/job/JobInvoices';
import { useJobForFeature } from '@/lib/useJobForFeature';
import { getFeatureByKey } from '@/lib/jobFeatureRegistry';
import { type Job } from '@/lib/jobs-api';

const FEATURE = getFeatureByKey('invoices')!;

export default function JobInvoicesPage() {
  const navigate = useNavigate();
  const { jobId, job: jobBasic, loading, error } = useJobForFeature();

  // JobInvoices requires the full Job object — reuse the same fetch result
  const [fullJob, setFullJob] = useState<Job | null>(null);
  useEffect(() => {
    if (jobBasic) setFullJob(jobBasic);
  }, [jobBasic]);

  function handleChangeJob() {
    navigate('/?picker=invoices');
  }

  return (
    <div className="portal-page">
      <Helmet>
        <title>{fullJob ? `Invoices — ${fullJob.name}` : 'Invoices'} — IWILLBUILD</title>
        <meta name="description" content="View and manage invoices for this job in IWILLBUILD." />
        <meta name="robots" content="noindex" />
        {fullJob && <link rel="canonical" href={`https://iwillbuild.com/jobs/${fullJob.id}/invoices`} />}
      </Helmet>
      <PortalSidebar />
      <h1 className="sr-only">{fullJob ? `Invoices — ${fullJob.name}` : 'Job Invoices'}</h1>
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
        {!loading && !error && fullJob && jobId && (
          <JobFeatureShell
            Icon={FEATURE.icon}
            featureLabel={FEATURE.label}
            jobName={fullJob.name}
            jobNumber={fullJob.jobNumber}
            backTo="/home"
            onChangeJob={handleChangeJob}
          >
            <div className="p-4">
              <JobInvoices jobId={jobId} job={fullJob} />
            </div>
          </JobFeatureShell>
        )}
      </div>
    </div>
  );
}
