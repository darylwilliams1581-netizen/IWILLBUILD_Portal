import { useState, useEffect, useCallback, useRef } from 'react';
import { Navigate, useNavigate, useSearchParams } from "react-router";
import { Helmet } from '@dr.pogodin/react-helmet';
import { FileText, Plus, Pencil, Trash2, LayoutDashboard, Briefcase, Truck, X, Zap, BookOpen, Loader2, Check, Clock, Link2, Copy, CheckCircle2, Inbox, Mail, ChevronDown, ChevronUp, ExternalLink, Search, XCircle, MoreHorizontal, ClipboardCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import FormFieldBuilder from '@/components/FormFieldBuilder';
import { usePermissions } from '@/lib/usePermissions';
import { LibraryView as LibraryPage } from '../features/library/LibraryView';

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
  sharedInLibrary: boolean;
  createdAt: string;
  updatedAt: string;
}
const FORM_TYPES: FormType[] = ['Job', 'Company', 'Fleet', 'Accounts'];
const TYPE_META: Record<FormType, {
  color: string;
  bg: string;
  dot: string;
}> = {
  Job: {
    color: 'text-sky-600',
    bg: 'bg-sky-50',
    dot: 'bg-sky-500'
  },
  Company: {
    color: 'text-violet-600',
    bg: 'bg-violet-50',
    dot: 'bg-violet-500'
  },
  Fleet: {
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    dot: 'bg-emerald-500'
  },
  Accounts: {
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    dot: 'bg-amber-500'
  }
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
  sharedInLibrary: false,
});

// ── Toggle row ────────────────────────────────────────────────────────────────

function DarkToggle({
  label,
  icon: Icon,
  value,
  onChange
}: {
  label: string;
  icon?: React.ElementType | null;
  value: boolean;
  onChange: () => void;
}) {
  return <button type="button" onClick={onChange} className={`flex items-center justify-between w-full px-4 py-3 rounded-xl border transition-all ${value ? 'border-primary/30 bg-violet-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300'}`}>
      <span className="flex items-center gap-2.5 text-sm text-slate-700">
        {Icon && <Icon size={14} className={value ? 'text-primary' : 'text-slate-400'} />}
        {label}
      </span>
      <div className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${value ? 'bg-primary' : 'bg-slate-300'}`}>
        <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </div>
    </button>;
}

// ── Modal ─────────────────────────────────────────────────────────────────────

interface TemplateModalProps {
  mode: 'create' | 'edit';
  initial?: FormTemplate;
  onClose: () => void;
  onSave: (data: ReturnType<typeof blankForm>) => Promise<void>;
  saving: boolean;
  isPlatformOwner?: boolean;
}
function TemplateModal({
  mode,
  initial,
  onClose,
  onSave,
  saving,
  isPlatformOwner = false,
}: TemplateModalProps) {
  const [form, setForm] = useState(() => initial ? {
    name: initial.name,
    formType: initial.formType,
    category: initial.category ?? '',
    description: initial.description ?? '',
    isActive: initial.isActive,
    onDashboard: initial.onDashboard,
    onJobs: initial.onJobs,
    onFleet: initial.onFleet,
    sharedInLibrary: initial.sharedInLibrary ?? false,
  } : blankForm());
  const set = <K extends keyof typeof form,>(k: K, v: (typeof form)[K]) => setForm(p => ({
    ...p,
    [k]: v
  }));
  return <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div initial={{
      opacity: 0,
      scale: 0.95,
      y: 12
    }} animate={{
      opacity: 1,
      scale: 1,
      y: 0
    }} exit={{
      opacity: 0,
      scale: 0.95,
      y: 12
    }} transition={{
      duration: 0.18
    }} className="relative w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl bg-white border border-slate-200">
        {/* Accent line */}
        <div className="h-0.5 w-full bg-gradient-to-r from-primary via-violet-500 to-transparent" />

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-violet-50">
              <FileText size={15} className="text-primary" />
            </div>
            <h2 className="font-heading font-bold text-base text-slate-900">
              {mode === 'create' ? 'New Form Template' : 'Edit Template'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-slate-800 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 flex flex-col gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
              Template Name <span className="text-primary">*</span>
            </label>
            <input className={lightInput} placeholder="e.g. Site Induction Form" value={form.name} onChange={e => set('name', e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Form Type</label>
              <select className={lightSelect} value={form.formType} onChange={e => set('formType', e.target.value as FormType)}>
                {FORM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Category</label>
              <input className={lightInput} placeholder="e.g. Safety, HR" value={form.category} onChange={e => set('category', e.target.value)} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Description</label>
            <textarea className={`${lightInput} resize-none`} rows={3} placeholder="What is this form used for?" value={form.description} onChange={e => set('description', e.target.value)} />
          </div>

          <div className="flex flex-col gap-2 pt-1">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Availability</p>
            <DarkToggle label="Active" value={form.isActive} onChange={() => set('isActive', !form.isActive)} />
            <DarkToggle label="Available on Dashboard" icon={LayoutDashboard} value={form.onDashboard} onChange={() => set('onDashboard', !form.onDashboard)} />
            <DarkToggle label="Available for Jobs" icon={Briefcase} value={form.onJobs} onChange={() => set('onJobs', !form.onJobs)} />
            <DarkToggle label="Available for Fleet" icon={Truck} value={form.onFleet} onChange={() => set('onFleet', !form.onFleet)} />
            {isPlatformOwner && (
              <>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2 mb-1">Global Library</p>
                <DarkToggle label="Shared in Global Library" icon={Globe} value={form.sharedInLibrary} onChange={() => set('sharedInLibrary', !form.sharedInLibrary)} />
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700 transition-colors">
            Cancel
          </button>
          <button onClick={() => onSave(form)} disabled={saving || !form.name.trim()} className="px-5 py-2 text-sm font-bold text-white rounded-xl disabled:opacity-40 transition-all hover:brightness-110 bg-primary">
            {saving ? 'Saving…' : mode === 'create' ? 'Create Template' : 'Save Changes'}
          </button>
        </div>
      </motion.div>
    </div>;
}

// ── Delete confirm ────────────────────────────────────────────────────────────

function DeleteConfirm({
  name,
  onConfirm,
  onCancel,
  deleting
}: {
  name: string;
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <motion.div initial={{
      opacity: 0,
      scale: 0.95
    }} animate={{
      opacity: 1,
      scale: 1
    }} exit={{
      opacity: 0,
      scale: 0.95
    }} transition={{
      duration: 0.14
    }} className="relative w-full max-w-sm rounded-2xl p-6 shadow-2xl bg-white border border-slate-200">
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
          <button onClick={onConfirm} disabled={deleting} className="px-5 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors">
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </motion.div>
    </div>;
}

// ── Template card ─────────────────────────────────────────────────────────────

function TemplateCard({
  t,
  onBuild,
  onEdit,
  onDelete,
  onShare,
  onComplete,
  isCompleting
}: {
  t: FormTemplate;
  onBuild: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onShare: () => void;
  onComplete?: () => void;
  isCompleting?: boolean;
}) {
  const meta = TYPE_META[t.formType];
  const [menuOpen, setMenuOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  function openMenu() {
    // Measure available space below the button before opening
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setDropUp(spaceBelow < 220); // dropdown is ~200px tall
    }
    setMenuOpen(v => !v);
  }

  // Close on outside click or Escape
  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  function menuAction(fn: () => void) {
    setMenuOpen(false);
    fn();
  }
  return <motion.div layout initial={{
    opacity: 0,
    y: 6
  }} animate={{
    opacity: 1,
    y: 0
  }} className="group relative flex items-center gap-3 bg-white border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all rounded-xl px-3 py-2.5">
      {/* Left accent stripe */}
      <div className={`shrink-0 w-1 h-8 rounded-full ${meta.dot}`} />

      {/* Name + meta */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <p className="font-heading font-bold text-sm text-slate-900 truncate">{t.name}</p>
          <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-md ${meta.bg} ${meta.color}`}>
            {t.formType}
          </span>
        </div>
        {/* Pills row */}
        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
          <span className={`text-[10px] px-1.5 py-0 rounded-full font-semibold leading-5 ${t.isActive ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
            {t.isActive ? '● Active' : '○ Inactive'}
          </span>
          {t.category && <span className="text-[10px] px-1.5 py-0 rounded-full font-semibold leading-5 bg-slate-100 text-slate-500 truncate max-w-[120px]">
              {t.category}
            </span>}
          {t.onDashboard && <span className="text-[10px] px-1.5 py-0 rounded-full font-semibold leading-5 bg-slate-100 text-slate-500 flex items-center gap-0.5">
              <LayoutDashboard size={8} /> Dash
            </span>}
          {t.onJobs && <span className="text-[10px] px-1.5 py-0 rounded-full font-semibold leading-5 bg-slate-100 text-slate-500 flex items-center gap-0.5">
              <Briefcase size={8} /> Jobs
            </span>}
          {t.onFleet && <span className="text-[10px] px-1.5 py-0 rounded-full font-semibold leading-5 bg-slate-100 text-slate-500 flex items-center gap-0.5">
              <Truck size={8} /> Fleet
            </span>}
        </div>
      </div>

      {/* Actions: ⋯ only — Complete is handled by Fill Form in the header */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* ⋯ More actions */}
        <div ref={menuRef} className="relative">
          <button onClick={openMenu} className="flex items-center justify-center w-11 h-11 sm:w-8 sm:h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors" aria-label={`More actions for ${t.name}`} aria-expanded={menuOpen} aria-haspopup="menu">
            <MoreHorizontal size={15} />
          </button>

          <AnimatePresence>
            {menuOpen && <motion.div initial={{
            opacity: 0,
            scale: 0.95,
            y: dropUp ? 4 : -4
          }} animate={{
            opacity: 1,
            scale: 1,
            y: 0
          }} exit={{
            opacity: 0,
            scale: 0.95,
            y: dropUp ? 4 : -4
          }} transition={{
            duration: 0.12
          }} role="menu" className={`absolute right-0 z-50 bg-white border border-slate-200 rounded-xl shadow-lg py-1 min-w-[180px] ${dropUp ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
                {/* Build */}
                <button role="menuitem" onClick={() => menuAction(onBuild)} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors text-left">
                  <Zap size={14} className="text-primary shrink-0" />
                  <span className="font-medium">Build fields</span>
                  <span className="ml-auto text-[10px] text-slate-400 hidden sm:inline">Desktop</span>
                </button>

                <div className="h-px bg-slate-100 mx-2 my-1" />

                {/* Share public link */}
                <button role="menuitem" onClick={() => menuAction(onShare)} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors text-left">
                  <Link2 size={14} className="text-violet-500 shrink-0" />
                  <span className="font-medium">Public link</span>
                </button>

                <div className="h-px bg-slate-100 mx-2 my-1" />

                {/* Edit */}
                <button role="menuitem" onClick={() => menuAction(onEdit)} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors text-left">
                  <Pencil size={14} className="text-slate-400 shrink-0" />
                  <span className="font-medium">Edit template</span>
                </button>

                {/* Delete */}
                <button role="menuitem" onClick={() => menuAction(onDelete)} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors text-left">
                  <Trash2 size={14} className="shrink-0" />
                  <span className="font-medium">Delete</span>
                </button>
              </motion.div>}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>;
}

// ── Share Link Modal ──────────────────────────────────────────────────────────

function ShareLinkModal({
  templateId,
  templateName,
  onClose
}: {
  templateId: number;
  templateName: string;
  onClose: () => void;
}) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [revoking, setRevoking] = useState(false);
  const [revoked, setRevoked] = useState(false);
  useEffect(() => {
    fetch(`/api/forms/templates/${templateId}/share-link`, {
      method: 'POST',
      credentials: 'include'
    }).then(r => r.json()).then((d: {
      url?: string;
      error?: string;
    }) => {
      if (d.error) {
        setError(d.error);
        return;
      }
      setUrl(d.url ?? '');
    }).catch(() => setError('Failed to generate link')).finally(() => setLoading(false));
  }, [templateId]);
  function copy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }
  async function handleRevoke() {
    if (!confirm('Revoke this share link? Anyone with the current link will no longer be able to fill out the form. Existing submissions are preserved.')) return;
    setRevoking(true);
    try {
      const r = await fetch(`/api/forms/templates/${templateId}/share-link`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (!r.ok) {
        const d = (await r.json()) as {
          error?: string;
        };
        setError(d.error ?? 'Failed to revoke');
        return;
      }
      setRevoked(true);
      setUrl('');
    } catch {
      setError('Failed to revoke link');
    } finally {
      setRevoking(false);
    }
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <motion.div initial={{
      opacity: 0,
      scale: 0.95
    }} animate={{
      opacity: 1,
      scale: 1
    }} exit={{
      opacity: 0,
      scale: 0.95
    }} transition={{
      duration: 0.15
    }} className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center">
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

        {loading ? <div className="flex items-center gap-2 text-sm text-slate-400 py-3">
            <Loader2 size={14} className="animate-spin" /> Generating link…
          </div> : error ? <p className="text-sm text-red-600">{error}</p> : revoked ? <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-3 text-xs text-amber-700">
            Link revoked. Existing submissions are preserved. Reopen this modal to generate a new link.
          </div> : <>
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-600 truncate font-mono">
                {url}
              </div>
              <button onClick={copy} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors shrink-0 ${copied ? 'bg-emerald-500 text-white' : 'bg-primary text-white hover:brightness-110'}`}>
                {copied ? <><CheckCircle2 size={12} /> Copied!</> : <><Copy size={12} /> Copy</>}
              </button>
            </div>
            <button onClick={() => void handleRevoke()} disabled={revoking} className="mt-2 flex items-center gap-1.5 text-xs text-red-600 border border-red-200 hover:bg-red-50 px-3 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 w-full justify-center">
              {revoking ? <Loader2 size={11} className="animate-spin" /> : <XCircle size={11} />}
              Revoke link
            </button>
          </>}

        <p className="text-[10px] text-slate-500 mt-3">
          Anyone with this link can fill out the form without logging in. Responses appear in the Submissions inbox. Use Revoke to disable the link at any time.
        </p>
      </motion.div>
    </div>;
}

// ── Submissions Inbox ─────────────────────────────────────────────────────────

interface Submission {
  id: number;
  source: 'internal' | 'public';
  template_id: number;
  template_name: string;
  form_type: string;
  submitter_name: string | null;
  submitter_email: string | null;
  job_id: number | null;
  job_name: string | null;
  job_number: string | null;
  status: string;
  completed_at: string;
  answers_json: string | null;
  form_route: string | null;
}
function SubmissionsInbox({
  templates,
  onFillForm
}: {
  templates: FormTemplate[];
  onFillForm: () => void;
}) {
  const navigate = useNavigate();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [templateFilter, setTemplateFilter] = useState('');
  const [expandedPublic, setExpandedPublic] = useState<Set<number | string>>(new Set());
  useEffect(() => {
    setLoading(true);
    const url = templateFilter ? `/api/forms/submissions?templateId=${templateFilter}` : '/api/forms/submissions';
    fetch(url, {
      credentials: 'include'
    }).then(r => r.json()).then((d: {
      submissions?: Submission[];
      total?: number;
    }) => {
      setSubmissions(d.submissions ?? []);
      setTotal(d.total ?? 0);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [templateFilter]);
  function togglePublicExpand(key: number | string) {
    setExpandedPublic(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }
  function fmtDate(d: string) {
    const dt = new Date(d);
    const date = dt.toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
    const time = dt.toLocaleTimeString('en-AU', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).toLowerCase();
    return `${date} · ${time}`;
  }
  function openForm(s: Submission, e?: React.MouseEvent) {
    e?.stopPropagation();
    if (s.source === 'internal' && s.form_route) {
      navigate(s.form_route, {
        state: {
          returnTo: '/studio/forms?tab=submissions'
        }
      });
    }
  }
  function jobLine(s: Submission): string {
    if (!s.job_name) return 'Standalone submission';
    const prefix = s.job_number ? `${s.job_number} — ` : '';
    return `${prefix}${s.job_name}`;
  }
  function submitterLine(s: Submission): string {
    if (s.source === 'public') {
      return s.submitter_name ? s.submitter_name : 'Public submission';
    }
    return s.submitter_name ? `Submitted by ${s.submitter_name}` : 'Submitted by unknown';
  }
  return <div className="space-y-4">
      {/* ── Fill Form CTA ── */}
      <button onClick={onFillForm} disabled={templates.length === 0} title={templates.length === 0 ? 'Create a template first' : 'Fill out a form'} className="w-full sm:w-auto flex items-center justify-center gap-2 text-sm font-bold text-white px-5 py-3 rounded-xl transition-all hover:brightness-110 bg-primary disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px]">
        <ClipboardCheck size={15} /> Fill Form
      </button>

      {/* ── Filter bar ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <select value={templateFilter} onChange={e => setTemplateFilter(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30">
          <option value="">All templates</option>
          {templates.map(t => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
        </select>
        <span className="text-xs text-slate-400">{total} completed form{total !== 1 ? 's' : ''}</span>
      </div>

      {/* ── States ── */}
      {loading ? <div className="flex items-center justify-center py-16">
          <Loader2 size={22} className="animate-spin text-primary" />
        </div> : submissions.length === 0 ? <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 bg-violet-50 rounded-xl flex items-center justify-center mb-4">
            <Inbox size={24} className="text-primary" />
          </div>
          <p className="font-heading font-bold text-slate-700 mb-1">No completed Forms yet</p>
          <p className="text-sm text-slate-400 max-w-xs">Completed Job Forms and public Form responses will appear here.</p>
        </div> : <>
          {/* ══════════════════════════════════════════════════════════════
              MOBILE CARDS  — visible below md breakpoint
           ══════════════════════════════════════════════════════════════ */}
          <div className="md:hidden space-y-2">
            {submissions.map(s => {
          const rowKey = `${s.source}-${s.id}`;
          const isInternal = s.source === 'internal';
          const isPublicExpanded = expandedPublic.has(rowKey);
          let answers: Record<string, unknown> = {};
          try {
            answers = s.answers_json ? JSON.parse(s.answers_json) as Record<string, unknown> : {};
          } catch {/* ignore */}
          const answerCount = Object.keys(answers).length;
          const canOpen = isInternal && !!s.form_route;
          return <div key={rowKey} className={`bg-white border border-slate-200 rounded-xl overflow-hidden transition-colors ${canOpen ? 'cursor-pointer hover:border-primary/40 hover:bg-violet-50/30 active:bg-violet-50' : ''}`} onClick={canOpen ? e => openForm(s, e) : undefined} role={canOpen ? 'button' : undefined} tabIndex={canOpen ? 0 : undefined} onKeyDown={canOpen ? e => {
            if (e.key === 'Enter' || e.key === ' ') openForm(s);
          } : undefined} aria-label={canOpen ? `Open form: ${s.template_name}` : undefined}>
                  {/* Card body */}
                  <div className="px-4 pt-3 pb-3 space-y-1.5">

                    {/* Row 1: Form name + status pill */}
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-bold text-slate-800 leading-snug flex-1 min-w-0">
                        {s.template_name}
                      </p>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 shrink-0 whitespace-nowrap mt-0.5">
                        {s.status}
                      </span>
                    </div>

                    {/* Row 2: Job — single unbreakable line */}
                    <p className="text-xs text-slate-500 whitespace-nowrap overflow-hidden text-ellipsis">
                      {jobLine(s)}
                    </p>

                    {/* Row 3: Submitter + source badge */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs text-slate-500">{submitterLine(s)}</p>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${isInternal ? 'bg-blue-50 text-blue-700' : 'bg-violet-50 text-violet-700'}`}>
                        {isInternal ? 'Internal' : 'Public'}
                      </span>
                    </div>

                    {/* Row 4: Date — single line */}
                    <p className="text-xs text-slate-400 whitespace-nowrap">
                      {fmtDate(s.completed_at)}
                    </p>

                    {/* Row 5: public expand toggle only — internal cards are fully tappable */}
                    {!canOpen && <button onClick={e => {
                e.stopPropagation();
                togglePublicExpand(rowKey);
              }} className="mt-1 w-full flex items-center justify-center gap-1.5 text-sm font-semibold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg py-2.5 transition-colors min-h-[44px]" aria-expanded={isPublicExpanded} aria-label={isPublicExpanded ? 'Hide answers' : `View ${answerCount} answer${answerCount !== 1 ? 's' : ''}`}>
                        {isPublicExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        {isPublicExpanded ? 'Hide answers' : `View ${answerCount} answer${answerCount !== 1 ? 's' : ''}`}
                      </button>}
                  </div>

                  {/* Expanded answers — public responses only */}
                  {!isInternal && <AnimatePresence>
                      {isPublicExpanded && <motion.div initial={{
                height: 0,
                opacity: 0
              }} animate={{
                height: 'auto',
                opacity: 1
              }} exit={{
                height: 0,
                opacity: 0
              }} transition={{
                duration: 0.18
              }} className="overflow-hidden">
                          <div className="border-t border-slate-100 px-4 py-3 bg-slate-50">
                            {answerCount === 0 ? <p className="text-xs text-slate-400 italic">No answers recorded</p> : <div className="space-y-2">
                                {Object.entries(answers).map(([fieldId, answer]) => <div key={fieldId} className="bg-white border border-slate-200 rounded-lg px-3 py-2">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">Field {fieldId}</p>
                                    <p className="text-xs text-slate-700 break-words">
                                      {Array.isArray(answer) ? (answer as string[]).join(', ') : String(answer ?? '—')}
                                    </p>
                                  </div>)}
                              </div>}
                          </div>
                        </motion.div>}
                    </AnimatePresence>}
                </div>;
        })}
          </div>

          {/* ══════════════════════════════════════════════════════════════
              DESKTOP TABLE  — visible from md breakpoint up
           ══════════════════════════════════════════════════════════════ */}
          <div className="hidden md:block rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Form</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Job</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Submitted by</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Source</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Completed</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {submissions.map(s => {
              const rowKey = `${s.source}-${s.id}`;
              const isInternal = s.source === 'internal';
              const canOpen = isInternal && !!s.form_route;
              return <tr key={rowKey} className={`bg-white hover:bg-slate-50 transition-colors ${canOpen ? 'cursor-pointer' : ''}`} onClick={canOpen ? e => openForm(s, e) : undefined}>
                      {/* Form name */}
                      <td className="px-4 py-3 font-semibold text-slate-800 max-w-[200px]">
                        <span className="block truncate">{s.template_name}</span>
                      </td>
                      {/* Job */}
                      <td className="px-4 py-3 text-slate-600 max-w-[180px]">
                        <span className="block truncate">{jobLine(s)}</span>
                      </td>
                      {/* Submitted by */}
                      <td className="px-4 py-3 text-slate-600 max-w-[160px]">
                        <span className="block truncate">{s.submitter_name ?? (isInternal ? 'Unknown' : 'Public submission')}</span>
                      </td>
                      {/* Source badge */}
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${isInternal ? 'bg-blue-50 text-blue-700' : 'bg-violet-50 text-violet-700'}`}>
                          {isInternal ? 'Internal Form' : 'Public Response'}
                        </span>
                      </td>
                      {/* Date */}
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">
                        {fmtDate(s.completed_at)}
                      </td>
                      {/* Status */}
                      <td className="px-4 py-3">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 whitespace-nowrap">
                          {s.status}
                        </span>
                      </td>
                    </tr>;
            })}
              </tbody>
            </table>
          </div>
        </>}
    </div>;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function FormsPage() {
  const navigate = useNavigate();
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
  const [completingId, setCompletingId] = useState<number | null>(null);
  const [jobPickerTemplate, setJobPickerTemplate] = useState<FormTemplate | null>(null);
  const [jobPickerError, setJobPickerError] = useState('');
  const [jobPickerLoading, setJobPickerLoading] = useState(false);
  // Fill Form — template picker (shown before the job picker when triggered from header)
  const [fillFormPickerOpen, setFillFormPickerOpen] = useState(false);
  // Job selector state
  type JobOption = {
    id: number;
    job_number: string | null;
    title: string;
    client: string | null;
  };
  const [jobOptions, setJobOptions] = useState<JobOption[]>([]);
  const [jobOptionsLoading, setJobOptionsLoading] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [jobSearch, setJobSearch] = useState('');
  const {
    isPlatformOwner
  } = usePermissions();
  async function handleComplete(templateId: number) {
    const tpl = templates.find(t => t.id === templateId) ?? null;
    setJobPickerTemplate(tpl);
    setJobPickerError('');
    setSelectedJobId(null);
    setJobSearch('');
    // Fetch active jobs for the selector
    setJobOptionsLoading(true);
    try {
      const res = await fetch('/api/forms/jobs-list', {
        credentials: 'include'
      });
      const data = (await res.json()) as {
        ok?: boolean;
        jobs?: JobOption[];
      };
      setJobOptions(data.jobs ?? []);
    } catch {
      setJobOptions([]);
    } finally {
      setJobOptionsLoading(false);
    }
  }
  async function handleJobPickerSubmit() {
    if (!jobPickerTemplate) return;
    if (!selectedJobId) {
      setJobPickerError('Please select a job.');
      return;
    }
    setJobPickerLoading(true);
    setJobPickerError('');
    setCompletingId(jobPickerTemplate.id);
    try {
      const res = await fetch('/api/forms/start', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          templateId: jobPickerTemplate.id,
          jobId: selectedJobId
        })
      });
      const data = (await res.json()) as {
        ok?: boolean;
        submission?: {
          id: number;
          jobId?: number | null;
        };
        error?: string;
      };
      if (!res.ok || !data.submission) throw new Error(data.error ?? 'Failed to start form');
      const jobId = data.submission.jobId ?? selectedJobId;
      setJobPickerTemplate(null);
      navigate(`/jobs/${jobId}/forms/${data.submission.id}`, {
        state: {
          returnTo: '/studio/forms?tab=forms'
        }
      });
    } catch (e) {
      setJobPickerError(e instanceof Error ? e.message : 'Could not start form. Please try again.');
    } finally {
      setJobPickerLoading(false);
      setCompletingId(null);
    }
  }

  // ── Document Builder state removed — Documents tab moved to Studio ───────────
  // Initialise from ?tab= query param so returnTo links land on the right tab.
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const validTabs = ['submissions', 'forms', 'library'] as const;
  type TabId = typeof validTabs[number];
  const initialTab: TabId = validTabs.includes(tabParam as TabId) ? tabParam as TabId : 'submissions';
  const [pageTab, setPageTab] = useState<TabId>(initialTab);
  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/form-templates', {
        credentials: 'include'
      });
      if (res.status === 401) {
        setTemplates([]);
        return;
      }
      const data = (await res.json()) as {
        templates: FormTemplate[];
      };
      setTemplates(data.templates ?? []);
    } catch {
      setError('Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void fetchTemplates();
  }, [fetchTemplates]);
  const handleCreate = async (form: ReturnType<typeof blankForm>) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/form-templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(form)
      });
      if (!res.ok) {
        const d = (await res.json()) as {
          error?: string;
        };
        throw new Error(d.error ?? 'Failed');
      }
      setShowCreate(false);
      await fetchTemplates();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSaving(false);
    }
  };
  const handleEdit = async (form: ReturnType<typeof blankForm>) => {
    if (!editTarget) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/form-templates/${editTarget.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(form)
      });
      if (!res.ok) {
        const d = (await res.json()) as {
          error?: string;
        };
        throw new Error(d.error ?? 'Failed');
      }
      setEditTarget(null);
      await fetchTemplates();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSaving(false);
    }
  };
  const handleSeed = async () => {
    setSeeding(true);
    setSeedMsg('');
    try {
      const r = await fetch('/api/form-templates/seed', {
        method: 'POST',
        credentials: 'include'
      });
      const d = (await r.json()) as {
        ok?: boolean;
        message?: string;
        error?: string;
      };
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
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/form-templates/${deleteTarget.id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (!res.ok) {
        const d = (await res.json()) as {
          error?: string;
        };
        throw new Error(d.error ?? 'Failed');
      }
      setDeleteTarget(null);
      await fetchTemplates();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setDeleting(false);
    }
  };
  if (builderTemplateId !== null) {
    return <div className="flex-1 min-h-0 overflow-y-auto">
        <FormFieldBuilder templateId={builderTemplateId} onBack={() => setBuilderTemplateId(null)} />
      </div>;
  }

  // ── Template list view ──────────────────────────────────────────────────────

  return <>
    <div className="flex flex-col min-h-full">
        {/* Header */}
        <header className="h-16 flex items-center justify-between px-6 shrink-0 border-b border-slate-200 bg-white">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-violet-50">
              <FileText size={16} className="text-primary" />
            </div>
            <div>
              <h1 className="font-heading font-bold text-base text-slate-900 leading-tight">Forms</h1>
              {!loading && <p className="text-[11px] text-slate-400">{templates.length} form {templates.length === 1 ? 'template' : 'templates'}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <></>
          </div>
        </header>

        {/* Tab switcher */}
        <div className="flex border-b border-slate-200 bg-white px-6 gap-1">
          {([{
          key: 'submissions',
          label: 'Submissions',
          icon: Inbox
        }, {
          key: 'forms',
          label: 'Templates',
          icon: FileText
        }, {
          key: 'library',
          label: 'Library',
          icon: Library
        }] as const).map(({
          key,
          label,
          icon: Icon
        }) => <button key={key} onClick={() => setPageTab(key)} className={`flex items-center gap-1.5 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${pageTab === key ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              <Icon size={13} />
              {label}
            </button>)}
        </div>

        {/* Error banner */}
        {error && <div className="mx-6 mt-4 px-4 py-3 rounded-xl text-sm text-red-700 flex items-center justify-between border border-red-200 bg-red-50">
            {error}
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 ml-4"><X size={14} /></button>
          </div>}

        {/* Seed success banner */}
        {seedMsg && <div className="mx-6 mt-4 px-4 py-3 rounded-xl text-sm text-emerald-700 flex items-center justify-between border border-emerald-200 bg-emerald-50">
            <span className="flex items-center gap-2"><Check size={14} className="shrink-0" />{seedMsg}</span>
            <button onClick={() => setSeedMsg('')} className="text-emerald-400 hover:text-emerald-600 ml-4"><X size={14} /></button>
          </div>}

        {/* Content */}
        <div className="p-6 pb-16">
          {pageTab === 'forms' && <>
              {loading ? <div className="flex items-center justify-center h-48">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div> : templates.length === 0 ? <motion.div initial={{
            opacity: 0,
            y: 12
          }} animate={{
            opacity: 1,
            y: 0
          }} className="flex flex-col items-center justify-center h-full min-h-[400px] text-center">
                  <div className="relative mb-6">
                    <div className="w-20 h-20 rounded-3xl flex items-center justify-center bg-violet-50 border border-violet-100">
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
                    <button onClick={handleSeed} disabled={seeding} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 px-5 py-3 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-50">
                      {seeding ? <Loader2 size={14} className="animate-spin" /> : <BookOpen size={14} />}
                      Load Templates
                    </button>
                    <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 text-sm font-bold text-white px-6 py-3 rounded-xl transition-all hover:brightness-110 bg-primary">
                      <Plus size={15} /> New Form Template
                    </button>
                  </div>
                </motion.div> : <motion.div initial={{
            opacity: 0
          }} animate={{
            opacity: 1
          }} className="grid grid-cols-1 gap-4">
                  {/* New Form Template button — full width on mobile */}
                  <button onClick={() => setShowCreate(true)} className="w-full sm:w-auto self-start flex items-center justify-center gap-2 text-sm font-bold text-white px-5 py-3 rounded-xl transition-all hover:brightness-110 bg-primary min-h-[44px]">
                    <Plus size={15} /> New Form Template
                  </button>
                  {templates.map(t => <TemplateCard key={t.id} t={t} onBuild={() => setBuilderTemplateId(t.id)} onEdit={() => setEditTarget(t)} onDelete={() => setDeleteTarget(t)} onShare={() => setShareTarget(t)} onComplete={() => void handleComplete(t.id)} isCompleting={completingId === t.id} />)}
                </motion.div>}
            </>}

          {/* ── Submissions tab ── */}
          {pageTab === 'submissions' && <SubmissionsInbox templates={templates} onFillForm={() => setFillFormPickerOpen(true)} />}

          {/* ── Library tab ── */}
          {pageTab === 'library' && <LibraryPage initialTypeFilter="form" />}
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showCreate && <TemplateModal mode="create" onClose={() => setShowCreate(false)} onSave={handleCreate} saving={saving} isPlatformOwner={isPlatformOwner} />}
        {editTarget && <TemplateModal mode="edit" initial={editTarget} onClose={() => setEditTarget(null)} onSave={handleEdit} saving={saving} isPlatformOwner={isPlatformOwner} />}
        {deleteTarget && <DeleteConfirm name={deleteTarget.name} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} deleting={deleting} />}
        {shareTarget && <ShareLinkModal templateId={shareTarget.id} templateName={shareTarget.name} onClose={() => setShareTarget(null)} />}

        {/* ── Fill Form — template picker (step 1 of 2) ── */}
        {fillFormPickerOpen && <motion.div key="fill-form-picker-backdrop" initial={{
        opacity: 0
      }} animate={{
        opacity: 1
      }} exit={{
        opacity: 0
      }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={e => {
        if (e.target === e.currentTarget) setFillFormPickerOpen(false);
      }}>
            <motion.div initial={{
          opacity: 0,
          scale: 0.95,
          y: 8
        }} animate={{
          opacity: 1,
          scale: 1,
          y: 0
        }} exit={{
          opacity: 0,
          scale: 0.95,
          y: 8
        }} transition={{
          duration: 0.15
        }} className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-heading font-bold text-base text-slate-900">Fill Form</h2>
                  <p className="text-sm text-slate-500 mt-0.5 leading-snug">Select a template to complete.</p>
                </div>
                <button onClick={() => setFillFormPickerOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors shrink-0" aria-label="Close">
                  <X size={16} />
                </button>
              </div>

              <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto -mx-1 px-1">
                {templates.map(t => <button key={t.id} type="button" onClick={() => {
              setFillFormPickerOpen(false);
              void handleComplete(t.id);
            }} className="w-full text-left flex items-center gap-3 px-3 py-3 rounded-xl border border-slate-200 hover:border-primary hover:bg-violet-50 transition-colors group min-h-[44px]">
                    <div className="w-8 h-8 rounded-lg bg-violet-50 group-hover:bg-violet-100 flex items-center justify-center shrink-0 transition-colors">
                      <FileText size={14} className="text-primary" />
                    </div>
                    <span className="text-sm font-semibold text-slate-800 truncate flex-1">{t.name}</span>
                    <ChevronDown size={13} className="text-slate-400 -rotate-90 shrink-0" />
                  </button>)}
              </div>
            </motion.div>
          </motion.div>}

        {/* ── Job number picker for standalone form completion ── */}
        {jobPickerTemplate && <motion.div key="job-picker-backdrop" initial={{
        opacity: 0
      }} animate={{
        opacity: 1
      }} exit={{
        opacity: 0
      }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={e => {
        if (e.target === e.currentTarget) setJobPickerTemplate(null);
      }}>
            <motion.div initial={{
          opacity: 0,
          scale: 0.95,
          y: 8
        }} animate={{
          opacity: 1,
          scale: 1,
          y: 0
        }} exit={{
          opacity: 0,
          scale: 0.95,
          y: 8
        }} transition={{
          duration: 0.15
        }} className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 flex flex-col gap-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-heading font-bold text-base text-slate-900">Complete Form</h2>
                  <p className="text-sm text-slate-500 mt-0.5 leading-snug">Select the job to link this form to.</p>
                </div>
                <button onClick={() => setJobPickerTemplate(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors shrink-0">
                  <X size={16} />
                </button>
              </div>

              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200">
                <FileText size={14} className="text-primary shrink-0" />
                <span className="text-sm font-semibold text-slate-700 truncate">{jobPickerTemplate.name}</span>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-600">Job</label>
                {/* Search input */}
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input type="text" placeholder="Search by job number or name…" value={jobSearch} onChange={e => {
                setJobSearch(e.target.value);
                setJobPickerError('');
              }} autoFocus className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors" />
                </div>
                {/* Job list */}
                <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
                  {jobOptionsLoading ? <div className="flex items-center justify-center py-6 text-slate-400 text-sm gap-2">
                      <Loader2 size={14} className="animate-spin" /> Loading jobs…
                    </div> : (() => {
                const q = jobSearch.toLowerCase();
                const filtered = jobOptions.filter(j => !q || (j.job_number ?? '').toLowerCase().includes(q) || j.title.toLowerCase().includes(q) || (j.client ?? '').toLowerCase().includes(q));
                if (filtered.length === 0) return <div className="py-6 text-center text-sm text-slate-400">No active jobs found</div>;
                return filtered.map(job => <button key={job.id} type="button" onClick={() => {
                  setSelectedJobId(job.id);
                  setJobPickerError('');
                }} className={`w-full text-left px-3 py-2.5 flex items-center gap-3 transition-colors ${selectedJobId === job.id ? 'bg-violet-50' : 'hover:bg-slate-50'}`}>
                        <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${selectedJobId === job.id ? 'border-primary bg-primary' : 'border-slate-300'}`}>
                          {selectedJobId === job.id && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            {job.job_number && <span className="text-xs font-bold text-primary shrink-0">#{job.job_number}</span>}
                            <span className="text-sm font-medium text-slate-800 truncate">{job.title}</span>
                          </div>
                          {job.client && <p className="text-xs text-slate-400 truncate">{job.client}</p>}
                        </div>
                      </button>);
              })()}
                </div>
                {jobPickerError && <p className="text-xs text-red-600 flex items-center gap-1.5 mt-0.5">
                    <X size={11} className="shrink-0" /> {jobPickerError}
                  </p>}
              </div>

              <div className="flex gap-2">
                <button onClick={() => setJobPickerTemplate(null)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                  Cancel
                </button>
                <button onClick={() => void handleJobPickerSubmit()} disabled={jobPickerLoading || !selectedJobId} className="flex-1 py-2.5 rounded-xl bg-primary hover:bg-violet-700 text-white text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  {jobPickerLoading ? <><Loader2 size={14} className="animate-spin" /> Opening…</> : <><ExternalLink size={14} /> Open Form</>}
                </button>
              </div>
            </motion.div>
          </motion.div>}
      </AnimatePresence>
    </>;
}

// ── Named export for Studio embedding ─────────────────────────────────────────
export { FormsPage as FormsContent };

// ── /forms route — redirect to Studio Forms tab ───────────────────────────────
export default function FormsRedirect() {
  return <>
      <Helmet>
        <title>Forms — IWILLBUILD</title>
        <meta name="description" content="Manage job, fleet and company forms for your trades business." />
        <link rel="canonical" href="https://iwillbuild.com/forms" />
        <meta name="robots" content="noindex, follow" />
      </Helmet>
      <Navigate to="/studio?tab=forms" replace />
    </>;
}
