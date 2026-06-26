import { useState, useEffect, useCallback } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { FileText, Plus, Pencil, Trash2, ToggleLeft, ToggleRight, LayoutDashboard, Briefcase, Truck, ChevronRight } from 'lucide-react';
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

const TYPE_COLORS: Record<FormType, string> = {
  Job:      'bg-blue-50 text-blue-700 border-blue-200',
  Company:  'bg-purple-50 text-purple-700 border-purple-200',
  Fleet:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  Accounts: 'bg-amber-50 text-amber-700 border-amber-200',
};

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
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.15 }}
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="font-heading font-bold text-base text-slate-900">
            {mode === 'create' ? 'New Form Template' : 'Edit Template'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors text-xl leading-none">&times;</button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Template Name <span className="text-red-500">*</span></label>
            <input
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              placeholder="e.g. Site Induction Form"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
            />
          </div>

          {/* Form Type + Category */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Form Type</label>
              <select
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-white"
                value={form.formType}
                onChange={(e) => set('formType', e.target.value as FormType)}
              >
                {FORM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Category</label>
              <input
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                placeholder="e.g. Safety, HR"
                value={form.category}
                onChange={(e) => set('category', e.target.value)}
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Description</label>
            <textarea
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
              rows={3}
              placeholder="What is this form used for?"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </div>

          {/* Toggles */}
          <div className="flex flex-col gap-3 pt-1">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Availability</p>
            {(
              [
                { key: 'isActive',    label: 'Active',               icon: null },
                { key: 'onDashboard', label: 'Available on Dashboard', icon: LayoutDashboard },
                { key: 'onJobs',      label: 'Available for Jobs',    icon: Briefcase },
                { key: 'onFleet',     label: 'Available for Fleet',   icon: Truck },
              ] as const
            ).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => set(key, !form[key])}
                className="flex items-center justify-between w-full px-3 py-2.5 rounded-lg border border-slate-200 hover:border-slate-300 transition-colors"
              >
                <span className="flex items-center gap-2 text-sm text-slate-700">
                  {Icon && <Icon size={14} className="text-slate-400" />}
                  {label}
                </span>
                {form[key]
                  ? <ToggleRight size={20} className="text-primary" />
                  : <ToggleLeft size={20} className="text-slate-300" />
                }
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(form)}
            disabled={saving || !form.name.trim()}
            className="px-5 py-2 bg-primary hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {saving ? 'Saving…' : mode === 'create' ? 'Create Template' : 'Save Changes'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Delete confirm ────────────────────────────────────────────────────────────

interface DeleteConfirmProps {
  name: string;
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}

function DeleteConfirm({ name, onConfirm, onCancel, deleting }: DeleteConfirmProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.12 }}
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm p-6"
      >
        <h3 className="font-heading font-bold text-base text-slate-900 mb-2">Delete Template?</h3>
        <p className="text-sm text-slate-500 mb-6">
          <span className="font-semibold text-slate-700">"{name}"</span> will be permanently deleted. This cannot be undone.
        </p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 transition-colors">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="px-5 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </motion.div>
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
  const [builderTemplateId, setBuilderTemplateId] = useState<number | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────

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

  // ── Create ─────────────────────────────────────────────────────────────────

  const handleCreate = async (form: ReturnType<typeof blankForm>) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/form-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? 'Failed to create');
      }
      setShowCreate(false);
      await fetchTemplates();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create template');
    } finally {
      setSaving(false);
    }
  };

  // ── Edit ───────────────────────────────────────────────────────────────────

  const handleEdit = async (form: ReturnType<typeof blankForm>) => {
    if (!editTarget) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/form-templates/${editTarget.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? 'Failed to update');
      }
      setEditTarget(null);
      await fetchTemplates();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update template');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/form-templates/${deleteTarget.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? 'Failed to delete');
      }
      setDeleteTarget(null);
      await fetchTemplates();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete template');
    } finally {
      setDeleting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  // ── Builder view ───────────────────────────────────────────────────────────

  if (builderTemplateId !== null) {
    return (
      <div className="flex h-screen bg-slate-100 overflow-hidden">
        <Helmet>
          <title>Form Builder — IWILLBUILD Portal</title>
          <meta name="robots" content="noindex" />
        </Helmet>
        <PortalSidebar />
        <div className="flex-1 overflow-y-auto">
          <FormFieldBuilder
            templateId={builderTemplateId}
            onBack={() => setBuilderTemplateId(null)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden">
      <Helmet>
        <title>Forms — IWILLBUILD Portal</title>
        <meta name="description" content="Manage form templates for jobs, fleet and compliance in the IWILLBUILD portal." />
        <link rel="canonical" href="https://iwillbuild.com/forms" />
        <meta name="robots" content="noindex" />
      </Helmet>

      <PortalSidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-3">
            <FileText size={20} className="text-primary" />
            <h1 className="font-heading font-bold text-lg">Forms</h1>
            {!loading && (
              <span className="text-xs text-slate-400 font-medium">
                {templates.length} {templates.length === 1 ? 'template' : 'templates'}
              </span>
            )}
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            <Plus size={15} />
            New Template
          </button>
        </header>

        {/* Error banner */}
        {error && (
          <div className="mx-6 mt-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center justify-between">
            {error}
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 ml-4">&times;</button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : templates.length === 0 ? (
            /* Empty state */
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center h-full min-h-[400px] text-center"
            >
              <div className="w-14 h-14 bg-slate-900 rounded-2xl flex items-center justify-center mb-5">
                <FileText size={24} className="text-white" />
              </div>
              <h2 className="font-heading font-bold text-xl text-slate-800 mb-2">No form templates yet</h2>
              <p className="text-slate-500 text-sm max-w-xs mb-6 leading-relaxed">
                Create reusable templates for safety forms, inductions, prestarts and more — linked to jobs and fleet.
              </p>
              <button
                onClick={() => setShowCreate(true)}
                className="inline-flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
              >
                <Plus size={15} />
                Create First Template
              </button>
            </motion.div>
          ) : (
            /* Template grid */
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
            >
              {templates.map((t) => (
                <motion.div
                  key={t.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col gap-3 hover:shadow-sm transition-shadow"
                >
                  {/* Top row */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-heading font-bold text-sm text-slate-900 truncate">{t.name}</p>
                      {t.category && (
                        <p className="text-xs text-slate-400 mt-0.5 truncate">{t.category}</p>
                      )}
                    </div>
                    <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full border ${TYPE_COLORS[t.formType]}`}>
                      {t.formType}
                    </span>
                  </div>

                  {/* Description */}
                  {t.description && (
                    <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">{t.description}</p>
                  )}

                  {/* Availability pills */}
                  <div className="flex flex-wrap gap-1.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${t.isActive ? 'bg-green-50 text-green-700 border-green-200' : 'bg-slate-100 text-slate-400 border-slate-200'}`}>
                      {t.isActive ? 'Active' : 'Inactive'}
                    </span>
                    {t.onDashboard && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-600 border border-slate-200 flex items-center gap-1">
                        <LayoutDashboard size={10} /> Dashboard
                      </span>
                    )}
                    {t.onJobs && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-600 border border-slate-200 flex items-center gap-1">
                        <Briefcase size={10} /> Jobs
                      </span>
                    )}
                    {t.onFleet && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-600 border border-slate-200 flex items-center gap-1">
                        <Truck size={10} /> Fleet
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                    <button
                      onClick={() => setBuilderTemplateId(t.id)}
                      className="flex items-center gap-1.5 text-xs font-semibold text-white bg-primary hover:bg-orange-600 transition-colors px-3 py-1.5 rounded-lg"
                    >
                      Build fields <ChevronRight size={12} />
                    </button>
                    <button
                      onClick={() => setEditTarget(t)}
                      className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-primary transition-colors px-2 py-1.5 rounded-md hover:bg-orange-50"
                    >
                      <Pencil size={12} /> Edit
                    </button>
                    <button
                      onClick={() => setDeleteTarget(t)}
                      className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-red-600 transition-colors px-2 py-1.5 rounded-md hover:bg-red-50 ml-auto"
                    >
                      <Trash2 size={12} /> Delete
                    </button>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showCreate && (
          <TemplateModal
            mode="create"
            onClose={() => setShowCreate(false)}
            onSave={handleCreate}
            saving={saving}
          />
        )}
        {editTarget && (
          <TemplateModal
            mode="edit"
            initial={editTarget}
            onClose={() => setEditTarget(null)}
            onSave={handleEdit}
            saving={saving}
          />
        )}
        {deleteTarget && (
          <DeleteConfirm
            name={deleteTarget.name}
            onConfirm={handleDelete}
            onCancel={() => setDeleteTarget(null)}
            deleting={deleting}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
