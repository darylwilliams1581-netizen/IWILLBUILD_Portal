/**
 * /jobs/:id/forms — Job forms list.
 * Cards match the reference design: title, by/date, status badge,
 * action buttons (View/Continue, Print/PDF, Reopen, Share, Delete).
 */
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  ArrowLeft, FileText, Loader2, Plus,
  CheckCircle2, Clock, Eye, EyeOff,
  Printer, Share2, Trash2, RotateCcw, ExternalLink,
  ChevronRight, AlertCircle, House,
} from 'lucide-react';

interface Job { id: number; name: string; jobNumber?: string | null }
interface FormTemplate { id: number; name: string; category?: string | null }
interface FormSubmission {
  id: number;
  templateId: number | null;
  completedByName?: string | null;
  status: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function JobFormsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [job, setJob] = useState<Job | null>(null);
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [submissions, setSubmissions] = useState<FormSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showCompleted, setShowCompleted] = useState(true);
  const [creatingForm, setCreatingForm] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [reopeningId, setReopeningId] = useState<number | null>(null);

  const load = () => {
    if (!id) { setLoading(false); return; }
    Promise.all([
      fetch(`/api/jobs/${id}`, { credentials: 'include' })
        .then(r => r.json() as Promise<{ job?: Job } | Job>)
        .then(data => {
          const j = data && typeof data === 'object' && 'job' in data ? data.job : data as Job;
          setJob(j ?? null);
        }),
      fetch(`/api/jobs/${id}/forms`, { credentials: 'include' })
        .then(r => r.json() as Promise<{ templates: FormTemplate[]; submissions: FormSubmission[] }>)
        .then(data => {
          setTemplates(data.templates ?? []);
          setSubmissions(data.submissions ?? []);
        }),
    ]).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  const startForm = async (templateId: number) => {
    setCreatingForm(true);
    setShowTemplates(false);
    try {
      const res = await fetch(`/api/jobs/${id}/forms`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId }),
      });
      const data = await res.json() as { submission?: { id: number }; error?: string };
      if (!res.ok || !data.submission?.id) throw new Error(data.error ?? 'Failed to start form');
      navigate(`/jobs/${id}/forms/${data.submission.id}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not start form');
      setCreatingForm(false);
    }
  };

  const deleteSubmission = async (submissionId: number) => {
    if (!confirm('Delete this form submission? This cannot be undone.')) return;
    setDeletingId(submissionId);
    try {
      await fetch(`/api/jobs/${id}/forms/${submissionId}`, { method: 'DELETE', credentials: 'include' });
      setSubmissions(prev => prev.filter(s => s.id !== submissionId));
    } catch { /* silent */ } finally { setDeletingId(null); }
  };

  const reopenSubmission = async (submissionId: number) => {
    setReopeningId(submissionId);
    try {
      const res = await fetch(`/api/jobs/${id}/forms/${submissionId}/reopen`, { method: 'POST', credentials: 'include' });
      if (res.ok) {
        setSubmissions(prev => prev.map(s => s.id === submissionId ? { ...s, status: 'in_progress' } : s));
      }
    } catch { /* silent */ } finally { setReopeningId(null); }
  };

  const templateMap = new Map(templates.map(t => [t.id, t]));
  const visibleSubmissions = showCompleted
    ? submissions
    : submissions.filter(s => s.status !== 'completed');
  const completedCount = submissions.filter(s => s.status === 'completed').length;
  const inProgressCount = submissions.filter(s => s.status === 'in_progress').length;
  const title = job ? `${job.name} — Forms` : 'Job Forms';

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Helmet>
        <title>{title} — IWILLBUILD</title>
        <meta name="description" content="View and manage form submissions for this job." />
        <link rel="canonical" href={`https://iwillbuild.com/jobs/${id}/forms`} />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      {/* ── Top bar ── */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 shrink-0 sticky top-0 z-10" style={{ boxShadow: '0 1px 0 rgba(0,0,0,0.05)' }}>
        <button onClick={() => navigate(`/jobs/${id}`)} className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-gray-200 transition-colors shrink-0">
          <ArrowLeft size={18} />
        </button>
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={() => navigate('/home')} className="flex items-center justify-center w-9 h-9 rounded-lg bg-orange-500 text-white hover:bg-orange-600 active:bg-orange-700 transition-colors touch-manipulation shadow-sm" title="Dashboard"><House size={18} /></button>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center min-w-0 px-2">
            {loading ? <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" /> : (
              <>
                <h1 className="text-gray-900 font-bold text-sm leading-tight truncate text-center w-full">{job?.name ?? 'Job Forms'}</h1>
                <div className="flex items-center gap-1 text-xs text-gray-400 leading-tight">
                  <button onClick={() => navigate('/jobs')} className="hover:text-orange-500 transition-colors">Jobs</button>
                  <span>/</span>
                  <button onClick={() => navigate(`/jobs/${id}`)} className="hover:text-orange-500 transition-colors truncate max-w-[80px]">{job?.name ?? '...'}</button>
                  <span>/</span>
                  <span className="text-gray-500 font-medium">Forms</span>
                </div>
              </>
            )}
          </div>
        {/* Toggle completed */}
        <button
          onClick={() => setShowCompleted(v => !v)}
          className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 border text-xs font-semibold rounded-lg transition-colors ${showCompleted ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}
        >
          {showCompleted ? <Eye size={13} /> : <EyeOff size={13} />}
          {showCompleted ? 'Showing all' : 'Show completed'}
        </button>
        {/* New Form */}
        <button
          onClick={() => setShowTemplates(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-lg transition-colors"
        >
          <Plus size={13} /> New Form
        </button>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-purple-400" />
          </div>
        ) : (
          <div className="px-4 py-5 pb-24 max-w-3xl mx-auto w-full space-y-4">

            {/* Header row */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-gray-900 font-bold text-lg">Job Forms</h2>
                <p className="text-gray-400 text-sm">{submissions.length} form{submissions.length !== 1 ? 's' : ''} on this job</p>
              </div>
              {/* Mobile completed toggle */}
              <button
                onClick={() => setShowCompleted(v => !v)}
                className={`sm:hidden flex items-center gap-1.5 px-3 py-1.5 border text-xs font-semibold rounded-lg transition-colors ${showCompleted ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-gray-200 text-gray-500'}`}
              >
                {showCompleted ? <Eye size={13} /> : <EyeOff size={13} />}
                {showCompleted ? 'All' : 'Active'}
              </button>
            </div>

            {/* Creating spinner */}
            {creatingForm && (
              <div className="flex items-center gap-2 text-orange-500 py-2">
                <Loader2 size={16} className="animate-spin" />
                <span className="text-sm font-medium">Starting form…</span>
              </div>
            )}

            {/* Empty state */}
            {!creatingForm && visibleSubmissions.length === 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 px-6 py-14 text-center" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <div className="w-12 h-12 rounded-2xl bg-purple-50 flex items-center justify-center mx-auto mb-3">
                  <FileText size={22} className="text-purple-400" />
                </div>
                <p className="text-gray-700 font-semibold text-sm">
                  {submissions.length > 0 && !showCompleted ? 'All forms completed' : 'No forms yet'}
                </p>
                <p className="text-gray-400 text-xs mt-1">
                  {submissions.length > 0 && !showCompleted
                    ? 'Tap "Show completed" to see them'
                    : 'Tap "+ New Form" to start a submission'}
                </p>
              </div>
            )}

            {/* Submission cards */}
            {!creatingForm && visibleSubmissions.length > 0 && (
              <div className="space-y-3">
                {visibleSubmissions.map((s, i) => {
                  const tmpl = s.templateId ? templateMap.get(s.templateId) : null;
                  const isCompleted = s.status === 'completed';
                  const isDeleting = deletingId === s.id;
                  const isReopening = reopeningId === s.id;

                  return (
                    <motion.div
                      key={s.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
                      style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.07)' }}
                    >
                      {/* Card header */}
                      <div className="px-4 pt-4 pb-3 flex items-start gap-3">
                        {/* Status dot */}
                        <div className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${isCompleted ? 'bg-emerald-100' : 'bg-amber-100'}`}>
                          {isCompleted
                            ? <CheckCircle2 size={13} className="text-emerald-600" />
                            : <Clock size={13} className="text-amber-600" />
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-gray-900 font-bold text-sm leading-snug">
                            {tmpl?.name ?? `Form #${s.id}`}
                          </p>
                          <p className="text-gray-400 text-xs mt-0.5">
                            {isCompleted ? 'Completed' : 'Started'} by {s.completedByName ?? 'Unknown'}
                            {s.createdAt ? ` · ${fmtDate(s.createdAt)}` : ''}
                          </p>
                        </div>
                        {/* Status badge */}
                        <span className={`shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full border ${isCompleted ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                          {isCompleted ? '✓ Completed' : '⏳ In Progress'}
                        </span>
                        {/* Open in new tab */}
                        <button
                          onClick={() => window.open(`/jobs/${id}/forms/${s.id}`, '_blank')}
                          className="shrink-0 w-7 h-7 rounded-lg bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-400 transition-colors"
                          title="Open in new tab"
                        >
                          <ExternalLink size={12} />
                        </button>
                      </div>

                      {/* Divider */}
                      <div className="border-t border-gray-100 mx-4" />

                      {/* Action buttons */}
                      <div className="px-4 py-3 flex items-center gap-2 flex-wrap">
                        {/* Primary: View or Continue */}
                        <button
                          onClick={() => navigate(`/jobs/${id}/forms/${s.id}`)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${isCompleted ? 'bg-gray-100 hover:bg-gray-200 text-gray-700' : 'bg-orange-500 hover:bg-orange-600 text-white'}`}
                        >
                          {isCompleted ? <Eye size={12} /> : <ChevronRight size={12} />}
                          {isCompleted ? 'View' : 'Continue'}
                        </button>

                        {/* Print / PDF */}
                        <button
                          onClick={() => navigate(`/jobs/${id}/forms/${s.id}?print=1`)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-xs font-semibold text-gray-600 transition-colors"
                        >
                          <Printer size={12} /> Print / PDF
                        </button>

                        {/* Reopen — only for completed */}
                        {isCompleted && (
                          <button
                            onClick={() => void reopenSubmission(s.id)}
                            disabled={isReopening}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-xs font-semibold text-gray-600 disabled:opacity-50 transition-colors"
                          >
                            {isReopening ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                            Reopen
                          </button>
                        )}

                        <div className="flex-1" />

                        {/* Share */}
                        <button
                          onClick={() => {
                            const url = `${window.location.origin}/jobs/${id}/forms/${s.id}`;
                            void navigator.clipboard?.writeText(url).then(() => alert('Link copied!'));
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-xs font-semibold text-gray-500 transition-colors"
                        >
                          <Share2 size={12} /> Share
                        </button>

                        {/* Delete */}
                        <button
                          onClick={() => void deleteSubmission(s.id)}
                          disabled={isDeleting}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-100 bg-white hover:bg-red-50 text-xs font-semibold text-red-500 disabled:opacity-50 transition-colors"
                        >
                          {isDeleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                          Delete
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}

            {/* Stats footer */}
            {submissions.length > 0 && (
              <div className="flex items-center gap-4 pt-2 pb-2">
                <span className="text-xs text-gray-400">{completedCount} completed</span>
                <span className="text-xs text-gray-300">·</span>
                <span className="text-xs text-gray-400">{inProgressCount} in progress</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Template picker sheet ── */}
      <AnimatePresence>
        {showTemplates && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
              onClick={() => setShowTemplates(false)}
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 320 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl max-h-[80vh] flex flex-col overflow-hidden"
              style={{ boxShadow: '0 -4px 32px rgba(0,0,0,0.12)' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-center pt-3 pb-1 shrink-0">
                <div className="w-10 h-1 rounded-full bg-gray-200" />
              </div>
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
                <div>
                  <h2 className="text-gray-900 font-bold text-base">Choose a Form</h2>
                  <p className="text-gray-400 text-xs">Select a template to start</p>
                </div>
                <button onClick={() => setShowTemplates(false)} className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors">
                  <ArrowLeft size={14} />
                </button>
              </div>
              <div className="overflow-y-auto flex-1 px-4 py-3 space-y-1.5">
                {templates.length === 0 ? (
                  <div className="text-center py-10">
                    <AlertCircle size={24} className="text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-400 text-sm">No form templates available.</p>
                    <p className="text-gray-300 text-xs mt-1">Create templates in Studio → Forms.</p>
                  </div>
                ) : templates.map(t => (
                  <button
                    key={t.id}
                    onClick={() => { void startForm(t.id); }}
                    className="w-full flex items-center gap-3 bg-gray-50 hover:bg-orange-50 border border-gray-200 hover:border-orange-200 rounded-xl px-3 py-3 text-left transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center shrink-0">
                      <FileText size={14} className="text-orange-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-900 font-semibold text-sm truncate">{t.name}</p>
                      {t.category && <p className="text-gray-400 text-xs">{t.category}</p>}
                    </div>
                    <ChevronRight size={14} className="text-gray-300 shrink-0" />
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
