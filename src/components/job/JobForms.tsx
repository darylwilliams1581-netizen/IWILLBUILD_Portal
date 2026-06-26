import { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Plus,
  Loader2,
  AlertCircle,
  Clock,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  PlayCircle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import FormRunner from './FormRunner';

// ── Types ─────────────────────────────────────────────────────────────────────

interface FormTemplate {
  id: number;
  name: string;
  formType: string;
  category: string | null;
  description: string | null;
  isActive: boolean;
}

interface FormSubmission {
  id: number;
  jobId: number;
  companyId: number;
  templateId: number;
  completedByUserId: string;
  completedByName: string | null;
  status: string;
  answersJson: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === 'completed') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
        <CheckCircle2 size={10} /> Completed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
      <Clock size={10} /> In Progress
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface JobFormsProps {
  jobId: number;
}

export default function JobForms({ jobId }: JobFormsProps) {
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [submissions, setSubmissions] = useState<FormSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState<number | null>(null);
  // Active runner: { submission, templateName }
  const [activeRunner, setActiveRunner] = useState<{ submission: FormSubmission; templateName: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/jobs/${jobId}/forms`, { credentials: 'include' });
      const data = await res.json() as {
        templates?: FormTemplate[];
        submissions?: FormSubmission[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? 'Failed to load');
      setTemplates(data.templates ?? []);
      setSubmissions(data.submissions ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load forms');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { void load(); }, [load]);

  async function startForm(templateId: number) {
    setStarting(templateId);
    try {
      const res = await fetch(`/api/jobs/${jobId}/forms`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId }),
      });
      const data = await res.json() as { submission?: FormSubmission; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to start form');
      if (data.submission) {
        setSubmissions((prev) => [data.submission!, ...prev]);
        const template = templates.find((t) => t.id === templateId);
        setActiveRunner({ submission: data.submission!, templateName: template?.name ?? 'Form' });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start form');
    } finally {
      setStarting(null);
    }
  }

  function openSubmission(s: FormSubmission) {
    const template = templates.find((t) => t.id === s.templateId);
    setActiveRunner({ submission: s, templateName: template?.name ?? 'Form' });
  }

  function handleRunnerBack() {
    setActiveRunner(null);
    void load(); // refresh to pick up any saved answers
  }

  function handleRunnerComplete() {
    setActiveRunner(null);
    void load();
  }

  // Map templateId -> submissions for that template
  const submissionsByTemplate = submissions.reduce<Record<number, FormSubmission[]>>((acc, s) => {
    if (!acc[s.templateId]) acc[s.templateId] = [];
    acc[s.templateId].push(s);
    return acc;
  }, {});

  // ── Form runner view ────────────────────────────────────────────────────────
  if (activeRunner) {
    return (
      <FormRunner
        jobId={jobId}
        submission={activeRunner.submission}
        templateName={activeRunner.templateName}
        onBack={handleRunnerBack}
        onComplete={handleRunnerComplete}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={22} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
          <AlertCircle size={13} className="shrink-0" /> {error}
        </div>
      )}

      {/* Available templates */}
      <div className="bg-white rounded-xl border border-border p-5">
        <div className="flex items-center gap-2 mb-4">
          <ClipboardList size={15} className="text-primary" />
          <h2 className="font-heading font-bold text-sm text-muted-foreground uppercase tracking-wider">
            Available Job Forms
          </h2>
        </div>

        {templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="p-3 rounded-2xl bg-slate-100 mb-3">
              <FileText size={20} className="text-slate-400" />
            </div>
            <p className="text-sm font-semibold text-slate-600">No Job forms set up yet</p>
            <p className="text-xs text-slate-400 mt-1">
              Create a form template with type "Job" in the Forms section to get started.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <AnimatePresence>
              {templates.map((t) => {
                const existing = submissionsByTemplate[t.id] ?? [];
                const inProgress = existing.filter((s) => s.status === 'in_progress');
                const completed = existing.filter((s) => s.status === 'completed');

                return (
                  <motion.div
                    key={t.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.15 }}
                    className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-colors"
                  >
                    <div className="p-2 rounded-lg bg-orange-50 shrink-0">
                      <FileText size={14} className="text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{t.name}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {t.category && (
                          <span className="text-[11px] text-slate-400">{t.category}</span>
                        )}
                        {inProgress.length > 0 && (
                          <span className="text-[11px] text-amber-600 font-medium">
                            {inProgress.length} in progress
                          </span>
                        )}
                        {completed.length > 0 && (
                          <span className="text-[11px] text-emerald-600 font-medium">
                            {completed.length} completed
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => startForm(t.id)}
                      disabled={starting === t.id}
                      className="flex items-center gap-1.5 text-xs font-bold bg-primary hover:bg-orange-600 disabled:opacity-60 text-white px-3 py-1.5 rounded-lg transition-colors shrink-0"
                    >
                      {starting === t.id ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Plus size={12} />
                      )}
                      Start
                    </button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Submissions list */}
      {submissions.length > 0 && (
        <div className="bg-white rounded-xl border border-border p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock size={15} className="text-slate-500" />
            <h2 className="font-heading font-bold text-sm text-muted-foreground uppercase tracking-wider">
              In Progress / Completed
            </h2>
            <span className="ml-auto text-xs text-slate-400 font-medium">{submissions.length}</span>
          </div>

          <div className="flex flex-col gap-2">
            {submissions.map((s) => {
              const template = templates.find((t) => t.id === s.templateId);
              const templateName = template?.name ?? `Form #${s.templateId}`;
              const date = new Date(s.createdAt).toLocaleDateString('en-AU', {
                day: 'numeric', month: 'short', year: 'numeric',
              });
              const time = new Date(s.createdAt).toLocaleTimeString('en-AU', {
                hour: '2-digit', minute: '2-digit',
              });
              const isCompleted = s.status === 'completed';

              return (
                <motion.div
                  key={s.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15 }}
                  onClick={() => !isCompleted && openSubmission(s)}
                  className={`flex items-center gap-3 p-3 rounded-xl border border-slate-200 transition-colors ${
                    isCompleted
                      ? 'bg-slate-50/50 cursor-default'
                      : 'bg-white hover:bg-slate-50 cursor-pointer hover:border-slate-300'
                  }`}
                >
                  <div className={`p-2 rounded-lg shrink-0 ${isCompleted ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                    {isCompleted
                      ? <CheckCircle2 size={14} className="text-emerald-600" />
                      : <Clock size={14} className="text-amber-600" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{templateName}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Started by {s.completedByName ?? 'Unknown'} · {date} {time}
                    </p>
                  </div>
                  <StatusBadge status={s.status} />
                  {!isCompleted && (
                    <PlayCircle size={16} className="text-primary shrink-0 ml-1" />
                  )}
                  {isCompleted && (
                    <ChevronRight size={14} className="text-slate-300 shrink-0" />
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
