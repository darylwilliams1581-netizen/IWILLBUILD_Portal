/**
 * /jobs/:id/forms — Job forms list.
 * Cards match the reference design: title, by/date, status badge,
 * action buttons (View/Continue, Print/PDF, Reopen, Share, Delete).
 * Path B standalone page — reached via Work & Field launcher.
 * @seo-exempt
 */
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from "react-router";
import { motion, AnimatePresence } from 'motion/react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { ArrowLeft, FileText, Loader2, Plus, CheckCircle2, Clock, Eye, EyeOff, ChevronRight, AlertCircle } from 'lucide-react';
import JobFeatureShell from '@/components/job/JobFeatureShell';
interface Job {
  id: number;
  name: string;
  jobNumber?: string | null;
}
interface FormTemplate {
  id: number;
  name: string;
  category?: string | null;
}
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
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}
export default function JobFormsPage() {
  const {
    id
  } = useParams<{
    id: string;
  }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<Job | null>(null);
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [submissions, setSubmissions] = useState<FormSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showCompleted, setShowCompleted] = useState(true);
  const [creatingForm, setCreatingForm] = useState(false);
  const load = () => {
    if (!id) {
      setLoading(false);
      return;
    }
    Promise.all([fetch(`/api/jobs/${id}`, {
      credentials: 'include'
    }).then(r => r.json() as Promise<{
      job?: Job;
    } | Job>).then(data => {
      const j = data && typeof data === 'object' && 'job' in data ? data.job : data as Job;
      setJob(j ?? null);
    }), fetch(`/api/jobs/${id}/forms`, {
      credentials: 'include'
    }).then(r => r.json() as Promise<{
      templates: FormTemplate[];
      submissions: FormSubmission[];
    }>).then(data => {
      setTemplates(data.templates ?? []);
      setSubmissions(data.submissions ?? []);
    })]).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(load, [id]);
  const startForm = async (templateId: number) => {
    setCreatingForm(true);
    setShowTemplates(false);
    try {
      const res = await fetch(`/api/jobs/${id}/forms`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          templateId
        })
      });
      const data = (await res.json()) as {
        submission?: {
          id: number;
        };
        error?: string;
      };
      if (!res.ok || !data.submission?.id) throw new Error(data.error ?? 'Failed to start form');
      navigate(`/jobs/${id}/forms/${data.submission.id}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not start form');
      setCreatingForm(false);
    }
  };
  const templateMap = new Map(templates.map(t => [t.id, t]));
  const visibleSubmissions = showCompleted ? submissions : submissions.filter(s => s.status !== 'completed');
  const completedCount = submissions.filter(s => s.status === 'completed').length;
  const inProgressCount = submissions.filter(s => s.status === 'in_progress').length;
  const title = job ? `${job.name} — Forms` : 'Job Forms';

  function handleChangeJob() {
    navigate('/home?picker=forms');
  }

  return <div className="portal-page">
      <Helmet>
        <title>{title} — IWIllBUIlD</title>
        <meta name="description" content="View and manage form submissions for this job." />
        <link rel="canonical" href={`https://iwillbuild.com/jobs/${id}/forms`} />
        <meta name="robots" content="noindex" />
      </Helmet>
      <h1 className="sr-only">{title}</h1>

      <div className="portal-content flex flex-col p-0">
        <JobFeatureShell
          Icon={FileText}
          featureLabel="Forms"
          jobName={job?.name ?? 'Job'}
          jobNumber={job?.jobNumber}
          backTo="/home"
          onChangeJob={handleChangeJob}
          desktopActions={
            <div className="hidden md:flex items-center gap-1.5">
              <button onClick={() => setShowCompleted(v => !v)} className={`flex items-center gap-1.5 px-3 py-1.5 border text-xs font-semibold rounded-lg transition-colors ${showCompleted ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                {showCompleted ? <Eye size={13} /> : <EyeOff size={13} />}
                {showCompleted ? 'Showing all' : 'Show completed'}
              </button>
              <button onClick={() => setShowTemplates(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-violet-700 text-white text-xs font-semibold rounded-lg transition-colors">
                <Plus size={13} /> New Form
              </button>
            </div>
          }
        >
        {/* ── Mobile bottom bar ── */}
        <div className="md:hidden fixed bottom-0 inset-x-0 z-10 bg-white border-t border-border">
          <div className="flex items-center gap-2 px-3 py-2 pb-safe">
            <button onClick={() => setShowCompleted(v => !v)} className={`flex-1 flex items-center justify-center gap-1.5 h-10 border text-xs font-semibold rounded-xl transition-colors ${showCompleted ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-muted border-border text-muted-foreground'}`}>
              {showCompleted ? <Eye size={13} /> : <EyeOff size={13} />}
              {showCompleted ? 'All' : 'Active'}
            </button>
            <button onClick={() => setShowTemplates(true)} aria-label="New Form" className="w-10 h-10 rounded-xl bg-primary hover:bg-violet-700 active:bg-violet-800 flex items-center justify-center text-primary-foreground transition-colors touch-manipulation shrink-0 shadow-sm">
              <Plus size={18} />
            </button>
          </div>
        </div>
        {/* ── Content ── */}
        {loading ? <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-purple-400" />
          </div> : <div className="px-4 py-5 pb-24 max-w-3xl mx-auto w-full space-y-4">

            {/* Header row */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-gray-900 font-bold text-lg">Job Forms</h2>
                <p className="text-gray-400 text-sm">{submissions.length} form{submissions.length !== 1 ? 's' : ''} on this job</p>
              </div>
              {/* Mobile completed toggle */}
              <button onClick={() => setShowCompleted(v => !v)} className={`sm:hidden flex items-center gap-1.5 px-3 py-1.5 border text-xs font-semibold rounded-lg transition-colors ${showCompleted ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-gray-200 text-gray-500'}`}>
                {showCompleted ? <Eye size={13} /> : <EyeOff size={13} />}
                {showCompleted ? 'All' : 'Active'}
              </button>
            </div>

            {/* Creating spinner */}
            {creatingForm && <div className="flex items-center gap-2 text-violet-600 py-2">
                <Loader2 size={16} className="animate-spin" />
                <span className="text-sm font-medium">Starting form…</span>
              </div>}

            {/* Empty state */}
            {!creatingForm && visibleSubmissions.length === 0 && <div className="bg-white rounded-2xl border border-gray-100 px-6 py-14 text-center" style={{
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)'
        }}>
                <div className="w-12 h-12 rounded-2xl bg-purple-50 flex items-center justify-center mx-auto mb-3">
                  <FileText size={22} className="text-purple-400" />
                </div>
                <p className="text-gray-700 font-semibold text-sm">
                  {submissions.length > 0 && !showCompleted ? 'All forms completed' : 'No forms yet'}
                </p>
                <p className="text-gray-400 text-xs mt-1">
                  {submissions.length > 0 && !showCompleted ? 'Tap "Show completed" to see them' : 'Tap "+ New Form" to start a submission'}
                </p>
              </div>}

            {/* Submission pills */}
            {!creatingForm && visibleSubmissions.length > 0 && <div className="space-y-2">
                {visibleSubmissions.map((s, i) => {
            const tmpl = s.templateId ? templateMap.get(s.templateId) : null;
            const isCompleted = s.status === 'completed';
            return <motion.div key={s.id} initial={{
              opacity: 0,
              y: 6
            }} animate={{
              opacity: 1,
              y: 0
            }} transition={{
              delay: i * 0.04
            }} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                      <div onClick={() => navigate(`/jobs/${id}/forms/${s.id}`)} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-slate-50 active:bg-slate-100 transition-colors">
                        {/* Status icon */}
                        <div className={`p-1.5 rounded-lg shrink-0 ${isCompleted ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                          {isCompleted ? <CheckCircle2 size={13} className="text-emerald-600" /> : <Clock size={13} className="text-amber-500" />}
                        </div>

                        {/* Name + meta */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate leading-tight">
                            {tmpl?.name ?? `Form #${s.id}`}
                          </p>
                          <p className="text-[11px] text-slate-400 leading-tight mt-0.5 truncate">
                            {fmtDate(isCompleted ? s.updatedAt : s.createdAt)}
                            {s.completedByName ? ` · ${s.completedByName}` : ''}
                          </p>
                        </div>

                        {/* Status badge */}
                        <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border ${isCompleted ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                          {isCompleted ? 'Completed' : 'In Progress'}
                        </span>

                        {/* Chevron */}
                        <ChevronRight size={13} className="text-slate-300 shrink-0" />
                      </div>
                    </motion.div>;
          })}
              </div>}

            {/* Stats footer */}
            {submissions.length > 0 && <div className="flex items-center gap-4 pt-2 pb-2">
                <span className="text-xs text-gray-400">{completedCount} completed</span>
                <span className="text-xs text-gray-300">·</span>
                <span className="text-xs text-gray-400">{inProgressCount} in progress</span>
              </div>}
          </div>}

      {/* ── Template picker sheet ── */}
      <AnimatePresence>
        {showTemplates && <>
            <motion.div initial={{
          opacity: 0
        }} animate={{
          opacity: 1
        }} exit={{
          opacity: 0
        }} className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" onClick={() => setShowTemplates(false)} />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
              <motion.div initial={{
            opacity: 0,
            scale: 0.94,
            y: 12
          }} animate={{
            opacity: 1,
            scale: 1,
            y: 0
          }} exit={{
            opacity: 0,
            scale: 0.94,
            y: 12
          }} transition={{
            type: 'spring',
            damping: 28,
            stiffness: 340
          }} className="pointer-events-auto w-full max-w-sm bg-white rounded-3xl flex flex-col overflow-hidden" style={{
            boxShadow: '0 8px 48px rgba(0,0,0,0.18)',
            maxHeight: 'min(520px, calc(100dvh - 80px))'
          }} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-2xl bg-violet-100 flex items-center justify-center shrink-0">
                      <FileText size={17} className="text-violet-600" />
                    </div>
                    <div>
                      <h2 className="text-gray-900 font-bold text-base leading-tight">Choose a Form</h2>
                      <p className="text-gray-400 text-xs leading-tight mt-0.5">Select a template to start</p>
                    </div>
                  </div>
                  <button onClick={() => setShowTemplates(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 active:bg-gray-300 transition-colors shrink-0" aria-label="Close">
                    <ArrowLeft size={15} />
                  </button>
                </div>

                <div className="h-px bg-gray-100 shrink-0 mx-4" />

                <div className="overflow-y-auto flex-1 px-4 py-3 space-y-1.5">
                  {templates.length === 0 ? <div className="text-center py-10">
                      <AlertCircle size={24} className="text-gray-300 mx-auto mb-2" />
                      <p className="text-gray-400 text-sm">No form templates available.</p>
                      <p className="text-gray-300 text-xs mt-1">Create templates in Studio → Forms.</p>
                    </div> : templates.map(t => <button key={t.id} onClick={() => {
                void startForm(t.id);
              }} className="w-full flex items-center gap-3 bg-gray-50 hover:bg-violet-50 hover:border-violet-200 active:bg-violet-100 border border-gray-200 rounded-2xl px-4 py-3 text-left transition-colors">
                      <div className="w-2 h-2 rounded-full shrink-0 bg-violet-400" />
                      <div className="flex-1 min-w-0">
                        <p className="text-gray-900 font-semibold text-sm truncate">{t.name}</p>
                        {t.category && <p className="text-gray-400 text-xs mt-0.5">{t.category}</p>}
                      </div>
                      <ChevronRight size={14} className="text-gray-300 shrink-0" />
                    </button>)}
                </div>

                <div className="shrink-0" style={{
              height: 'max(env(safe-area-inset-bottom), 8px)'
            }} />
              </motion.div>
            </div>
          </>}
      </AnimatePresence>
        </JobFeatureShell>
      </div>
    </div>;
}
