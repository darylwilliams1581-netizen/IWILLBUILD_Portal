/**
 * /jobs/:id/forms — Full-screen forms page for a job.
 * Lists form submissions with template name, status, completed-by, date.
 * Tapping a submission opens the job-form-runner to view/fill.
 * Purple theme to match the Forms icon tile.
 */
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  ArrowLeft, FileText, Loader2, Download, Plus,
  CheckCircle2, Clock, ChevronRight, AlertCircle, Eye, EyeOff,
} from 'lucide-react';

interface Job {
  id: number;
  name: string;
  jobNumber?: string | null;
}

interface FormTemplate {
  id: number;
  name: string;
  category?: string | null;
  description?: string | null;
}

interface FormSubmission {
  id: number;
  templateId: number | null;
  completedByName?: string | null;
  completedByUserId: string;
  status: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; icon: React.ElementType }> = {
  completed:   { label: 'Completed',   bg: 'bg-emerald-100', text: 'text-emerald-700', icon: CheckCircle2 },
  in_progress: { label: 'In Progress', bg: 'bg-amber-100',   text: 'text-amber-700',   icon: Clock },
};

function statusConfig(status: string) {
  return STATUS_CONFIG[status] ?? { label: status, bg: 'bg-gray-100', text: 'text-gray-600', icon: AlertCircle };
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function JobFormsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const jobId = Number(id);

  const [job, setJob] = useState<Job | null>(null);
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [submissions, setSubmissions] = useState<FormSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [creatingForm, setCreatingForm] = useState(false);

  useEffect(() => {
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
    ])
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/jobs/${id}/forms/export-csv`, { credentials: 'include' });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `job-${id}-forms.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch { /* silent */ } finally { setExporting(false); }
  };

  const templateMap = new Map(templates.map(t => [t.id, t]));
  const title = job ? `${job.name} — Forms` : 'Job Forms';

  // Create submission then navigate to runner
  const startForm = async (templateId: number) => {
    setCreatingForm(true);
    setShowTemplates(false);
    try {
      const res = await fetch(`/api/jobs/${id}/forms`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId }),
      });
      const data = await res.json() as { ok?: boolean; submission?: { id: number }; error?: string };
      if (!res.ok || !data.submission?.id) throw new Error(data.error ?? 'Failed to start form');
      navigate(`/jobs/${id}/forms/${data.submission.id}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not start form');
      setCreatingForm(false);
    }
  };

  // Filter by completed toggle
  const visibleSubmissions = showCompleted
    ? submissions
    : submissions.filter(s => s.status !== 'completed');

  // Group visible submissions by template
  const byTemplate = new Map<number | null, FormSubmission[]>();
  for (const s of visibleSubmissions) {
    const key = s.templateId ?? null;
    if (!byTemplate.has(key)) byTemplate.set(key, []);
    byTemplate.get(key)!.push(s);
  }

  const completedCount = submissions.filter(s => s.status === 'completed').length;
  const inProgressCount = submissions.filter(s => s.status === 'in_progress').length;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Helmet>
        <title>{title} — IWILLBUILD</title>
        <meta name="description" content="View and manage form submissions for this job." />
        <meta name="robots" content="noindex, nofollow" />
        <link rel="canonical" href={`https://iwillbuild.com/jobs/${id}/forms`} />
      </Helmet>

      {/* ── Desktop top bar ── */}
      <div className="hidden md:flex bg-white border-b border-gray-100 px-4 py-3 items-center gap-3 shrink-0" style={{ boxShadow: '0 1px 0 rgba(0,0,0,0.05)' }}>
        <button onClick={() => navigate('/home')} className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-gray-200 transition-colors shrink-0">
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-purple-100 flex items-center justify-center shrink-0">
            <FileText size={15} className="text-purple-600" />
          </div>
          <div className="min-w-0">
            {loading ? <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" /> : (
              <>
                <h1 className="text-gray-900 font-bold text-sm leading-tight truncate">{job?.name ?? 'Job Forms'}</h1>
                {job?.jobNumber && <p className="text-gray-400 text-xs font-mono leading-tight">{job.jobNumber}</p>}
              </>
            )}
          </div>
        </div>
        <button onClick={() => setShowTemplates(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500 hover:bg-purple-600 text-white text-xs font-semibold rounded-lg transition-colors">
          <Plus size={13} /> New Form
        </button>
        <button
          onClick={() => setShowCompleted(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 border text-xs font-semibold rounded-lg transition-colors ${showCompleted ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
        >
          {showCompleted ? <Eye size={13} /> : <EyeOff size={13} />}
          {showCompleted ? 'Hiding none' : 'Show completed'}
        </button>
        <button onClick={exportCsv} disabled={exporting} className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 text-xs font-semibold text-gray-600 rounded-lg transition-colors">
          {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
          Export CSV
        </button>
      </div>

      {/* ── Mobile: back arrow ── */}
      <button onClick={() => navigate('/home')} className="md:hidden fixed top-3 left-3 z-20 w-9 h-9 rounded-xl bg-white/90 backdrop-blur-sm shadow-sm border border-gray-100 flex items-center justify-center text-gray-600 active:bg-gray-100 transition-colors" aria-label="Back">
        <ArrowLeft size={18} />
      </button>

      {/* ── Mobile: action buttons top-right ── */}
      <div className="md:hidden fixed top-3 right-3 z-20 flex items-center gap-2">
        <button
          onClick={() => setShowCompleted(v => !v)}
          className={`h-9 px-3 rounded-xl shadow-sm border flex items-center gap-1.5 text-xs font-semibold transition-colors ${showCompleted ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white/90 backdrop-blur-sm border-gray-100 text-gray-600'}`}
        >
          {showCompleted ? <Eye size={13} /> : <EyeOff size={13} />}
          {showCompleted ? 'All' : 'Active'}
        </button>
        <button onClick={() => setShowTemplates(true)} className="h-9 w-9 rounded-xl bg-purple-500 shadow-sm flex items-center justify-center text-white active:bg-purple-600 transition-colors" aria-label="New form">
          <Plus size={16} />
        </button>
        <button onClick={exportCsv} disabled={exporting} className="h-9 px-3 rounded-xl bg-white/90 backdrop-blur-sm shadow-sm border border-gray-100 flex items-center gap-1.5 text-xs font-semibold text-gray-600 active:bg-gray-100 disabled:opacity-40 transition-colors">
          {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
          CSV
        </button>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-purple-400" />
          </div>
        ) : (
          <div className="px-4 py-4 pb-24 md:pb-6 max-w-3xl mx-auto w-full space-y-4">

            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Total', value: submissions.length, color: 'text-gray-900' },
                { label: 'Completed', value: completedCount, color: 'text-emerald-600' },
                { label: 'In Progress', value: inProgressCount, color: 'text-amber-600' },
              ].map(c => (
                <div key={c.label} className="bg-white rounded-2xl border border-gray-100 px-3 py-3 text-center" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                  <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
                  <p className="text-gray-400 text-xs mt-0.5">{c.label}</p>
                </div>
              ))}
            </div>

            {/* Submissions list */}
            {creatingForm ? (
              <div className="flex items-center justify-center py-12 gap-2 text-purple-500">
                <Loader2 size={20} className="animate-spin" />
                <span className="text-sm font-medium">Starting form…</span>
              </div>
            ) : visibleSubmissions.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 px-6 py-12 text-center" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <div className="w-12 h-12 rounded-2xl bg-purple-50 flex items-center justify-center mx-auto mb-3">
                  <FileText size={22} className="text-purple-400" />
                </div>
                <p className="text-gray-700 font-semibold text-sm">
                  {submissions.length > 0 && !showCompleted ? 'All forms completed' : 'No forms yet'}
                </p>
                <p className="text-gray-400 text-xs mt-1">
                  {submissions.length > 0 && !showCompleted
                    ? 'Toggle "Show completed" to see them'
                    : 'Tap New Form to start a submission'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {visibleSubmissions.map((s, i) => {
                  const cfg = statusConfig(s.status);
                  const StatusIcon = cfg.icon;
                  const tmpl = s.templateId ? templateMap.get(s.templateId) : null;
                  return (
                    <motion.button
                      key={s.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      onClick={() => navigate(`/jobs/${id}/forms/${s.id}`)}
                      className="w-full bg-white rounded-2xl border border-gray-100 px-4 py-3.5 flex items-center gap-3 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors"
                      style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
                    >
                      <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
                        <FileText size={16} className="text-purple-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-gray-900 font-semibold text-sm truncate">
                          {tmpl?.name ?? `Form #${s.id}`}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>
                            <StatusIcon size={9} />
                            {cfg.label}
                          </span>
                          {s.completedByName && (
                            <span className="text-gray-400 text-xs truncate">{s.completedByName}</span>
                          )}
                          {s.createdAt && (
                            <span className="text-gray-300 text-xs shrink-0">{fmtDate(s.createdAt)}</span>
                          )}
                        </div>
                      </div>
                      <ChevronRight size={15} className="text-gray-300 shrink-0" />
                    </motion.button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Mobile bottom bar ── */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-10 bg-white border-t border-gray-100" style={{ boxShadow: '0 -1px 0 rgba(0,0,0,0.05)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-8 h-8 rounded-xl bg-purple-100 flex items-center justify-center shrink-0">
            <FileText size={15} className="text-purple-600" />
          </div>
          <div className="flex-1 min-w-0">
            {loading ? <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" /> : (
              <>
                <p className="text-gray-900 font-bold text-sm leading-tight truncate">{job?.name ?? 'Job Forms'}</p>
                {job?.jobNumber && <p className="text-gray-400 text-xs font-mono leading-tight">{job.jobNumber}</p>}
              </>
            )}
          </div>
          <span className="text-gray-400 text-xs">{visibleSubmissions.length}/{submissions.length} form{submissions.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* ── Template picker sheet ── */}
      <AnimatePresence>
        {showTemplates && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]" onClick={() => setShowTemplates(false)} />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 320 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl max-h-[80vh] flex flex-col overflow-hidden"
              style={{ boxShadow: '0 -4px 32px rgba(0,0,0,0.12)' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-center pt-3 pb-1 shrink-0"><div className="w-10 h-1 rounded-full bg-gray-200" /></div>
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
                <h2 className="text-gray-900 font-bold text-base">Choose a Form</h2>
                <button onClick={() => setShowTemplates(false)} className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors">
                  <ArrowLeft size={14} />
                </button>
              </div>
              <div className="overflow-y-auto flex-1 px-4 py-3 space-y-1.5">
                {templates.length === 0 ? (
                  <p className="text-center text-gray-400 text-sm py-8">No form templates available.<br />Create templates in Studio → Forms.</p>
                ) : templates.map(t => (
                  <button
                    key={t.id}
                    onClick={() => { void startForm(t.id); }}
                    className="w-full flex items-center gap-3 bg-gray-50 hover:bg-purple-50 border border-gray-200 hover:border-purple-200 rounded-xl px-3 py-3 text-left transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
                      <FileText size={14} className="text-purple-600" />
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
