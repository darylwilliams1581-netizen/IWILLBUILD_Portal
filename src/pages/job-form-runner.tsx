/**
 * /jobs/:id/forms/:formInstanceId
 *
 * Shared Form Runner Shell — wraps FormRunner for every entry path:
 *   • Standalone Forms → /jobs/0/forms/:id  (navigate with state { returnTo: '/forms' })
 *   • Job Forms tab    → /jobs/:id/forms/:id (navigate with state { returnTo: '/jobs/:id?tab=forms' })
 *   • Submissions      → navigate with state { returnTo: '/forms?tab=submissions' }
 *
 * The shell owns:
 *   - Sticky top header: back button, form title, state badge, progress counter, three-dot menu
 *   - Sticky bottom action bar: Save Draft + Complete (active) | PDF/Email/Share + Edit/Reopen (completed)
 *
 * FormRunner is a pure document renderer — no navigation, no action buttons.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  Loader2,
  AlertTriangle,
  ChevronLeft,
  CheckCircle2,
  Clock,
  Pencil,
  MoreVertical,
  Save,
  Send,
  FileDown,
  Mail,
  Share2,
  RotateCcw,
} from 'lucide-react';
import FormRunner from '@/components/job/FormRunner';
import type { FormSubmission } from '@/components/job/form-types';
import type { Job } from '@/lib/jobs-api';
import { useDocumentActions } from '@/lib/document-actions-context';

// ── Types ─────────────────────────────────────────────────────────────────────

interface LocationState {
  returnTo?: string;
}

// ── Shell ─────────────────────────────────────────────────────────────────────

export default function JobFormRunnerPage() {
  const { id, formInstanceId } = useParams<{ id: string; formInstanceId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const jobId = Number(id);
  const submissionId = Number(formInstanceId);

  // Determine where Back should go
  const locationState = (location.state ?? {}) as LocationState;
  const returnTo = locationState.returnTo ?? (jobId > 0 ? `/jobs/${jobId}?tab=forms` : '/forms');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submission, setSubmission] = useState<FormSubmission | null>(null);
  const [templateName, setTemplateName] = useState('Form');
  const [job, setJob] = useState<Job | null>(null);

  // Shell-owned state
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [progress, setProgress] = useState({ answered: 0, total: 0 });
  const [menuOpen, setMenuOpen] = useState(false);
  const [shellSaving, setShellSaving] = useState(false);
  const [shellCompleting, setShellCompleting] = useState(false);
  const [shellReopening, setShellReopening] = useState(false);
  const [actionError, setActionError] = useState('');

  // Refs to call FormRunner's save/complete from the shell footer
  const saveRef = useRef<(() => Promise<void>) | null>(null);
  const completeRef = useRef<(() => Promise<void>) | null>(null);

  // Document actions (PDF / Email / Secure Share)
  const { openModal } = useDocumentActions();

  useEffect(() => {
    if (!submissionId) { setError('Invalid URL'); setLoading(false); return; }

    async function load() {
      try {
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

        const completed = subData.submission.status === 'completed' || subData.submission.status === 'submitted';
        setIsReadOnly(completed);
        setIsDone(completed);

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

  function handleBack() {
    navigate(returnTo, { replace: false });
  }

  // Shell-level reopen — calls API then flips readOnly off
  const handleReopen = useCallback(async () => {
    if (!submission) return;
    setShellReopening(true);
    setActionError('');
    try {
      const res = await fetch(`/api/job-forms/${submission.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'in_progress' }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
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

  // Shell Save Draft — delegates to FormRunner via ref
  async function handleSaveDraft() {
    if (!saveRef.current) return;
    setShellSaving(true);
    try {
      await saveRef.current();
    } finally {
      setShellSaving(false);
    }
  }

  // Shell Complete Form — delegates to FormRunner via ref
  async function handleComplete() {
    if (!completeRef.current) return;
    setShellCompleting(true);
    try {
      await completeRef.current();
    } finally {
      setShellCompleting(false);
    }
  }

  // Called by FormRunner when completion succeeds
  function onFormComplete() {
    setIsReadOnly(true);
    setIsDone(true);
  }

  // ── State badge ───────────────────────────────────────────────────────────────
  function StateBadge() {
    if (isDone) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 size={9} /> Completed
        </span>
      );
    }
    const hasDraft = submission?.status === 'in_progress' && savedAt;
    if (hasDraft) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
          <Clock size={9} /> Draft
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
        Filling out
      </span>
    );
  }

  // ── Loading / error states ────────────────────────────────────────────────────

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
          onClick={handleBack}
          className="text-xs text-slate-600 hover:text-slate-800 underline"
        >
          Go back
        </button>
      </div>
    );
  }

  const isStandalone = !jobId || jobId === 0;

  return (
    <>
      <Helmet>
        <title>{templateName}{job ? ` — ${job.name ?? `Job #${jobId}`}` : ''} | IWillBuild</title>
        <meta name="description" content={`${isDone ? 'View completed' : 'Complete the'} ${templateName} form${job ? ` for ${job.name ?? `Job #${jobId}`}` : ''}.`} />
        <link rel="canonical" href={typeof window !== 'undefined' ? window.location.href : ''} />
        <meta name="robots" content="noindex" />
      </Helmet>

      {/* ── Full-height shell ─────────────────────────────────────────────────── */}
      <div className="min-h-screen bg-slate-50 flex flex-col">

        {/* ── Sticky top header ─────────────────────────────────────────────── */}
        <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">

            {/* Back — exactly one */}
            <button
              onClick={handleBack}
              className="p-2 -ml-1 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors shrink-0"
              aria-label="Back"
            >
              <ChevronLeft size={20} />
            </button>

            {/* Title + state */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-heading font-bold text-base text-slate-900 truncate leading-tight">
                  {templateName}
                </h1>
                <StateBadge />
              </div>
              {job && (
                <p className="text-[11px] text-slate-400 truncate leading-tight mt-0.5">
                  {job.jobNumber ? `${job.jobNumber} · ` : ''}{job.name}
                </p>
              )}
            </div>

            {/* Progress counter — only when filling out */}
            {!isReadOnly && progress.total > 0 && (
              <div className="text-right shrink-0">
                <p className="text-xs font-bold text-slate-700 leading-tight">{progress.answered}/{progress.total}</p>
                <p className="text-[10px] text-slate-400 leading-tight">answered</p>
              </div>
            )}

            {/* Saved-at indicator */}
            {!isReadOnly && savedAt && (
              <span className="text-[11px] text-emerald-600 font-medium shrink-0 hidden sm:block">
                Saved {savedAt.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}

            {/* Three-dot menu */}
            <div className="relative shrink-0">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors"
                aria-label="More options"
              >
                <MoreVertical size={18} />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-2xl shadow-xl py-1.5 min-w-[180px]">
                    {isReadOnly ? (
                      <>
                        <button
                          onClick={() => { setMenuOpen(false); openModal(); }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                          <FileDown size={15} className="text-slate-400" /> PDF / Export
                        </button>
                        <button
                          onClick={() => { setMenuOpen(false); openModal(); }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                          <Mail size={15} className="text-slate-400" /> Send by Email
                        </button>
                        <button
                          onClick={() => { setMenuOpen(false); openModal(); }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                          <Share2 size={15} className="text-slate-400" /> Secure Share
                        </button>
                        <div className="h-px bg-slate-100 my-1" />
                        <button
                          onClick={() => { setMenuOpen(false); void handleReopen(); }}
                          disabled={shellReopening}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-amber-600 hover:bg-amber-50 transition-colors disabled:opacity-50"
                        >
                          {shellReopening ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}
                          Edit / Reopen
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => { setMenuOpen(false); void handleSaveDraft(); }}
                        disabled={shellSaving}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
                      >
                        {shellSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} className="text-slate-400" />}
                        Save Draft
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Action error banner */}
          {actionError && (
            <div className="max-w-2xl mx-auto px-4 pb-2">
              <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                <AlertTriangle size={12} /> {actionError}
                <button onClick={() => setActionError('')} className="ml-auto text-red-400 hover:text-red-600">✕</button>
              </div>
            </div>
          )}
        </header>

        {/* ── Scrollable form content ───────────────────────────────────────── */}
        <main className="flex-1 px-4 py-4 sm:px-6 sm:py-6">
          <h2 className="sr-only">{templateName}</h2>
          <FormRunner
            jobId={isStandalone ? undefined : jobId}
            job={job}
            submission={submission}
            templateName={templateName}
            readOnly={isReadOnly}
            onReopen={handleReopen}
            onComplete={onFormComplete}
            onSaved={(at) => setSavedAt(at)}
            onProgressChange={(answered, total) => setProgress({ answered, total })}
            saveRef={saveRef}
            completeRef={completeRef}
          />
        </main>

        {/* ── Sticky bottom action bar ──────────────────────────────────────── */}
        <footer
          className="sticky bottom-0 z-30 bg-white border-t border-slate-200 shadow-sm"
          style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
        >
          <div className="max-w-2xl mx-auto px-4 pt-3 pb-1">
            {isReadOnly ? (
              /* ── Completed form actions ── */
              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => openModal()}
                  className="flex-1 flex items-center justify-center gap-2 h-11 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-700 transition-colors"
                >
                  <FileDown size={15} className="text-slate-400" /> PDF
                </button>
                <button
                  onClick={() => openModal()}
                  className="flex-1 flex items-center justify-center gap-2 h-11 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-700 transition-colors"
                >
                  <Mail size={15} className="text-slate-400" /> Email
                </button>
                <button
                  onClick={() => openModal()}
                  className="flex-1 flex items-center justify-center gap-2 h-11 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-700 transition-colors"
                >
                  <Share2 size={15} className="text-slate-400" /> Share
                </button>
                <button
                  onClick={() => void handleReopen()}
                  disabled={shellReopening}
                  className="flex items-center justify-center gap-2 h-11 px-4 rounded-2xl border border-amber-200 bg-amber-50 hover:bg-amber-100 text-sm font-bold text-amber-700 disabled:opacity-50 transition-colors"
                >
                  {shellReopening
                    ? <Loader2 size={14} className="animate-spin" />
                    : <Pencil size={14} />}
                  Edit
                </button>
              </div>
            ) : (
              /* ── Active / draft form actions ── */
              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2.5">
                <button
                  onClick={() => void handleSaveDraft()}
                  disabled={shellSaving || shellCompleting}
                  className="flex items-center justify-center gap-2 h-11 px-4 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-700 disabled:opacity-50 transition-colors sm:w-auto"
                >
                  {shellSaving
                    ? <Loader2 size={14} className="animate-spin" />
                    : savedAt
                    ? <CheckCircle2 size={14} className="text-emerald-500" />
                    : <Save size={14} />}
                  Save Draft
                </button>
                <button
                  onClick={() => void handleComplete()}
                  disabled={shellSaving || shellCompleting}
                  className="flex-1 flex items-center justify-center gap-2 h-11 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-sm font-bold disabled:opacity-50 transition-colors shadow-sm"
                >
                  {shellCompleting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  Complete Form
                </button>
              </div>
            )}
          </div>
        </footer>
      </div>
    </>
  );
}
