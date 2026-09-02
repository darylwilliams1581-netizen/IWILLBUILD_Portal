/**
 * /jobs/:id/notes — Full-screen notes page for a job.
 * Path B standalone page — reached via Work & Field launcher.
 * @seo-exempt
 */
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Loader2, Download } from 'lucide-react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { StickyNote } from 'lucide-react';
import NotesPanel from '@/components/notes/NotesPanel';
import JobFeatureShell from '@/components/job/JobFeatureShell';

interface Job {
  id: number;
  name: string;
  jobNumber?: string | null;
}

export default function JobNotesPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const jobId = Number(id);
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

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

  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/jobs/${id}/notes/export-csv`, { credentials: 'include' });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `job-${id}-notes.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {/* silent */} finally {
      setExporting(false);
    }
  };

  function handleChangeJob() {
    navigate('/home?picker=notes');
  }

  return (
    <div className="portal-page">
      <Helmet>
        <title>{job ? `Notes — ${job.name}` : 'Job Notes'} — IWIllBUILD</title>
        <meta name="description" content="View and manage notes and tasks for this job." />
        <meta name="robots" content="noindex" />
        {id && <link rel="canonical" href={`https://iwillbuild.com/jobs/${id}/notes`} />}
      </Helmet>
      <h1 className="sr-only">{job ? `Notes — ${job.name}` : 'Job Notes'}</h1>

      <div className="portal-content flex flex-col p-0">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground gap-2">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm">Loading…</span>
          </div>
        ) : (
          <JobFeatureShell
            Icon={StickyNote}
            featureLabel="Notes"
            jobName={job?.name ?? 'Job'}
            jobNumber={job?.jobNumber}
            backTo="/home"
            onChangeJob={handleChangeJob}
          >
            <div className="p-4 pb-24 md:pb-6 max-w-3xl mx-auto w-full">
              <div className="flex justify-end mb-3">
                <button
                  onClick={exportCsv}
                  disabled={exporting}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 text-xs font-semibold text-gray-600 rounded-lg transition-colors"
                >
                  {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                  <span>Export CSV</span>
                </button>
              </div>
              <NotesPanel entityType="job" entityId={jobId} entityLabel={job?.name} />
            </div>
          </JobFeatureShell>
        )}
      </div>
    </div>
  );
}
