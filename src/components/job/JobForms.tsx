import { useState, useEffect, useCallback, useRef } from 'react';
import {
  FileText,
  Plus,
  Loader2,
  AlertCircle,
  Clock,
  CheckCircle2,
  ClipboardList,
  Eye,
  Trash2,
  Printer,
  RotateCcw,
  X,
  ExternalLink,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import SkipMetricsPanel from './SkipMetricsPanel';
import type { Job } from '@/lib/jobs-api';
import { FormSharePanel } from '@/components/jobs/FormSharePanel';

// ── Types ─────────────────────────────────────────────────────────────────────

interface FormTemplate {
  id: number;
  name: string;
  formType: string;
  category: string | null;
  description: string | null;
  isActive: boolean;
}

export interface FormSubmission {
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === 'completed' || status === 'submitted') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
        <CheckCircle2 size={10} /> {status === 'submitted' ? 'Submitted' : 'Completed'}
      </span>
    );
  }
  if (status === 'sent') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 shrink-0">
        <Eye size={10} /> Sent
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
      <Clock size={10} /> In Progress
    </span>
  );
}

// ── Delete confirmation modal ─────────────────────────────────────────────────

interface DeleteConfirmProps {
  templateName: string;
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}

function DeleteConfirm({ templateName, onConfirm, onCancel, deleting }: DeleteConfirmProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
      onClick={onCancel}
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.92, opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 rounded-xl bg-red-50 shrink-0">
            <Trash2 size={18} className="text-red-500" />
          </div>
          <div>
            <h3 className="font-heading font-bold text-slate-900">Delete this form?</h3>
            <p className="text-sm text-slate-500 mt-1">
              <span className="font-semibold text-slate-700">"{templateName}"</span> and all its answers will be permanently deleted. This cannot be undone.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Delete
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Submission row ────────────────────────────────────────────────────────────

interface SubmissionRowProps {
  submission: FormSubmission;
  templateName: string;
  onOpen: () => void;
  onPrint: () => void;
  onDelete: () => void;
  canDelete: boolean;
  canShare: boolean;
  canReset: boolean;
  onStatusChange: () => void;
}

function SubmissionRow({ submission, templateName, onOpen, onPrint, onDelete, canDelete, canShare, canReset, onStatusChange }: SubmissionRowProps) {
  const isCompleted = submission.status === 'completed' || submission.status === 'submitted';
  const isSubmitted = submission.status === 'submitted';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.15 }}
      className="rounded-xl border border-slate-200 bg-white overflow-hidden"
    >
      {/* Main row — clickable to open */}
      <div
        onClick={onOpen}
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-slate-50 transition-colors"
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
            {isCompleted ? 'Completed' : 'Started'} by {submission.completedByName ?? 'Unknown'}
            {' · '}{fmtDate(submission.createdAt)} {fmtTime(submission.createdAt)}
          </p>
        </div>
        <StatusBadge status={submission.status} />
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-1.5 px-3 pb-3 pt-0 border-t border-slate-100 mt-0 bg-slate-50/60 flex-wrap">
        {isCompleted ? (
          <>
            {/* View */}
            <button
              onClick={onOpen}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-primary hover:text-primary text-slate-700 transition-colors"
            >
              <Eye size={12} /> View
            </button>
            {/* Open in new tab */}
            <button
              onClick={(e) => { e.stopPropagation(); window.open(`/jobs/${submission.jobId}/forms/${submission.id}`, '_blank', 'noopener,noreferrer'); }}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-primary hover:text-primary text-slate-600 transition-colors"
            >
              <ExternalLink size={12} /> New tab
            </button>
            {/* Print/PDF */}
            <button
              onClick={(e) => { e.stopPropagation(); onPrint(); }}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-slate-300 text-slate-600 transition-colors"
            >
              <Printer size={12} /> Print / PDF
            </button>
            {/* Reopen (internal) — only if not externally submitted */}
            {!isSubmitted && (
              <button
                onClick={onOpen}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-amber-400 hover:text-amber-600 text-slate-600 transition-colors"
              >
                <RotateCcw size={12} /> Reopen
              </button>
            )}
          </>
        ) : (
          /* Continue */
          <button
            onClick={onOpen}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-primary hover:bg-orange-600 text-white transition-colors"
          >
            <PlayCircle size={12} /> Continue
          </button>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Share panel */}
        {canShare && (
          <FormSharePanel
            submissionId={submission.id}
            submissionStatus={submission.status}
            canReset={canReset}
            onStatusChange={onStatusChange}
          />
        )}

        {/* Delete */}
        {canDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-red-300 hover:text-red-500 text-slate-400 transition-colors"
          >
            <Trash2 size={12} /> Delete
          </button>
        )}
      </div>
    </motion.div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface JobFormsProps {
  jobId: number;
  job?: Job | null;
  userRole?: string;
  onRunnerActive?: (active: boolean) => void;
  /** Deep-link: auto-open this form instance when the tab loads */
  initialFormInstanceId?: number;
}

export default function JobForms({ jobId, job, userRole, onRunnerActive, initialFormInstanceId }: JobFormsProps) {
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [submissions, setSubmissions] = useState<FormSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState<number | null>(null);
  // Track whether we've already auto-opened the deep-linked instance
  const autoOpenedRef = useRef<number | null>(null);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<FormSubmission | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Can this user delete? Owner/Admin/Manager
  const canDelete = ['owner', 'admin', 'manager'].includes(userRole ?? '');

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

  // Auto-open a deep-linked form instance in a new window
  useEffect(() => {
    if (!initialFormInstanceId || loading || autoOpenedRef.current === initialFormInstanceId) return;
    const target = submissions.find((s) => s.id === initialFormInstanceId);
    if (target) {
      autoOpenedRef.current = initialFormInstanceId;
      window.open(`/jobs/${jobId}/forms/${initialFormInstanceId}`, '_blank', 'noopener,noreferrer');
    }
  }, [initialFormInstanceId, loading, submissions, jobId]);

  // Fetch company name once for print header
  useEffect(() => {
    if ((window as unknown as Record<string, string>).__iwb_company_name) return;
    fetch('/api/company-settings', { credentials: 'include' })
      .then((r) => r.json())
      .then((d: { name?: string }) => {
        if (d.name) (window as unknown as Record<string, string>).__iwb_company_name = d.name;
      })
      .catch(() => { /* ignore */ });
  }, []);

  async function startForm(templateId: number) {
    setStarting(templateId);
    setError('');
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
        // Open in new window so the job detail page stays intact
        window.open(`/jobs/${jobId}/forms/${data.submission.id}`, '_blank', 'noopener,noreferrer');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start form');
    } finally {
      setStarting(null);
    }
  }

  function openSubmission(s: FormSubmission) {
    window.open(`/jobs/${jobId}/forms/${s.id}`, '_blank', 'noopener,noreferrer');
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/job-forms/${deleteTarget.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? 'Delete failed');
      }
      setSubmissions((prev) => prev.filter((s) => s.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  // Map templateId -> submissions
  const submissionsByTemplate = submissions.reduce<Record<number, FormSubmission[]>>((acc, s) => {
    if (!acc[s.templateId]) acc[s.templateId] = [];
    acc[s.templateId].push(s);
    return acc;
  }, {});

  // ── Form runner view — now opens in new window, no inline runner ──────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={22} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        {error && (
          <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            <AlertCircle size={13} className="shrink-0" /> {error}
            <button onClick={() => setError('')} className="ml-auto"><X size={12} /></button>
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
              <AnimatePresence mode="popLayout">
                {submissions.map((s) => {
                  const template = templates.find((t) => t.id === s.templateId);
                  const templateName = template?.name ?? `Form #${s.templateId}`;

                  return (
                    <SubmissionRow
                      key={s.id}
                      submission={s}
                      templateName={templateName}
                      onOpen={() => openSubmission(s)}
                      onPrint={() => openSubmission(s)}
                      onDelete={() => setDeleteTarget(s)}
                      canDelete={canDelete}
                      canShare={true}
                      canReset={['owner', 'admin'].includes(userRole ?? '')}
                      onStatusChange={load}
                    />
                  );
                })}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      <AnimatePresence>
        {deleteTarget && (
          <DeleteConfirm
            templateName={templates.find((t) => t.id === deleteTarget.templateId)?.name ?? 'this form'}
            onConfirm={confirmDelete}
            onCancel={() => setDeleteTarget(null)}
            deleting={deleting}
          />
        )}
      </AnimatePresence>

      {/* Skip logic analytics — shown per template that has submissions */}
      {templates.filter((t) => (submissionsByTemplate[t.id] ?? []).length > 0).map((t) => (
        <SkipMetricsPanel key={t.id} templateId={t.id} />
      ))}
    </>
  );
}
