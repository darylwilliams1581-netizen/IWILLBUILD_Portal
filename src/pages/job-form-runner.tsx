/**
 * /jobs/:id/forms/:formInstanceId
 * Standalone form runner page — renders FormRunner directly for a specific
 * submission. Opens in a new tab from the job Forms tab.
 */
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Loader2, AlertTriangle } from 'lucide-react';
import FormRunner, { type FormSubmission } from '@/components/job/FormRunner';
import type { Job } from '@/lib/jobs-api';

export default function JobFormRunnerPage() {
  const { id, formInstanceId } = useParams<{ id: string; formInstanceId: string }>();
  const navigate = useNavigate();

  const jobId = Number(id);
  const submissionId = Number(formInstanceId);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submission, setSubmission] = useState<FormSubmission | null>(null);
  const [templateName, setTemplateName] = useState('Form');
  const [job, setJob] = useState<Job | null>(null);

  useEffect(() => {
    if (!submissionId) { setError('Invalid URL'); setLoading(false); return; }

    async function load() {
      try {
        // Load submission + template name
        const subRes = await fetch(`/api/job-forms/${submissionId}`, { credentials: 'include' });

        if (!subRes.ok) {
          const d = await subRes.json() as { error?: string };
          throw new Error(d.error ?? 'Form not found');
        }

        const subData = await subRes.json() as {
          submission?: FormSubmission;
          templateName?: string;
          error?: string;
        };
        if (!subData.submission) throw new Error('Form not found');

        setSubmission(subData.submission);
        setTemplateName(subData.templateName ?? 'Form');

        // Only fetch job if we have a real jobId (not 0 = standalone)
        if (jobId && jobId > 0) {
          const jobRes = await fetch(`/api/jobs/${jobId}`, { credentials: 'include' });
          if (jobRes.ok) {
            const jobData = await jobRes.json() as { job?: Job };
            setJob(jobData.job ?? null);
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load form');
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [jobId, submissionId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 size={28} className="animate-spin text-primary" />
      </div>
    );
  }

  if (error || !submission) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-4 px-4">
        <div className="p-3 rounded-2xl bg-red-50">
          <AlertTriangle size={24} className="text-red-500" />
        </div>
        <p className="text-sm font-semibold text-slate-700">{error || 'Form not found'}</p>
        <button
          onClick={() => window.close()}
          className="text-xs text-slate-400 hover:text-slate-600 underline"
        >
          Close this tab
        </button>
      </div>
    );
  }

  const isStandalone = !jobId || jobId === 0;
  const isReadOnly = submission.status === 'completed' || submission.status === 'submitted';

  return (
    <>
      <Helmet>
        <title>{templateName}{job ? ` — ${job.name ?? `Job #${jobId}`}` : ''} | FleetOps</title>
        <meta name="description" content={`Complete the ${templateName} form${job ? ` for ${job.name ?? `Job #${jobId}`}` : ''}.`} />
        <link rel="canonical" href={typeof window !== 'undefined' ? window.location.href : ''} />
        <meta name="robots" content="noindex" />
      </Helmet>
      <main>
        <h1 className="sr-only">{templateName}</h1>
      <FormRunner
        jobId={isStandalone ? undefined : jobId}
        job={job}
        submission={submission}
        templateName={templateName}
        readOnly={isReadOnly}
        onBack={() => {
          if (window.history.length <= 1) {
            window.close();
          } else if (isStandalone) {
            navigate('/studio?tab=forms');
          } else {
            navigate(`/jobs/${jobId}?tab=forms`);
          }
        }}
        onComplete={() => {
          window.location.reload();
        }}
      />
      </main>
    </>
  );
}
