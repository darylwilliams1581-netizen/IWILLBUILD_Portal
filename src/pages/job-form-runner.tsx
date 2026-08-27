/**
 * /jobs/:id/forms/:formInstanceId
 *
 * Form Runner Shell
 *
 * Header (top):
 *   ← Back | Title + job subtitle | progress counter | [FileDown widget — completed only]
 *
 * Bottom bar — completed view:
 *   [ ✓ Completed pill ]  ·····  [ Edit ]
 *
 * Bottom bar — active/edit view:
 *   [ Save Draft ]  [ Incomplete (red) ]
 *
 * The floating Document Actions widget (purple circle) is suppressed on this
 * page via DocumentActionsWidget's pathname guard. The FileDown header button
 * is the sole entry point to PDF/Email/Share on completed forms.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useLocation } from "react-router";
import { Helmet } from '@dr.pogodin/react-helmet';
import { Loader2, AlertTriangle, ChevronLeft, CheckCircle2, Pencil, Save, XCircle, Printer, Mail } from 'lucide-react';
import FormRunner from '@/components/job/FormRunner';
import type { FormSubmission } from '@/components/job/form-types';
import type { Job } from '@/lib/jobs-api';
interface LocationState {
  returnTo?: string;
}
export default function JobFormRunnerPage() {
  const {
    id,
    formInstanceId
  } = useParams<{
    id: string;
    formInstanceId: string;
  }>();
  const location = useLocation();
  const jobId = Number(id);
  const submissionId = Number(formInstanceId);
  const locationState = (location.state ?? {}) as LocationState;

  // Resolve the back destination:
  //  - Explicit returnTo from navigation state takes priority (e.g. from a Job Forms tab).
  //  - Completed forms default back to Submissions tab.
  //  - Active/draft forms default back to Forms tab.
  // We compute this lazily at click time (after isDone is known) so we capture
  // the correct tab. Store the raw state value now; resolve at click time.
  const explicitReturnTo = locationState.returnTo ?? null;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submission, setSubmission] = useState<FormSubmission | null>(null);
  const [templateName, setTemplateName] = useState('Form');
  const [job, setJob] = useState<Job | null>(null);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [progress, setProgress] = useState({
    answered: 0,
    total: 0
  });
  const [shellSaving, setShellSaving] = useState(false);
  const [shellCompleting, setShellCompleting] = useState(false);
  const [shellReopening, setShellReopening] = useState(false);
  const [actionError, setActionError] = useState('');
  const saveRef = useRef<(() => Promise<void>) | null>(null);
  const completeRef = useRef<(() => Promise<void>) | null>(null);
  useEffect(() => {
    if (!submissionId) {
      setError('Invalid URL');
      setLoading(false);
      return;
    }
    async function load() {
      try {
        const subRes = await fetch(`/api/job-forms/${submissionId}`, {
          credentials: 'include'
        });
        if (!subRes.ok) {
          const d = (await subRes.json()) as {
            error?: string;
          };
          throw new Error(d.error ?? 'Form not found');
        }
        const subData = (await subRes.json()) as {
          submission?: FormSubmission;
          templateName?: string;
          error?: string;
        };
        if (!subData.submission) throw new Error('Form not found');
        setSubmission(subData.submission);
        setTemplateName(subData.templateName ?? 'Form');
        const completed = subData.submission.status === 'completed' || subData.submission.status === 'submitted';
        setIsReadOnly(completed);
        setIsDone(completed);
        if (jobId && jobId > 0) {
          const jobRes = await fetch(`/api/jobs/${jobId}`, {
            credentials: 'include'
          });
          if (jobRes.ok) {
            const jobData = (await jobRes.json()) as {
              job?: Job;
            };
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
  function handleBack() {
    // Resolve destination at click time so isDone is current.
    // Explicit returnTo from navigation state (e.g. Job Forms tab) takes priority.
    // Otherwise: completed forms → Submissions tab; active forms → Forms tab.
    let dest: string;
    if (explicitReturnTo) {
      dest = explicitReturnTo;
    } else if (isDone) {
      dest = '/studio/forms?tab=submissions';
    } else {
      dest = '/studio/forms?tab=forms';
    }
    // Hard navigation guarantees the Form Runner unmounts and the destination
    // page renders correctly, regardless of how the router shell is structured.
    window.location.assign(dest);
  }
  const handleReopen = useCallback(async () => {
    if (!submission) return;
    setShellReopening(true);
    setActionError('');
    try {
      const res = await fetch(`/api/job-forms/${submission.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status: 'in_progress'
        })
      });
      if (!res.ok) {
        const d = (await res.json()) as {
          error?: string;
        };
        throw new Error(d.error ?? 'Reopen failed');
      }
      setIsReadOnly(false);
      setIsDone(false);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Reopen failed');
    } finally {
      setShellReopening(false);
    }
  }, [submission]);
  async function handleSaveDraft() {
    if (!saveRef.current) return;
    setShellSaving(true);
    try {
      await saveRef.current();
    } finally {
      setShellSaving(false);
    }
  }
  async function handleComplete() {
    if (!completeRef.current) return;
    setShellCompleting(true);
    try {
      await completeRef.current();
    } finally {
      setShellCompleting(false);
    }
  }
  function onFormComplete() {
    setIsReadOnly(true);
    setIsDone(true);
  }

  // ── Loading / error ───────────────────────────────────────────────────────

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 size={28} className="animate-spin text-primary" />
      </div>;
  }
  if (error || !submission) {
    return <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-4 px-4">
        <div className="p-3 rounded-2xl bg-red-50">
          <AlertTriangle size={24} className="text-red-500" />
        </div>
        <p className="text-sm font-semibold text-slate-700">{error || 'Form not found'}</p>
        <button onClick={handleBack} className="text-xs text-slate-600 hover:text-slate-800 underline">
          Go back
        </button>
      </div>;
  }
  const isStandalone = !jobId || jobId === 0;
  return <>
      <Helmet>
        <title>
          {templateName}{job ? ` — ${job.name ?? `Job #${jobId}`}` : ''} | IWillBuild
        </title>
        <meta name="description" content={`${isDone ? 'View completed' : 'Complete the'} ${templateName} form${job ? ` for ${job.name ?? `Job #${jobId}`}` : ''}.`} />
        <link rel="canonical" href={typeof window !== 'undefined' ? window.location.href : ''} />
        <meta name="robots" content="noindex" />
      </Helmet>

      <div className="min-h-screen bg-slate-50 flex flex-col">

        {/* ── Sticky top header ─────────────────────────────────────────────── */}
        <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm" style={{
        paddingTop: 'env(safe-area-inset-top)'
      }}>
          <div className="max-w-2xl mx-auto px-3 h-14 flex items-center gap-2">

            {/* Back */}
            <button onClick={handleBack} className="p-2 -ml-1 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors shrink-0" aria-label="Back">
              <ChevronLeft size={20} />
            </button>

            {/* Title block */}
            <div className="flex-1 min-w-0 flex flex-col justify-center">
              <h1 className="font-heading font-bold text-[15px] text-slate-900 truncate leading-snug">
                {templateName}
              </h1>
              {job && <p className="text-[11px] text-slate-400 truncate leading-tight">
                  {job.jobNumber ? `${job.jobNumber} · ` : ''}{job.name}
                </p>}
            </div>

            {/* Progress counter — active forms only */}
            {!isReadOnly && progress.total > 0 && <div className="text-right shrink-0 ml-1">
                <p className="text-xs font-bold text-slate-700 leading-tight tabular-nums">
                  {progress.answered}/{progress.total}
                </p>
                <p className="text-[10px] text-slate-400 leading-tight">answered</p>
              </div>}

            {/* Saved-at indicator — active forms, desktop only */}
            {!isReadOnly && savedAt && <span className="text-[11px] text-emerald-600 font-medium shrink-0 hidden sm:block ml-1">
                Saved {savedAt.toLocaleTimeString('en-AU', {
              hour: '2-digit',
              minute: '2-digit'
            })}
              </span>}


          </div>

          {/* Error banner */}
          {actionError && <div className="max-w-2xl mx-auto px-4 pb-2">
              <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                <AlertTriangle size={12} className="shrink-0" />
                <span className="flex-1">{actionError}</span>
                <button onClick={() => setActionError('')} className="text-red-400 hover:text-red-600 ml-auto">✕</button>
              </div>
            </div>}
        </header>

        {/* ── Scrollable form content ───────────────────────────────────────── */}
        <main className="flex-1 px-4 py-4 sm:px-6 sm:py-6">
          <h2 className="sr-only">{templateName}</h2>
          <FormRunner jobId={isStandalone ? undefined : jobId} job={job} submission={submission} templateName={templateName} readOnly={isReadOnly} onReopen={handleReopen} onComplete={onFormComplete} onSaved={at => setSavedAt(at)} onProgressChange={(answered, total) => setProgress({
          answered,
          total
        })} saveRef={saveRef} completeRef={completeRef} />
        </main>

        {/* ── Sticky bottom action bar ──────────────────────────────────────── */}
        <footer className="sticky bottom-0 z-30 bg-white border-t border-slate-200 shadow-sm" style={{
        paddingBottom: 'max(12px, env(safe-area-inset-bottom))'
      }}>
          <div className="max-w-2xl mx-auto px-4 pt-3 pb-1">

            {isReadOnly ? (/* ── Completed view: status pill + Print + Email + Edit ── */
          <div className="flex items-center gap-2 h-11">
                {/* Completed pill */}
                <span className="inline-flex items-center gap-1.5 text-sm font-bold px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                  <CheckCircle2 size={14} /> Completed
                </span>

                <div className="flex-1" />

                {/* Print */}
                <button
                  onClick={() => window.print()}
                  className="flex items-center justify-center gap-1.5 h-11 px-4 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-700 transition-colors shrink-0"
                  title="Print this form"
                >
                  <Printer size={14} />
                  Print
                </button>

                {/* Email */}
                <button
                  onClick={() => {
                    const subject = encodeURIComponent(`Form: ${templateName}${job ? ` — ${job.name ?? `Job #${jobId}`}` : ''}`);
                    const body = encodeURIComponent(`Please find the completed form attached.\n\nForm: ${templateName}\nCompleted: ${submission?.updatedAt ? new Date(submission.updatedAt).toLocaleString() : ''}`);
                    window.location.href = `mailto:?subject=${subject}&body=${body}`;
                  }}
                  className="flex items-center justify-center gap-1.5 h-11 px-4 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-700 transition-colors shrink-0"
                  title="Email this form"
                >
                  <Mail size={14} />
                  Email
                </button>

                {/* Edit / Reopen */}
                <button onClick={() => void handleReopen()} disabled={shellReopening} className="flex items-center justify-center gap-2 h-11 px-4 rounded-2xl border border-amber-200 bg-amber-50 hover:bg-amber-100 text-sm font-bold text-amber-700 disabled:opacity-50 transition-colors shrink-0">
                  {shellReopening ? <Loader2 size={14} className="animate-spin" /> : <Pencil size={14} />}
                  Edit
                </button>
              </div>) : (/* ── Active / edit view: Save Draft + Incomplete (red) ── */
          <div className="flex items-center gap-2.5">
                {/* Save Draft */}
                <button onClick={() => void handleSaveDraft()} disabled={shellSaving || shellCompleting} className="flex items-center justify-center gap-2 h-11 px-4 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-700 disabled:opacity-50 transition-colors shrink-0">
                  {shellSaving ? <Loader2 size={14} className="animate-spin" /> : savedAt ? <CheckCircle2 size={14} className="text-emerald-500" /> : <Save size={14} />}
                  Save Draft
                </button>

                {/* Incomplete — red, marks form as complete */}
                <button onClick={() => void handleComplete()} disabled={shellSaving || shellCompleting} className="flex-1 flex items-center justify-center gap-2 h-11 rounded-2xl bg-red-600 hover:bg-red-700 active:bg-red-800 text-white text-sm font-bold disabled:opacity-50 transition-colors shadow-sm">
                  {shellCompleting ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                  Incomplete
                </button>
              </div>)}

          </div>
        </footer>
      </div>
    </>;
}
