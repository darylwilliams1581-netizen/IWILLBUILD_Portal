import { useState, useEffect, useCallback } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  FileText, Plus, Pencil, Trash2,
  LayoutDashboard, Briefcase, Truck, ChevronRight, X, Zap, BookOpen, Loader2, Check,
  LayoutTemplate, Clock, FileUp, Link2, Copy, CheckCircle2, Inbox,
  User, Mail, Calendar, ChevronDown, ChevronUp, ExternalLink,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import PortalSidebar from '@/components/PortalSidebar';
import FleetHeaderIcon from '@/components/FleetHeaderIcon';
import FormFieldBuilder from '@/components/FormFieldBuilder';
import DocumentBuilder from '@/components/DocumentBuilder';
import type { DocumentTemplate } from '@/components/DocumentBuilder/types';

// ── Types ─────────────────────────────────────────────────────────────────────

type FormType = 'Job' | 'Company' | 'Fleet' | 'Accounts';

interface FormTemplate {
  id: number;
  companyId: number;
  name: string;
  formType: FormType;
  category: string | null;
  description: string | null;
  isActive: boolean;
  onDashboard: boolean;
  onJobs: boolean;
  onFleet: boolean;
  createdAt: string;
  updatedAt: string;
}

const FORM_TYPES: FormType[] = ['Job', 'Company', 'Fleet', 'Accounts'];

const TYPE_META: Record<FormType, { color: string; bg: string; dot: string }> = {
  Job:      { color: 'text-sky-600',    bg: 'bg-sky-50',    dot: 'bg-sky-500' },
  Company:  { color: 'text-violet-600', bg: 'bg-violet-50', dot: 'bg-violet-500' },
  Fleet:    { color: 'text-emerald-600',bg: 'bg-emerald-50',dot: 'bg-emerald-500' },
  Accounts: { color: 'text-amber-600',  bg: 'bg-amber-50',  dot: 'bg-amber-500' },
};

// ── Shared input style ────────────────────────────────────────────────────────

const lightInput = 'w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60 transition-colors';
const lightSelect = `${lightInput} appearance-none`;

// ── Blank form state ──────────────────────────────────────────────────────────

const blankForm = () => ({
  name: '',
  formType: 'Job' as FormType,
  category: '',
  description: '',
  isActive: true,
  onDashboard: false,
  onJobs: false,
  onFleet: false,
});

// ── Toggle row ────────────────────────────────────────────────────────────────

function DarkToggle({ label, icon: Icon, value, onChange }: {
  label: string;
  icon?: React.ElementType | null;
  value: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`flex items-center justify-between w-full px-4 py-3 rounded-xl border transition-all ${
        value ? 'border-primary/30 bg-orange-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300'
      }`}
    >
      <span className="flex items-center gap-2.5 text-sm text-slate-700">
        {Icon && <Icon size={14} className={value ? 'text-primary' : 'text-slate-400'} />}
        {label}
      </span>
      <div className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${value ? 'bg-primary' : 'bg-slate-300'}`}>
        <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </div>
    </button>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────

interface TemplateModalProps {
  mode: 'create' | 'edit';
  initial?: FormTemplate;
  onClose: () => void;
  onSave: (data: ReturnType<typeof blankForm>) => Promise<void>;
  saving: boolean;
}

function TemplateModal({ mode, initial, onClose, onSave, saving }: TemplateModalProps) {
  const [form, setForm] = useState(() =>
    initial
      ? {
          name: initial.name,
          formType: initial.formType,
          category: initial.category ?? '',
          description: initial.description ?? '',
          isActive: initial.isActive,
          onDashboard: initial.onDashboard,
          onJobs: initial.onJobs,
          onFleet: initial.onFleet,
        }
      : blankForm(),
  );

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        transition={{ duration: 0.18 }}
        className="relative w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl bg-white border border-slate-200"
      >
        {/* Accent line */}
        <div className="h-0.5 w-full bg-gradient-to-r from-primary via-orange-400 to-transparent" />

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-orange-50">
              <FileText size={15} className="text-primary" />
            </div>
            <h2 className="font-heading font-bold text-base text-slate-900">
              {mode === 'create' ? 'New Form Template' : 'Edit Template'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
              Template Name <span className="text-primary">*</span>
            </label>
            <input
              className={lightInput}
              placeholder="e.g. Site Induction Form"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Form Type</label>
              <select className={lightSelect} value={form.formType} onChange={(e) => set('formType', e.target.value as FormType)}>
                {FORM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Category</label>
              <input className={lightInput} placeholder="e.g. Safety, HR" value={form.category} onChange={(e) => set('category', e.target.value)} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Description</label>
            <textarea
              className={`${lightInput} resize-none`}
              rows={3}
              placeholder="What is this form used for?"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2 pt-1">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Availability</p>
            <DarkToggle label="Active" value={form.isActive} onChange={() => set('isActive', !form.isActive)} />
            <DarkToggle label="Available on Dashboard" icon={LayoutDashboard} value={form.onDashboard} onChange={() => set('onDashboard', !form.onDashboard)} />
            <DarkToggle label="Available for Jobs" icon={Briefcase} value={form.onJobs} onChange={() => set('onJobs', !form.onJobs)} />
            <DarkToggle label="Available for Fleet" icon={Truck} value={form.onFleet} onChange={() => set('onFleet', !form.onFleet)} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700 transition-colors">
            Cancel
          </button>
          <button
            onClick={() => onSave(form)}
            disabled={saving || !form.name.trim()}
            className="px-5 py-2 text-sm font-bold text-white rounded-xl disabled:opacity-40 transition-all hover:brightness-110 bg-primary"
          >
            {saving ? 'Saving…' : mode === 'create' ? 'Create Template' : 'Save Changes'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Delete confirm ────────────────────────────────────────────────────────────

function DeleteConfirm({ name, onConfirm, onCancel, deleting }: {
  name: string; onConfirm: () => void; onCancel: () => void; deleting: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.14 }}
        className="relative w-full max-w-sm rounded-2xl p-6 shadow-2xl bg-white border border-slate-200"
      >
        <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center mb-4">
          <Trash2 size={18} className="text-red-500" />
        </div>
        <h3 className="font-heading font-bold text-base text-slate-900 mb-2">Delete Template?</h3>
        <p className="text-sm text-slate-500 mb-6">
          <span className="font-semibold text-slate-700">"{name}"</span> will be permanently deleted. This cannot be undone.
        </p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className="px-4 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700 transition-colors">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="px-5 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Template card ─────────────────────────────────────────────────────────────

function TemplateCard({ t, onBuild, onEdit, onDelete, onShare }: {
  t: FormTemplate;
  onBuild: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onShare: () => void;
}) {
  const meta = TYPE_META[t.formType];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="group relative rounded-2xl overflow-hidden flex flex-col bg-white border border-slate-200 hover:border-slate-300 hover:shadow-md transition-all"
    >
      {/* Top accent bar */}
      <div className={`h-0.5 w-full ${meta.dot}`} />

      {/* Card body */}
      <div className="flex flex-col gap-3 p-5 flex-1">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-heading font-bold text-sm text-slate-900 truncate">{t.name}</p>
            {t.category && <p className="text-xs text-slate-400 mt-0.5 truncate">{t.category}</p>}
          </div>
          <span className={`shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-lg ${meta.bg} ${meta.color}`}>
            {t.formType}
          </span>
        </div>

        {/* Description */}
        {t.description && (
          <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">{t.description}</p>
        )}

        {/* Status + availability pills */}
        <div className="flex flex-wrap gap-1.5 mt-auto">
          <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${
            t.isActive ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'
          }`}>
            {t.isActive ? '● Active' : '○ Inactive'}
          </span>
          {t.onDashboard && (
            <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-slate-100 text-slate-500 flex items-center gap-1">
              <LayoutDashboard size={9} /> Dashboard
            </span>
          )}
          {t.onJobs && (
            <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-slate-100 text-slate-500 flex items-center gap-1">
              <Briefcase size={9} /> Jobs
            </span>
          )}
          {t.onFleet && (
            <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-slate-100 text-slate-500 flex items-center gap-1">
              <Truck size={9} /> Fleet
            </span>
          )}
        </div>
      </div>

      {/* Action footer */}
      <div className="flex items-center gap-1 px-4 py-3 border-t border-slate-100 bg-slate-50/60">
        <button
          onClick={onBuild}
          className="flex items-center gap-1.5 text-xs font-bold text-white px-3 py-2 rounded-xl transition-all hover:brightness-110 flex-1 justify-center bg-primary"
        >
          <Zap size={12} /> Build fields <ChevronRight size={11} />
        </button>
        <button
          onClick={onShare}
          className="p-2 rounded-xl text-slate-400 hover:text-orange-600 hover:bg-orange-50 transition-colors"
          title="Share public link"
        >
          <Link2 size={14} />
        </button>
        <button
          onClick={onEdit}
          className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
          title="Edit template"
        >
          <Pencil size={14} />
        </button>
        <button
          onClick={onDelete}
          className="p-2 rounded-xl text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
          title="Delete template"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </motion.div>
  );
}

// ── Share Link Modal ──────────────────────────────────────────────────────────

function ShareLinkModal({ templateId, templateName, onClose }: {
  templateId: number;
  templateName: string;
  onClose: () => void;
}) {
  const [url,      setUrl]      = useState('');
  const [loading,  setLoading]  = useState(true);
  const [copied,   setCopied]   = useState(false);
  const [error,    setError]    = useState('');

  useEffect(() => {
    fetch(`/api/forms/templates/${templateId}/share-link`, { method: 'POST', credentials: 'include' })
      .then(r => r.json())
      .then((d: { url?: string; error?: string }) => {
        if (d.error) { setError(d.error); return; }
        setUrl(d.url ?? '');
      })
      .catch(() => setError('Failed to generate link'))
      .finally(() => setLoading(false));
  }, [templateId]);

  function copy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.15 }}
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center">
              <Link2 size={15} className="text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">Public Share Link</h2>
              <p className="text-xs text-slate-400 truncate max-w-[200px]">{templateName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"><X size={15} /></button>
        </div>

        <p className="text-xs text-slate-500 mb-3">
          Anyone with this link can fill out the form without logging in. Responses appear in the Submissions inbox.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-400 py-3">
            <Loader2 size={14} className="animate-spin" /> Generating link…
          </div>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : (
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-600 truncate font-mono">
              {url}
            </div>
            <button
              onClick={copy}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors shrink-0 ${
                copied ? 'bg-emerald-500 text-white' : 'bg-primary text-white hover:brightness-110'
              }`}
            >
              {copied ? <><CheckCircle2 size={12} /> Copied!</> : <><Copy size={12} /> Copy</>}
            </button>
          </div>
        )}

        <p className="text-[10px] text-slate-400 mt-3">
          This link is permanent. To revoke access, contact your administrator.
        </p>
      </motion.div>
    </div>
  );
}

// ── Submissions Inbox ─────────────────────────────────────────────────────────

interface Submission {
  id: number;
  template_id: number;
  template_name: string;
  form_type: string;
  submitter_name: string | null;
  submitter_email: string | null;
  job_id: number | null;
  job_name: string | null;
  job_number: string | null;
  status: string;
  submitted_at: string;
  answers_json: string | null;
}

function SubmissionsInbox({ templates }: { templates: FormTemplate[] }) {
  const [submissions,  setSubmissions]  = useState<Submission[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [templateFilter, setTemplateFilter] = useState('');
  const [expanded,     setExpanded]     = useState<Set<number>>(new Set());

  useEffect(() => {
    const url = templateFilter
      ? `/api/forms/submissions?templateId=${templateFilter}`
      : '/api/forms/submissions';
    fetch(url, { credentials: 'include' })
      .then(r => r.json())
      .then((d: { submissions?: Submission[] }) => setSubmissions(d.submissions ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [templateFilter]);

  function toggleExpand(id: number) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={templateFilter}
          onChange={e => { setTemplateFilter(e.target.value); setLoading(true); }}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="">All templates</option>
          {templates.map(t => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
        </select>
        <span className="text-xs text-slate-400">{submissions.length} response{submissions.length !== 1 ? 's' : ''}</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={22} className="animate-spin text-primary" />
        </div>
      ) : submissions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 bg-orange-50 rounded-xl flex items-center justify-center mb-4">
            <Inbox size={24} className="text-primary" />
          </div>
          <p className="font-heading font-bold text-slate-700 mb-1">No submissions yet</p>
          <p className="text-sm text-slate-400 max-w-xs">Share a form link with workers or clients to start collecting responses.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {submissions.map(s => {
            const isOpen = expanded.has(s.id);
            let answers: Record<string, unknown> = {};
            try { answers = s.answers_json ? JSON.parse(s.answers_json) as Record<string, unknown> : {}; } catch { /* ignore */ }
            const answerCount = Object.keys(answers).length;

            return (
              <div key={s.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden hover:border-slate-300 transition-colors">
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                  onClick={() => toggleExpand(s.id)}
                >
                  <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                    <User size={14} className="text-orange-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">
                      {s.submitter_name ?? 'Anonymous'}
                      {s.submitter_email && <span className="text-slate-400 font-normal ml-2 text-xs">{s.submitter_email}</span>}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap text-xs text-slate-400">
                      <span className="font-medium text-slate-600">{s.template_name}</span>
                      {s.job_name && <span>· {s.job_name}{s.job_number ? ` #${s.job_number}` : ''}</span>}
                      <span className="flex items-center gap-1"><Calendar size={9} />{fmtDate(s.submitted_at)}</span>
                      <span>{answerCount} answer{answerCount !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">{s.status}</span>
                    {isOpen ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                  </div>
                </div>

                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-slate-100 px-4 py-3 bg-slate-50">
                        {answerCount === 0 ? (
                          <p className="text-xs text-slate-400 italic">No answers recorded</p>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {Object.entries(answers).map(([fieldId, answer]) => (
                              <div key={fieldId} className="bg-white border border-slate-200 rounded-lg px-3 py-2">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">Field {fieldId}</p>
                                <p className="text-xs text-slate-700 break-words">
                                  {Array.isArray(answer) ? (answer as string[]).join(', ') : String(answer ?? '—')}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function FormsPage() {
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<FormTemplate | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FormTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareTarget, setShareTarget] = useState<FormTemplate | null>(null);
  const [builderTemplateId, setBuilderTemplateId] = useState<number | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState('');

  // ── Document Builder state ─────────────────────────────────────────────────
  const [pageTab, setPageTab] = useState<'forms' | 'documents' | 'submissions'>('forms');
  const [docTemplates, setDocTemplates] = useState<DocumentTemplate[]>([]);
  const [docLoading, setDocLoading] = useState(false);
  const [openDocBuilder, setOpenDocBuilder] = useState<DocumentTemplate | null | 'new'>(null);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/form-templates', { credentials: 'include' });
      if (res.status === 401) { setTemplates([]); return; }
      const data = await res.json() as { templates: FormTemplate[] };
      setTemplates(data.templates ?? []);
    } catch {
      setError('Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDocTemplates = useCallback(async () => {
    setDocLoading(true);
    try {
      const res = await fetch('/api/document-templates', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json() as { templates: DocumentTemplate[] };
      setDocTemplates(data.templates ?? []);
    } catch { /* non-fatal */ }
    finally { setDocLoading(false); }
  }, []);

  useEffect(() => { void fetchTemplates(); }, [fetchTemplates]);
  useEffect(() => { if (pageTab === 'documents') void fetchDocTemplates(); }, [pageTab, fetchDocTemplates]);

  const handleCreate = async (form: ReturnType<typeof blankForm>) => {
    setSaving(true); setError(null);
    try {
      const res = await fetch('/api/form-templates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify(form),
      });
      if (!res.ok) { const d = await res.json() as { error?: string }; throw new Error(d.error ?? 'Failed'); }
      setShowCreate(false);
      await fetchTemplates();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setSaving(false); }
  };

  const handleEdit = async (form: ReturnType<typeof blankForm>) => {
    if (!editTarget) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/form-templates/${editTarget.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify(form),
      });
      if (!res.ok) { const d = await res.json() as { error?: string }; throw new Error(d.error ?? 'Failed'); }
      setEditTarget(null);
      await fetchTemplates();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setSaving(false); }
  };

  const handleSeed = async () => {
    setSeeding(true); setSeedMsg('');
    try {
      const r = await fetch('/api/form-templates/seed', { method: 'POST', credentials: 'include' });
      const d = await r.json() as { ok?: boolean; message?: string; error?: string };
      if (r.ok) {
        setSeedMsg(d.message ?? 'Templates added.');
        await fetchTemplates();
      } else {
        setSeedMsg(d.error ?? 'Failed to seed templates.');
      }
    } catch {
      setSeedMsg('Failed to seed templates.');
    } finally {
      setSeeding(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true); setError(null);
    try {
      const res = await fetch(`/api/form-templates/${deleteTarget.id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) { const d = await res.json() as { error?: string }; throw new Error(d.error ?? 'Failed'); }
      setDeleteTarget(null);
      await fetchTemplates();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setDeleting(false); }
  };

  if (builderTemplateId !== null) {
    return (
      <div className="flex h-screen overflow-hidden bg-[#F4F5F7]">
        <Helmet>
          <title>Form Builder — IWILLBUILD Portal</title>
          <meta name="robots" content="noindex" />
        </Helmet>
        <PortalSidebar />
        <div className="flex-1 overflow-y-auto">
          <FormFieldBuilder templateId={builderTemplateId} onBack={() => setBuilderTemplateId(null)} />
        </div>
      </div>
    );
  }

  // ── Document Builder full-screen ───────────────────────────────────────────
  if (openDocBuilder !== null) {
    return (
      <DocumentBuilder
        template={openDocBuilder === 'new' ? null : openDocBuilder}
        onClose={() => { setOpenDocBuilder(null); void fetchDocTemplates(); }}
        onSaved={() => { void fetchDocTemplates(); }}
      />
    );
  }

  // ── Template list view ──────────────────────────────────────────────────────

  return (
    <div className="flex h-screen overflow-hidden bg-[#F4F5F7]">
      <Helmet>
        <title>Forms — IWILLBUILD Portal</title>
        <meta name="description" content="Manage form templates for jobs, fleet and compliance." />
        <link rel="canonical" href="https://iwillbuild.com/forms" />
        <meta name="robots" content="noindex" />
        <meta property="og:title" content="Forms — IWILLBUILD Portal" />
        <meta property="og:description" content="Manage form templates for jobs, fleet and compliance." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://iwillbuild.com/forms" />
        <meta property="og:image" content="https://iwillbuild.com/og-image.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Forms — IWILLBUILD Portal" />
        <meta name="twitter:description" content="Manage form templates for jobs, fleet and compliance." />
        <meta name="twitter:image" content="https://iwillbuild.com/og-image.png" />
      </Helmet>

      <PortalSidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 flex items-center justify-between px-6 shrink-0 border-b border-slate-200 bg-white">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-orange-50">
              <FileText size={16} className="text-primary" />
            </div>
            <div>
              <h1 className="font-heading font-bold text-base text-slate-900 leading-tight">Forms & Documents</h1>
              {!loading && (
                <p className="text-[11px] text-slate-400">{templates.length} form {templates.length === 1 ? 'template' : 'templates'} · {docTemplates.length} document {docTemplates.length === 1 ? 'template' : 'templates'}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <FleetHeaderIcon />
            {pageTab === 'forms' && (
              <>
                <button
                  onClick={handleSeed}
                  disabled={seeding}
                  title="Load 7 industry-standard form templates"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  {seeding ? <Loader2 size={13} className="animate-spin" /> : <BookOpen size={13} />}
                  <span className="hidden sm:inline">Load Templates</span>
                </button>
                <button
                  onClick={() => setShowCreate(true)}
                  className="inline-flex items-center gap-2 text-sm font-bold text-white px-4 py-2 rounded-xl transition-all hover:brightness-110 bg-primary"
                >
                  <Plus size={15} /> New Form
                </button>
              </>
            )}
            {pageTab === 'documents' && (
              <button
                onClick={() => setOpenDocBuilder('new')}
                className="inline-flex items-center gap-2 text-sm font-bold text-white px-4 py-2 rounded-xl transition-all hover:brightness-110 bg-primary"
              >
                <Plus size={15} /> New Document
              </button>
            )}
          </div>
        </header>

        {/* Tab switcher */}
        <div className="flex border-b border-slate-200 bg-white px-6 gap-1">
          {([
            { key: 'forms', label: 'Forms', icon: FileText },
            { key: 'documents', label: 'Smart Documents', icon: LayoutTemplate },
            { key: 'submissions', label: 'Submissions', icon: Inbox },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setPageTab(key)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
                pageTab === key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon size={13} />
              {label}
              {key === 'documents' && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-orange-100 text-primary text-[10px] font-bold">NEW</span>
              )}
            </button>
          ))}
        </div>

        {/* Error banner */}
        {error && (
          <div className="mx-6 mt-4 px-4 py-3 rounded-xl text-sm text-red-700 flex items-center justify-between border border-red-200 bg-red-50">
            {error}
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 ml-4"><X size={14} /></button>
          </div>
        )}

        {/* Seed success banner */}
        {seedMsg && (
          <div className="mx-6 mt-4 px-4 py-3 rounded-xl text-sm text-emerald-700 flex items-center justify-between border border-emerald-200 bg-emerald-50">
            <span className="flex items-center gap-2"><Check size={14} className="shrink-0" />{seedMsg}</span>
            <button onClick={() => setSeedMsg('')} className="text-emerald-400 hover:text-emerald-600 ml-4"><X size={14} /></button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {pageTab === 'forms' ? (
            <>
              {loading ? (
                <div className="flex items-center justify-center h-48">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : templates.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col items-center justify-center h-full min-h-[400px] text-center"
                >
                  <div className="relative mb-6">
                    <div className="w-20 h-20 rounded-3xl flex items-center justify-center bg-orange-50 border border-orange-100">
                      <FileText size={32} className="text-primary" />
                    </div>
                    <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                      <Plus size={11} className="text-white" />
                    </div>
                  </div>
                  <h2 className="font-heading font-bold text-xl text-slate-900 mb-2">No form templates yet</h2>
                  <p className="text-slate-500 text-sm max-w-xs mb-7 leading-relaxed">
                    Build reusable templates for safety forms, inductions, prestarts and more — or load 7 industry-standard templates to get started quickly.
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleSeed}
                      disabled={seeding}
                      className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 px-5 py-3 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-50"
                    >
                      {seeding ? <Loader2 size={14} className="animate-spin" /> : <BookOpen size={14} />}
                      Load Templates
                    </button>
                    <button
                      onClick={() => setShowCreate(true)}
                      className="inline-flex items-center gap-2 text-sm font-bold text-white px-6 py-3 rounded-xl transition-all hover:brightness-110 bg-primary"
                    >
                      <Plus size={15} /> Create Template
                    </button>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
                >
                  {templates.map((t) => (
                    <TemplateCard
                      key={t.id}
                      t={t}
                      onBuild={() => setBuilderTemplateId(t.id)}
                      onEdit={() => setEditTarget(t)}
                      onDelete={() => setDeleteTarget(t)}
                      onShare={() => setShareTarget(t)}
                    />
                  ))}
                </motion.div>
              )}
            </>
          ) : (
            /* ── Documents tab ─────────────────────────────────────────────── */
            <>
              {docLoading ? (
                <div className="flex items-center justify-center h-48">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : docTemplates.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col items-center justify-center h-full min-h-[400px] text-center"
                >
                  <div className="relative mb-6">
                    <div className="w-20 h-20 rounded-3xl flex items-center justify-center bg-orange-50 border border-orange-100">
                      <LayoutTemplate size={32} className="text-primary" />
                    </div>
                    <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                      <Plus size={11} className="text-white" />
                    </div>
                  </div>
                  <h2 className="font-heading font-bold text-xl text-slate-900 mb-2">No document templates yet</h2>
                  <p className="text-slate-500 text-sm max-w-sm mb-7 leading-relaxed">
                    Build SWMS, policies, toolbox talks, pre-starts, inspection forms and more — with a visual canvas, system field tokens, and DOCX import.
                  </p>
                  <button
                    onClick={() => setOpenDocBuilder('new')}
                    className="inline-flex items-center gap-2 text-sm font-bold text-white px-6 py-3 rounded-xl transition-all hover:brightness-110 bg-primary"
                  >
                    <Plus size={15} /> Create Document Template
                  </button>
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
                >
                  {docTemplates.map((dt) => (
                    <DocTemplateCard
                      key={dt.id}
                      template={dt}
                      onOpen={() => setOpenDocBuilder(dt)}
                    />
                  ))}
                </motion.div>
              )}
            </>
          )}

          {/* ── Submissions tab ── */}
          {pageTab === 'submissions' && (
            <SubmissionsInbox templates={templates} />
          )}
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showCreate && (
          <TemplateModal mode="create" onClose={() => setShowCreate(false)} onSave={handleCreate} saving={saving} />
        )}
        {editTarget && (
          <TemplateModal mode="edit" initial={editTarget} onClose={() => setEditTarget(null)} onSave={handleEdit} saving={saving} />
        )}
        {deleteTarget && (
          <DeleteConfirm name={deleteTarget.name} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} deleting={deleting} />
        )}
        {shareTarget && (
          <ShareLinkModal
            templateId={shareTarget.id}
            templateName={shareTarget.name}
            onClose={() => setShareTarget(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Document Template Card ────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  document: 'Document', swms: 'SWMS', policy: 'Policy',
  toolbox_talk: 'Toolbox Talk', pre_start: 'Pre-Start',
  inspection: 'Inspection', register: 'Register', completion_report: 'Completion Report',
};

function DocTemplateCard({ template, onOpen }: { template: DocumentTemplate; onOpen: () => void }) {
  const typeLabel = TYPE_LABELS[template.templateType ?? 'document'] ?? 'Document';
  const updatedAt = template.updatedAt ? new Date(template.updatedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col gap-3 hover:border-primary/30 hover:shadow-md transition-all cursor-pointer group"
      onClick={onOpen}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center flex-shrink-0">
            <LayoutTemplate size={16} className="text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-800 truncate">{template.name}</p>
            <span className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 mt-0.5">{typeLabel}</span>
          </div>
        </div>
        {template.sourceDocxName && (
          <div title={`Source: ${template.sourceDocxName}`} className="flex-shrink-0">
            <FileUp size={12} className="text-slate-300" />
          </div>
        )}
      </div>
      <div className="flex items-center justify-between">
        {updatedAt && (
          <span className="flex items-center gap-1 text-[10px] text-slate-400">
            <Clock size={10} />
            {updatedAt}
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onOpen(); }}
          className="ml-auto flex items-center gap-1 text-xs font-semibold text-primary opacity-0 group-hover:opacity-100 transition-opacity"
        >
          Open <ChevronRight size={12} />
        </button>
      </div>
    </motion.div>
  );
}
