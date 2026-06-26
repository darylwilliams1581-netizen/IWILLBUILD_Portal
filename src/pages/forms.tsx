import { useState, useEffect, useCallback } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  FileText, Plus, Pencil, Trash2,
  LayoutDashboard, Briefcase, Truck, ChevronRight, X, Zap,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import PortalSidebar from '@/components/PortalSidebar';
import FormFieldBuilder from '@/components/FormFieldBuilder';

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

function TemplateCard({ t, onBuild, onEdit, onDelete }: {
  t: FormTemplate;
  onBuild: () => void;
  onEdit: () => void;
  onDelete: () => void;
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
  const [builderTemplateId, setBuilderTemplateId] = useState<number | null>(null);

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

  useEffect(() => { void fetchTemplates(); }, [fetchTemplates]);

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

  // ── Template list view ──────────────────────────────────────────────────────

  return (
    <div className="flex h-screen overflow-hidden bg-[#F4F5F7]">
      <Helmet>
        <title>Forms — IWILLBUILD Portal</title>
        <meta name="description" content="Manage form templates for jobs, fleet and compliance." />
        <link rel="canonical" href="https://iwillbuild.com/forms" />
        <meta name="robots" content="noindex" />
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
              <h1 className="font-heading font-bold text-base text-slate-900 leading-tight">Forms</h1>
              {!loading && (
                <p className="text-[11px] text-slate-400">{templates.length} {templates.length === 1 ? 'template' : 'templates'}</p>
              )}
            </div>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 text-sm font-bold text-white px-4 py-2 rounded-xl transition-all hover:brightness-110 bg-primary"
          >
            <Plus size={15} /> New Template
          </button>
        </header>

        {/* Error banner */}
        {error && (
          <div className="mx-6 mt-4 px-4 py-3 rounded-xl text-sm text-red-700 flex items-center justify-between border border-red-200 bg-red-50">
            {error}
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 ml-4"><X size={14} /></button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
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
                Build reusable templates for safety forms, inductions, prestarts and more — linked to jobs and fleet.
              </p>
              <button
                onClick={() => setShowCreate(true)}
                className="inline-flex items-center gap-2 text-sm font-bold text-white px-6 py-3 rounded-xl transition-all hover:brightness-110 bg-primary"
              >
                <Plus size={15} /> Create First Template
              </button>
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
                />
              ))}
            </motion.div>
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
      </AnimatePresence>
    </div>
  );
}
