import { useState, useEffect, useCallback, useRef } from 'react';
import {
  FileText,
  Plus,
  Loader2,
  AlertCircle,
  Clock,
  CheckCircle2,
  Eye,
  Trash2,
  Printer,
  RotateCcw,
  X,
  ExternalLink,
  ChevronDown,
  PlayCircle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
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

function DeleteConfirm({ templateName, onConfirm, onCancel, deleting }: {
  templateName: string;
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}) {
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

function SubmissionRow({ submission, templateName, onOpen, onDelete, canDelete, canShare, canReset, onStatusChange }: {
  submission: FormSubmission;
  templateName: string;
  onOpen: () => void;
  onDelete: () => void;
  canDelete: boolean;
  canShare: boolean;
  canReset: boolean;
  onStatusChange: () => void;
}) {
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
      {/* Main row — click to open in new tab */}
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
        <ExternalLink size={12} className="text-slate-300 shrink-0" />
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-1.5 px-3 pb-3 pt-0 border-t border-slate-100 bg-slate-50/60 flex-wrap">
        {isCompleted ? (
          <>
            <button
              onClick={onOpen}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-primary hover:text-primary text-slate-700 transition-colors"
            >
              <Eye size={12} /> View
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onOpen(); }}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-slate-300 text-slate-600 transition-colors"
            >
              <Printer size={12} /> Print / PDF
            </button>
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
          <button
            onClick={onOpen}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-primary hover:bg-violet-700 text-white transition-colors"
          >
            <PlayCircle size={12} /> Continue
          </button>
        )}

        <div className="flex-1" />

        {canShare && (
          <FormSharePanel
            submissionId={submission.id}
            submissionStatus={submission.status}
            canReset={canReset}
            onStatusChange={onStatusChange}
          />
        )}

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

// ── New Form dropdown picker ───────────────────────────────────────────────────

function NewFormPicker({ templates, starting, onStart }: {
  templates: FormTemplate[];
  starting: number | null;
  onStart: (templateId: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (templates.length === 0) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={starting !== null}
        className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-violet-700 disabled:opacity-60 text-white rounded-lg text-sm font-bold transition-colors"
      >
        {starting !== null ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
        New Form
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-full mt-2 z-30 bg-white border border-slate-200 rounded-xl shadow-xl min-w-[240px] py-1 overflow-hidden"
          >
            <p className="px-4 py-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
              Select a form to start
            </p>
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setOpen(false);
                  onStart(t.id);
                }}
                disabled={starting === t.id}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-violet-50 transition-colors disabled:opacity-50"
              >
                <div className="p-1.5 rounded-lg bg-violet-50 shrink-0">
                  <FileText size={13} className="text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">{t.name}</p>
                  {t.category && (
                    <p className="text-[11px] text-slate-400">{t.category}</p>
                  )}
                </div>
                {starting === t.id && <Loader2 size={12} className="animate-spin text-primary shrink-0" />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface JobFormsProps {
  jobId: number;
  job?: Job | null;
  userRole?: string;
  onRunnerActive?: (active: boolean) => void;
  initialFormInstanceId?: number;
}

export default function JobForms({ jobId, userRole }: JobFormsProps) {
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [submissions, setSubmissions] = useState<FormSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FormSubmission | null>(null);
  const [deleting, setDeleting] = useState(false);

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
        // Open form in a new tab — job detail page stays open
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

        {/* Header row */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-heading font-bold text-base text-slate-900">Job Forms</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {submissions.length > 0
                ? `${submissions.length} form${submissions.length !== 1 ? 's' : ''} on this job`
                : 'No forms started yet'}
            </p>
          </div>
          <NewFormPicker
            templates={templates}
            starting={starting}
            onStart={startForm}
          />
        </div>

        {/* No templates state */}
        {templates.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center bg-white rounded-xl border border-slate-200">
            <div className="p-3 rounded-2xl bg-slate-100 mb-3">
              <FileText size={20} className="text-slate-400" />
            </div>
            <p className="text-sm font-semibold text-slate-600">No job form templates set up</p>
            <p className="text-xs text-slate-400 mt-1 max-w-xs">
              Create a form template with type "Job" in the Forms section to get started.
            </p>
          </div>
        )}

        {/* Submissions list */}
        {submissions.length > 0 && (
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
        )}

        {/* Empty state when templates exist but no submissions */}
        {templates.length > 0 && submissions.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center bg-white rounded-xl border border-dashed border-slate-200">
            <div className="p-3 rounded-2xl bg-violet-50 mb-3">
              <FileText size={20} className="text-primary" />
            </div>
            <p className="text-sm font-semibold text-slate-600">No forms started yet</p>
            <p className="text-xs text-slate-400 mt-1">
              Tap <strong>New Form</strong> above to pick a form and complete it.
            </p>
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

    </>
  );
}
