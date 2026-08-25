/**
 * /jobs/:id/costs — Full-screen Job Cost Ledger page.
 * Path B standalone page — reached via Work & Field launcher.
 * @seo-exempt
 */
import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { BookOpen, Loader2, Plus } from 'lucide-react';
import { Helmet } from '@dr.pogodin/react-helmet';
import JobCosts from '@/components/job/JobCosts';
import JobFeatureShell from '@/components/job/JobFeatureShell';

interface Job {
  id: number;
  name: string;
  jobNumber?: string | null;
}

export default function JobCostsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const jobId = Number(id);
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);

  // Ref to trigger the Add Entry modal inside JobCosts
  const addEntryRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    fetch(`/api/jobs/${id}`, { credentials: 'include' })
      .then(async r => {
        const ct = r.headers.get('content-type') ?? '';
        if (!ct.includes('application/json')) { setLoading(false); return; }
        const data = (await r.json()) as { job?: Job } | Job;
        const j = data && typeof data === 'object' && 'job' in data ? data.job : data as Job;
        setJob(j ?? null);
      })
      .catch(() => setJob(null))
      .finally(() => setLoading(false));
  }, [id]);

  function handleChangeJob() {
    navigate('/work-field/ledger');
  }

  return (
    <div className="portal-page">
      <Helmet>
        <title>{job ? `Job Ledger — ${job.name}` : 'Job Ledger'} — IWILLBUILD</title>
        <meta name="description" content="View and manage cost ledger entries for this job." />
        <meta name="robots" content="noindex" />
        {id && <link rel="canonical" href={`https://iwillbuild.com/jobs/${id}/costs`} />}
      </Helmet>
      <h1 className="sr-only">{job ? `Job Ledger — ${job.name}` : 'Job Ledger'}</h1>

      <div className="portal-content flex flex-col p-0">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground gap-2">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm">Loading…</span>
          </div>
        ) : (
          <JobFeatureShell
            Icon={BookOpen}
            featureLabel="Job Ledger"
            jobName={job?.name ?? 'Job'}
            jobNumber={job?.jobNumber}
            backTo="/work-field/ledger"
            onChangeJob={handleChangeJob}
          >
            {/* Add Entry button — floats in the shell content area */}
            <div className="flex justify-end px-4 pt-3">
              <button
                onClick={() => addEntryRef.current?.()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors"
              >
                <Plus size={13} />
                Add Entry
              </button>
            </div>
            <div className="px-4 py-4 pb-24 md:pb-6 max-w-5xl mx-auto w-full">
              <JobCosts jobId={jobId} onRegisterAddEntry={fn => { addEntryRef.current = fn; }} />
            </div>
          </JobFeatureShell>
        )}
      </div>
    </div>
  );
}
