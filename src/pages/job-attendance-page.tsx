/**
 * /jobs/:jobId/attendance — Standalone Attendance page (Path B).
 * Wraps the canonical JobAttendanceTab component in the shared feature shell.
 * @seo-exempt
 */
import { useNavigate } from 'react-router';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Loader2, AlertCircle } from 'lucide-react';
import PortalSidebar from '@/components/PortalSidebar';
import JobFeatureShell from '@/components/job/JobFeatureShell';
import JobAttendanceTab from '@/components/job/JobAttendanceTab';
import { useJobForFeature } from '@/lib/useJobForFeature';
import { getFeatureByKey } from '@/lib/jobFeatureRegistry';

const FEATURE = getFeatureByKey('attendance')!;

export default function JobAttendancePage() {
  const navigate = useNavigate();
  const { jobId, job, loading, error } = useJobForFeature();

  function handleChangeJob() {
    navigate('/?picker=attendance');
  }

  return (
    <div className="portal-page">
      <Helmet>
        <title>{job ? `Attendance — ${job.name}` : 'Attendance'} — IWILLBUILD</title>
        <meta name="description" content="Track attendance and sign-on/off for this job in IWILLBUILD." />
        <meta name="robots" content="noindex" />
        {job && <link rel="canonical" href={`https://iwillbuild.com/jobs/${job.id}/attendance`} />}
      </Helmet>
      <PortalSidebar />
      <h1 className="sr-only">{job ? `Attendance — ${job.name}` : 'Job Attendance'}</h1>
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
              <JobAttendanceTab jobId={jobId} jobName={job.name} />
            </div>
          </JobFeatureShell>
        )}
      </div>
    </div>
  );
}
