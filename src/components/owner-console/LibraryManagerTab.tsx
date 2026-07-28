/**
 * LibraryManagerTab — Owner Console → Global Library
 *
 * Platform owner full governance of the Global Library:
 *   • Browse all items (all statuses, all visibilities)
 *   • Filter by type / status / search
 *   • Create new items (upload DOCX/PDF or blank)
 *   • Edit metadata (title, type, category, discipline, summary, tags, version, status, visibility)
 *   • Publish / unpublish (toggle visibility public ↔ private)
 *   • Archive / restore
 *   • Delete permanently
 *   • Push update to company copies (explicit, not silent)
 *   • View install count
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  BookOpen, Plus, Search, Loader2, AlertCircle, CheckCircle2,
  Pencil, Trash2, FileText, Upload, X, ChevronDown,
  Shield, ClipboardList, Wrench, Calculator, Package, RefreshCw,
  Eye, EyeOff, Archive, Download, Globe, XCircle,
  Building2, Send, RotateCcw, Tag, Info,
} from 'lucide-react';
import { toast } from 'sonner';

// ── Types ─────────────────────────────────────────────────────────────────────

interface LibItem {
  id: number;
  type: string;
  category: string | null;
  title: string;
  summary: string | null;
  tags: string | null;
  discipline: string | null;
  version: string;
  status: string;        // active | draft | archived
  visibility: string;    // public | private
  install_count: number;
  download_count: number;
  source_file_name: string | null;
  file_path: string | null;
  created_at: string;
  updated_at: string;
}

const ITEM_TYPES = [
  { value: 'policy',          label: 'Policy' },
  { value: 'procedure',       label: 'Procedure' },
  { value: 'swms',            label: 'SWMS' },
  { value: 'form',            label: 'Form' },
  { value: 'checklist',       label: 'Checklist' },
  { value: 'induction',       label: 'Induction' },
  { value: 'toolbox_talk',    label: 'Toolbox Talk' },
  { value: 'prestart',        label: 'Pre-start' },
  { value: 'report',          label: 'Report' },
  { value: 'recipe',          label: 'Recipe' },
  { value: 'estimate_recipe', label: 'Estimate Recipe' },
  { value: 'scope_line',      label: 'Scope Line' },
];

const TYPE_ICONS: Record<string, React.ElementType> = {
  policy: Shield, procedure: FileText, swms: AlertCircle,
  form: ClipboardList, recipe: Wrench, estimate_recipe: Calculator,
  scope_line: Package, checklist: ClipboardList, induction: BookOpen,
  toolbox_talk: FileText, prestart: FileText, report: FileText,
};

const TYPE_COLORS: Record<string, string> = {
  policy: 'bg-blue-100 text-blue-700', procedure: 'bg-purple-100 text-purple-700',
  swms: 'bg-red-100 text-red-700', form: 'bg-green-100 text-green-700',
  recipe: 'bg-amber-100 text-amber-700', estimate_recipe: 'bg-violet-100 text-violet-800',
  scope_line: 'bg-slate-100 text-slate-700', checklist: 'bg-teal-100 text-teal-700',
  induction: 'bg-indigo-100 text-indigo-700', toolbox_talk: 'bg-pink-100 text-pink-700',
  prestart: 'bg-cyan-100 text-cyan-700', report: 'bg-violet-100 text-violet-700',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  draft: 'bg-amber-100 text-amber-700',
  archived: 'bg-slate-100 text-slate-500',
};

const CATEGORIES = [
  'Safety', 'HR', 'Operations', 'Quality', 'Environment',
  'Finance', 'Legal', 'IT', 'Construction', 'Electrical',
  'Plumbing', 'HVAC', 'Landscaping', 'Cleaning', 'Other',
];

const DISCIPLINES = [
  'Construction', 'Electrical', 'Plumbing', 'HVAC', 'Landscaping',
  'Cleaning', 'Mining', 'Oil & Gas', 'Manufacturing', 'Hospitality',
  'Healthcare', 'Transport', 'Retail', 'General', 'Other',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(s: string) {
  try { return new Date(s).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return s; }
}

function typeLabel(t: string) {
  return ITEM_TYPES.find((x) => x.value === t)?.label ?? t;
}

// ── Edit / Create modal ───────────────────────────────────────────────────────

interface EditModalProps {
  item: LibItem | null;   // null = create new
  onClose: () => void;
  onSaved: () => void;
}

function EditModal({ item, onClose, onSaved }: EditModalProps) {
  const isNew = !item;
  const fileRef = useRef<HTMLInputElement>(null);

  const [title,      setTitle]      = useState(item?.title ?? '');
  const [type,       setType]       = useState(item?.type ?? 'procedure');
  const [category,   setCategory]   = useState(item?.category ?? '');
  const [discipline, setDiscipline] = useState(item?.discipline ?? '');
  const [summary,    setSummary]    = useState(item?.summary ?? '');
  const [tags,       setTags]       = useState(item?.tags ?? '');
  const [version,    setVersion]    = useState(item?.version ?? '1.0');
  const [status,     setStatus]     = useState(item?.status ?? 'active');
  const [visibility, setVisibility] = useState(item?.visibility ?? 'public');
  const [file,       setFile]       = useState<File | null>(null);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState('');

  const inp = 'w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-violet-400 transition-colors placeholder-slate-400';
  const sel = `${inp} appearance-none cursor-pointer`;

  async function handleSave() {
    if (!title.trim()) { setError('Title is required'); return; }
    setSaving(true); setError('');
    try {
      if (isNew) {
        // Create via multipart (supports file upload)
        const fd = new FormData();
        fd.append('title', title.trim());
        fd.append('type', type);
        if (category.trim())   fd.append('category', category.trim());
        if (discipline.trim()) fd.append('discipline', discipline.trim());
        if (summary.trim())    fd.append('summary', summary.trim());
        if (tags.trim())       fd.append('tags', tags.trim());
        fd.append('version', version.trim() || '1.0');
        fd.append('status', status);
        fd.append('visibility', visibility);
        if (file) fd.append('file', file);

        const r = await fetch('/api/owner-console/library/items', {
          method: 'POST', credentials: 'include', body: fd,
        });
        const d = await r.json() as { ok?: boolean; error?: string };
        if (!r.ok || d.error) throw new Error(d.error ?? 'Failed to create');
        toast.success('Library item created');
      } else {
        // Update metadata via PUT
        const r = await fetch(`/api/owner-console/library/items/${item.id}`, {
          method: 'PUT', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: title.trim(), type,
            category: category.trim() || null,
            discipline: discipline.trim() || null,
            summary: summary.trim() || null,
            tags: tags.trim() || null,
            version: version.trim() || '1.0',
            status, visibility,
          }),
        });
        const d = await r.json() as { ok?: boolean; error?: string };
        if (!r.ok || d.error) throw new Error(d.error ?? 'Failed to update');
        toast.success('Library item updated');
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-50 border border-violet-200 flex items-center justify-center">
              <BookOpen size={15} className="text-violet-600" />
            </div>
            <p className="text-sm font-bold text-slate-800">
              {isNew ? 'Add to Global Library' : 'Edit Library Item'}
            </p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-slate-500 hover:bg-slate-100">
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-6 flex flex-col gap-4">

          {/* Upload hint (create only) — shown first so it's obvious */}
          {isNew && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-700 flex items-start gap-2">
              <Info size={13} className="flex-shrink-0 mt-0.5 text-blue-500" />
              <span>
                <strong>To upload an existing SWMS, policy or form:</strong> fill in the title, select the type, then attach your DOCX or PDF below.
                The file content will be parsed and stored in the library so companies can browse and install it.
                The file upload is optional — you can also create a blank item and edit the content later.
              </span>
            </div>
          )}

          {/* File upload (create only) — moved to top so it's the first action */}
          {isNew && (
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Upload existing file <span className="font-normal text-slate-400">(DOCX or PDF — optional)</span>
              </label>
              <div
                className="border-2 border-dashed border-violet-200 rounded-xl p-5 text-center cursor-pointer hover:border-violet-400 hover:bg-violet-50/40 transition-colors"
                onClick={() => fileRef.current?.click()}
              >
                {file ? (
                  <div className="flex items-center justify-center gap-2 text-sm text-slate-700">
                    <FileText size={14} className="text-violet-600" />
                    <span className="font-medium">{file.name}</span>
                    <button onClick={(e) => { e.stopPropagation(); setFile(null); }} className="text-slate-400 hover:text-red-500">
                      <X size={13} />
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-slate-400">
                    <Upload size={22} className="text-violet-300" />
                    <span className="text-sm font-medium text-slate-500">Click to upload DOCX or PDF</span>
                    <span className="text-xs">Content will be extracted and stored in the library</span>
                  </div>
                )}
              </div>
              <input ref={fileRef} type="file" accept=".docx,.pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Title <span className="text-red-400">*</span></label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={inp} placeholder="e.g. Electrical Safety SWMS" />
          </div>

          {/* Type + Category */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Type</label>
              <div className="relative">
                <select value={type} onChange={(e) => setType(e.target.value)} className={sel}>
                  {ITEM_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <ChevronDown size={11} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Category</label>
              <div className="relative">
                <select value={category} onChange={(e) => setCategory(e.target.value)} className={sel}>
                  <option value="">Select…</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <ChevronDown size={11} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Discipline + Version */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Industry / Discipline</label>
              <div className="relative">
                <select value={discipline} onChange={(e) => setDiscipline(e.target.value)} className={sel}>
                  <option value="">Select…</option>
                  {DISCIPLINES.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
                <ChevronDown size={11} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Version</label>
              <input value={version} onChange={(e) => setVersion(e.target.value)} className={inp} placeholder="1.0" />
            </div>
          </div>

          {/* Status + Visibility */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Status</label>
              <div className="relative">
                <select value={status} onChange={(e) => setStatus(e.target.value)} className={sel}>
                  <option value="active">Active</option>
                  <option value="draft">Draft</option>
                  <option value="archived">Archived</option>
                </select>
                <ChevronDown size={11} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Visibility</label>
              <div className="relative">
                <select value={visibility} onChange={(e) => setVisibility(e.target.value)} className={sel}>
                  <option value="public">Public (visible to all companies)</option>
                  <option value="private">Private (hidden from companies)</option>
                </select>
                <ChevronDown size={11} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Tags <span className="font-normal text-slate-400">(comma-separated)</span></label>
            <input value={tags} onChange={(e) => setTags(e.target.value)} className={inp} placeholder="e.g. electrical, high-voltage, safety" />
          </div>

          {/* Summary */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Summary</label>
            <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} className={`${inp} resize-none`} placeholder="Brief description of what this document covers…" />
          </div>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
              <AlertCircle size={13} className="flex-shrink-0" />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2.5 px-6 py-4 border-t border-slate-100 flex-shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={!title.trim() || saving}
            className="flex-1 py-2.5 rounded-xl bg-violet-500 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {saving ? <><Loader2 size={13} className="animate-spin" />Saving…</> : isNew ? 'Add to Library' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Push-update confirm modal ─────────────────────────────────────────────────

function PushUpdateModal({ item, onClose }: { item: LibItem; onClose: () => void }) {
  const [force,   setForce]   = useState(false);
  const [pushing, setPushing] = useState(false);
  const [result,  setResult]  = useState<{ pushed: number; skipped: number; message: string } | null>(null);
  const [error,   setError]   = useState('');

  async function handlePush() {
    setPushing(true); setError('');
    try {
      const r = await fetch(`/api/owner-console/library/items/${item.id}/push-update`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      });
      const d = await r.json() as { ok?: boolean; pushed?: number; skipped?: number; message?: string; error?: string };
      if (!r.ok || d.error) throw new Error(d.error ?? 'Push failed');
      setResult({ pushed: d.pushed ?? 0, skipped: d.skipped ?? 0, message: d.message ?? '' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Push failed');
    } finally {
      setPushing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center">
              <Send size={14} className="text-blue-500" />
            </div>
            <p className="text-sm font-bold text-slate-800">Push update to companies</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-slate-500 hover:bg-slate-100">
            <X size={15} />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-4">
          {result ? (
            <div className="flex flex-col items-center gap-3 text-center py-2">
              <CheckCircle2 size={36} className="text-emerald-500" />
              <p className="text-sm font-bold text-slate-800">{result.message}</p>
              {result.skipped > 0 && (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  {result.skipped} customised {result.skipped === 1 ? 'copy was' : 'copies were'} skipped. Use "Force overwrite" to update those too.
                </p>
              )}
              <button onClick={onClose} className="mt-2 px-6 py-2.5 rounded-xl bg-violet-500 text-white text-sm font-semibold hover:bg-violet-700 transition-colors">
                Done
              </button>
            </div>
          ) : (
            <>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-600">
                <p className="font-semibold text-slate-700 mb-1">"{item.title}" — v{item.version}</p>
                <p>This will push the current global master content to all company copies that have this item installed.</p>
              </div>

              <div className="flex items-start gap-3 p-3.5 bg-amber-50 border border-amber-200 rounded-xl">
                <Info size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-amber-700">
                  <p className="font-semibold mb-0.5">By default, customised company copies are skipped.</p>
                  <p>Enable "Force overwrite" below to update all copies including those companies have edited.</p>
                </div>
              </div>

              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} className="w-4 h-4 rounded accent-violet-600" />
                <span className="text-sm text-slate-700 font-medium">Force overwrite — update customised company copies too</span>
              </label>

              {error && (
                <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
                  <AlertCircle size={13} className="flex-shrink-0" />
                  {error}
                </div>
              )}

              <div className="flex gap-2.5 pt-1">
                <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors">
                  Cancel
                </button>
                <button
                  onClick={() => void handlePush()}
                  disabled={pushing}
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  {pushing ? <><Loader2 size={13} className="animate-spin" />Pushing…</> : <><Send size={13} />Push update</>}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export default function LibraryManagerTab() {
  const [items,    setItems]    = useState<LibItem[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [total,    setTotal]    = useState(0);

  // Filters
  const [search,     setSearch]     = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Modals
  const [editItem,   setEditItem]   = useState<LibItem | null | 'new'>('new' as never);
  const [showEdit,   setShowEdit]   = useState(false);
  const [pushItem,   setPushItem]   = useState<LibItem | null>(null);

  // Action states
  const [toggling,  setToggling]  = useState<number | null>(null);
  const [deleting,  setDeleting]  = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (filterType)   params.set('type', filterType);
      if (filterStatus) params.set('status', filterStatus);
      if (search.trim()) params.set('search', search.trim());

      const r = await fetch(`/api/owner-console/library/items?${params}`, { credentials: 'include' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json() as { ok: boolean; items: LibItem[]; total: number };
      setItems(d.items ?? []);
      setTotal(d.total ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [filterType, filterStatus, search]);

  useEffect(() => { void load(); }, [load]);

  async function toggleVisibility(item: LibItem) {
    setToggling(item.id);
    const newVis = item.visibility === 'public' ? 'private' : 'public';
    try {
      const r = await fetch(`/api/owner-console/library/items/${item.id}`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility: newVis }),
      });
      if (!r.ok) throw new Error('Failed');
      toast.success(newVis === 'public' ? 'Item published — visible to all companies' : 'Item unpublished — hidden from companies');
      void load();
    } catch {
      toast.error('Failed to update visibility');
    } finally {
      setToggling(null);
    }
  }

  async function toggleArchive(item: LibItem) {
    setToggling(item.id);
    const newStatus = item.status === 'archived' ? 'active' : 'archived';
    try {
      const r = await fetch(`/api/owner-console/library/items/${item.id}`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!r.ok) throw new Error('Failed');
      toast.success(newStatus === 'archived' ? 'Item archived' : 'Item restored');
      void load();
    } catch {
      toast.error('Failed to update status');
    } finally {
      setToggling(null);
    }
  }

  async function handleDelete(item: LibItem) {
    if (!confirm(`Permanently delete "${item.title}"? This cannot be undone.`)) return;
    setDeleting(item.id);
    try {
      const r = await fetch(`/api/owner-console/library/items/${item.id}`, {
        method: 'DELETE', credentials: 'include',
      });
      if (!r.ok) throw new Error('Failed');
      toast.success('Library item deleted');
      void load();
    } catch {
      toast.error('Failed to delete item');
    } finally {
      setDeleting(null);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <BookOpen size={16} className="text-violet-600" />
            Global Library
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {total} item{total !== 1 ? 's' : ''} — only you can publish here; companies can browse and install copies
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => void load()} className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors" title="Refresh">
            <RefreshCw size={14} />
          </button>
          <button
            onClick={() => { setEditItem(null); setShowEdit(true); }}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-violet-500 text-white text-sm font-semibold hover:bg-violet-700 transition-colors"
          >
            <Plus size={14} />
            Add item
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, summary, tags…"
            className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-violet-400 bg-white"
          />
        </div>
        <div className="relative">
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="pl-3 pr-7 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-300 appearance-none cursor-pointer">
            <option value="">All types</option>
            {ITEM_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
        <div className="relative">
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="pl-3 pr-7 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-300 appearance-none cursor-pointer">
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </select>
          <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 size={22} className="animate-spin mr-2" />
          <span className="text-sm">Loading library…</span>
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
          <AlertCircle size={14} className="flex-shrink-0" />
          {error}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
            <BookOpen size={24} className="text-slate-400" />
          </div>
          <p className="text-sm font-semibold text-slate-600 mb-1">No library items yet</p>
          <p className="text-xs text-slate-400 max-w-xs">
            Add items directly here, or publish documents from Studio using the "Share to Global Library" action.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => {
            const TypeIcon = TYPE_ICONS[item.type] ?? FileText;
            const typeColor = TYPE_COLORS[item.type] ?? 'bg-slate-100 text-slate-700';
            const statusColor = STATUS_COLORS[item.status] ?? 'bg-slate-100 text-slate-500';
            const isPublic = item.visibility === 'public';
            const isArchived = item.status === 'archived';
            const busy = toggling === item.id || deleting === item.id;

            return (
              <div key={item.id} className={`bg-white border rounded-xl p-4 transition-colors ${isArchived ? 'border-slate-200 opacity-60' : 'border-slate-200 hover:border-slate-300'}`}>
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${typeColor}`}>
                    <TypeIcon size={15} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{item.title}</p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${typeColor}`}>
                            {typeLabel(item.type)}
                          </span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${statusColor}`}>
                            {item.status}
                          </span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${isPublic ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                            {isPublic ? <><Globe size={10} />Public</> : <><EyeOff size={10} />Private</>}
                          </span>
                          <span className="text-xs text-slate-400">v{item.version}</span>
                          {item.category && (
                            <span className="text-xs text-slate-400">{item.category}</span>
                          )}
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="flex items-center gap-3 text-xs text-slate-400 flex-shrink-0">
                        <span className="flex items-center gap-1">
                          <Building2 size={11} />
                          {item.install_count} installed
                        </span>
                        {item.download_count > 0 && (
                          <span className="flex items-center gap-1">
                            <Download size={11} />
                            {item.download_count}
                          </span>
                        )}
                      </div>
                    </div>

                    {item.summary && (
                      <p className="text-xs text-slate-500 mt-1.5 line-clamp-2">{item.summary}</p>
                    )}

                    {item.tags && (
                      <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                        <Tag size={10} className="text-slate-400" />
                        {item.tags.split(',').map((t) => t.trim()).filter(Boolean).map((t) => (
                          <span key={t} className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{t}</span>
                        ))}
                      </div>
                    )}

                    <p className="text-xs text-slate-400 mt-1.5">Updated {fmtDate(item.updated_at)}</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-slate-100 flex-wrap">
                  {/* Edit metadata */}
                  <button
                    onClick={() => { setEditItem(item); setShowEdit(true); }}
                    disabled={busy}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-40"
                  >
                    <Pencil size={11} />
                    Edit
                  </button>

                  {/* Publish / Unpublish */}
                  <button
                    onClick={() => void toggleVisibility(item)}
                    disabled={busy}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold border rounded-lg transition-colors disabled:opacity-40 ${
                      isPublic
                        ? 'text-slate-600 border-slate-200 hover:bg-slate-50'
                        : 'text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100'
                    }`}
                  >
                    {toggling === item.id ? <Loader2 size={11} className="animate-spin" /> : isPublic ? <EyeOff size={11} /> : <Globe size={11} />}
                    {isPublic ? 'Unpublish' : 'Publish'}
                  </button>

                  {/* Archive / Restore */}
                  <button
                    onClick={() => void toggleArchive(item)}
                    disabled={busy}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-40"
                  >
                    {isArchived ? <RotateCcw size={11} /> : <Archive size={11} />}
                    {isArchived ? 'Restore' : 'Archive'}
                  </button>

                  {/* Push update */}
                  {item.install_count > 0 && (
                    <button
                      onClick={() => setPushItem(item)}
                      disabled={busy}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-blue-700 border border-blue-200 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-40"
                    >
                      <Send size={11} />
                      Push update
                    </button>
                  )}

                  {/* Delete */}
                  <button
                    onClick={() => void handleDelete(item)}
                    disabled={busy}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-40 ml-auto"
                  >
                    {deleting === item.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit / Create modal */}
      {showEdit && (
        <EditModal
          item={editItem === 'new' ? null : editItem as LibItem | null}
          onClose={() => setShowEdit(false)}
          onSaved={load}
        />
      )}

      {/* Push update modal */}
      {pushItem && (
        <PushUpdateModal
          item={pushItem}
          onClose={() => { setPushItem(null); void load(); }}
        />
      )}
    </div>
  );
}
