/**
 * LibraryManagerTab — Owner Console
 *
 * Full CRUD for the global library. Platform owner can:
 *  • Browse all library items (all statuses, all visibilities)
 *  • Upload a DOCX or PDF to auto-populate builder_json
 *  • Fill in metadata (title, type, category, discipline, summary, tags, version, status)
 *  • Edit metadata on existing items
 *  • Archive or permanently delete items
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  BookOpen, Plus, Search, Loader2, AlertCircle, CheckCircle2,
  Pencil, Trash2, FileText, File, Upload, X, ChevronDown,
  Shield, ClipboardList, Wrench, Calculator, Package, RefreshCw,
  Eye, EyeOff, Archive, Download,
} from 'lucide-react';

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
  status: string;
  visibility: string;
  install_count: number;
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
  { value: 'recipe',          label: 'Recipe' },
  { value: 'estimate_recipe', label: 'Estimate Recipe' },
  { value: 'scope_line',      label: 'Scope Line' },
];

const TYPE_ICONS: Record<string, React.ElementType> = {
  policy:          Shield,
  procedure:       FileText,
  swms:            AlertCircle,
  form:            ClipboardList,
  recipe:          Wrench,
  estimate_recipe: Calculator,
  scope_line:      Package,
};

const TYPE_COLORS: Record<string, string> = {
  policy:          'bg-blue-100 text-blue-700',
  procedure:       'bg-purple-100 text-purple-700',
  swms:            'bg-red-100 text-red-700',
  form:            'bg-green-100 text-green-700',
  recipe:          'bg-amber-100 text-amber-700',
  estimate_recipe: 'bg-orange-100 text-orange-700',
  scope_line:      'bg-slate-100 text-slate-700',
};

const STATUS_COLORS: Record<string, string> = {
  active:   'bg-emerald-100 text-emerald-700',
  draft:    'bg-amber-100 text-amber-700',
  archived: 'bg-slate-100 text-slate-500',
};

// ── Empty form ────────────────────────────────────────────────────────────────

function emptyForm() {
  return {
    title: '',
    type: 'procedure',
    category: '',
    discipline: '',
    summary: '',
    tags: '',
    version: '1.0',
    status: 'active',
    visibility: 'public',
  };
}

// ── Upload Form Modal ─────────────────────────────────────────────────────────

interface UploadModalProps {
  editItem?: LibItem | null;
  onClose: () => void;
  onSaved: () => void;
}

function UploadModal({ editItem, onClose, onSaved }: UploadModalProps) {
  const [form, setForm] = useState(editItem ? {
    title:      editItem.title,
    type:       editItem.type,
    category:   editItem.category ?? '',
    discipline: editItem.discipline ?? '',
    summary:    editItem.summary ?? '',
    tags:       editItem.tags ?? '',
    version:    editItem.version,
    status:     editItem.status,
    visibility: editItem.visibility,
  } : emptyForm());

  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isEdit = !!editItem;

  const handleFile = (f: File) => {
    const name = f.name.toLowerCase();
    if (!name.endsWith('.docx') && !name.endsWith('.pdf')) {
      setError('Only .docx and .pdf files are supported.');
      return;
    }
    setFile(f);
    setError(null);
    // Auto-fill title from filename if blank
    if (!form.title) {
      const stem = f.name.replace(/\.(docx|pdf)$/i, '').replace(/[-_]/g, ' ');
      setForm(prev => ({ ...prev, title: stem }));
    }
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) { setError('Title is required.'); return; }
    setSaving(true);
    setError(null);

    try {
      if (isEdit) {
        // PATCH — metadata only (no file re-upload on edit for now)
        const res = await fetch(`/api/owner-console/library/items/${editItem!.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(form),
        });
        const data = await res.json() as { ok?: boolean; error?: string };
        if (!res.ok) throw new Error(data.error ?? 'Update failed');
      } else {
        // POST — multipart with optional file
        const fd = new FormData();
        Object.entries(form).forEach(([k, v]) => fd.append(k, v));
        if (file) fd.append('file', file);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 90_000);
        let res: Response;
        try {
          res = await fetch('/api/owner-console/library/items', {
            method: 'POST',
            credentials: 'include',
            body: fd,
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeout);
        }
        const data = await res.json() as { ok?: boolean; id?: number; error?: string };
        if (!res.ok) throw new Error(data.error ?? 'Create failed');
      }
      onSaved();
      onClose();
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setError('Upload timed out — file may be too large.');
      } else {
        setError(err instanceof Error ? err.message : 'Something went wrong.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center">
              <BookOpen size={14} className="text-primary" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">{isEdit ? 'Edit Library Item' : 'Add to Global Library'}</p>
              <p className="text-xs text-slate-400">{isEdit ? 'Update metadata' : 'Upload a document or fill in details manually'}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-500 transition-colors p-1">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          {/* File upload — new items only */}
          {!isEdit && (
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Source File <span className="font-normal text-slate-400 normal-case">(optional — .docx or .pdf)</span>
              </label>
              <div
                onClick={() => inputRef.current?.click()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                onDragOver={(e) => e.preventDefault()}
                className="border-2 border-dashed border-slate-200 rounded-xl p-5 flex items-center gap-4 cursor-pointer hover:border-primary hover:bg-orange-50/30 transition-colors"
              >
                {file ? (
                  <>
                    <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center shrink-0">
                      {file.name.endsWith('.pdf') ? <File size={18} className="text-red-500" /> : <FileText size={18} className="text-primary" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-700 truncate">{file.name}</p>
                      <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(0)} KB — will be parsed into builder blocks</p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setFile(null); }}
                      className="text-slate-300 hover:text-slate-500 transition-colors shrink-0"
                    >
                      <X size={14} />
                    </button>
                  </>
                ) : (
                  <>
                    <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                      <Upload size={18} className="text-slate-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-600">Drop a .docx or .pdf here</p>
                      <p className="text-xs text-slate-400">or click to browse — content will be parsed into editable blocks</p>
                    </div>
                  </>
                )}
                <input ref={inputRef} type="file" accept=".docx,.pdf" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              </div>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Title *</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Bricklaying Safety Procedure"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60 transition-colors"
            />
          </div>

          {/* Type + Version row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Type *</label>
              <select
                value={form.type}
                onChange={(e) => setForm(f => ({ ...f, type: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60 transition-colors"
              >
                {ITEM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Version</label>
              <input
                type="text"
                value={form.version}
                onChange={(e) => setForm(f => ({ ...f, version: e.target.value }))}
                placeholder="1.0"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60 transition-colors"
              />
            </div>
          </div>

          {/* Category + Discipline */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Category</label>
              <input
                type="text"
                value={form.category}
                onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}
                placeholder="e.g. Safety, HR, Operations"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Discipline</label>
              <input
                type="text"
                value={form.discipline}
                onChange={(e) => setForm(f => ({ ...f, discipline: e.target.value }))}
                placeholder="e.g. Bricklaying, Electrical"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60 transition-colors"
              />
            </div>
          </div>

          {/* Summary */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Summary</label>
            <textarea
              value={form.summary}
              onChange={(e) => setForm(f => ({ ...f, summary: e.target.value }))}
              rows={2}
              placeholder="Brief description shown in the library browse view"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60 transition-colors resize-none"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Tags <span className="font-normal text-slate-400 normal-case">(comma-separated)</span></label>
            <input
              type="text"
              value={form.tags}
              onChange={(e) => setForm(f => ({ ...f, tags: e.target.value }))}
              placeholder="safety, bricklaying, WHS, procedure"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60 transition-colors"
            />
          </div>

          {/* Status + Visibility */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm(f => ({ ...f, status: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60 transition-colors"
              >
                <option value="active">Active — visible to all users</option>
                <option value="draft">Draft — hidden from users</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Visibility</label>
              <select
                value={form.visibility}
                onChange={(e) => setForm(f => ({ ...f, visibility: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60 transition-colors"
              >
                <option value="public">Public</option>
                <option value="private">Private</option>
              </select>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600">
              <AlertCircle size={13} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 py-4 border-t border-slate-100 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-orange-600 disabled:opacity-60 transition-colors"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            {saving ? (isEdit ? 'Saving…' : 'Uploading…') : (isEdit ? 'Save Changes' : 'Add to Library')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Delete Confirm Modal ──────────────────────────────────────────────────────

function DeleteModal({ item, onClose, onDeleted }: { item: LibItem; onClose: () => void; onDeleted: () => void }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/owner-console/library/items/${item.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? 'Delete failed');
      }
      onDeleted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm border border-slate-200">
        <div className="px-5 py-5 flex flex-col items-center text-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center">
            <Trash2 size={20} className="text-red-500" />
          </div>
          <div>
            <p className="font-bold text-slate-900">Delete Library Item?</p>
            <p className="text-sm text-slate-500 mt-1">
              <strong className="text-slate-700">"{item.title}"</strong> will be permanently removed from the global library. Companies that already installed it keep their copy.
            </p>
          </div>
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 w-full">{error}</p>}
        </div>
        <div className="flex gap-3 px-5 pb-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button
            onClick={() => void handleDelete()}
            disabled={deleting}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-bold disabled:opacity-60 transition-colors"
          >
            {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Tab ──────────────────────────────────────────────────────────────────

export default function LibraryManagerTab() {
  const [items, setItems] = useState<LibItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [editItem, setEditItem] = useState<LibItem | null>(null);
  const [deleteItem, setDeleteItem] = useState<LibItem | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Run migration to ensure file_path/file_mime columns exist
      await fetch('/api/migrate-library-downloads', { method: 'POST', credentials: 'include' }).catch(() => {});
      // Fetch all items including drafts/archived — owner view
      const params = new URLSearchParams({ limit: '200', status: 'all' });
      const res = await fetch(`/api/library/items?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json() as { items: LibItem[] };
      setItems(data.items ?? []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = items.filter(item => {
    if (filterType && item.type !== filterType) return false;
    if (filterStatus && item.status !== filterStatus) return false;
    if (search.trim().length >= 2) {
      const q = search.toLowerCase();
      return (
        item.title.toLowerCase().includes(q) ||
        (item.summary ?? '').toLowerCase().includes(q) ||
        (item.tags ?? '').toLowerCase().includes(q) ||
        (item.category ?? '').toLowerCase().includes(q) ||
        (item.discipline ?? '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleArchive = async (item: LibItem) => {
    const newStatus = item.status === 'archived' ? 'active' : 'archived';
    try {
      await fetch(`/api/owner-console/library/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus }),
      });
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: newStatus } : i));
      showToast(newStatus === 'archived' ? 'Item archived.' : 'Item restored to active.');
    } catch {
      showToast('Failed to update status.');
    }
  };

  return (
    <div className="flex flex-col gap-5 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading font-black text-lg text-slate-900">Global Library</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {items.length} item{items.length !== 1 ? 's' : ''} — visible to all companies in the Library tab
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void load()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-600 transition-colors"
          >
            <RefreshCw size={13} />
            Refresh
          </button>
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold hover:bg-orange-600 transition-colors"
          >
            <Plus size={14} />
            Add Item
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, tags, category…"
            className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60 transition-colors"
          />
        </div>
        <div className="relative">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="appearance-none pl-3 pr-7 py-2 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60 transition-colors bg-white"
          >
            <option value="">All types</option>
            {ITEM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
        <div className="relative">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="appearance-none pl-3 pr-7 py-2 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60 transition-colors bg-white"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </select>
          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={22} className="animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
              <BookOpen size={20} className="text-slate-400" />
            </div>
            <p className="text-sm font-semibold text-slate-500">
              {items.length === 0 ? 'No library items yet — add your first one above.' : 'No items match your filters.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {/* Column headers */}
            <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-4 py-2.5 bg-slate-50 border-b border-slate-200">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Title</span>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider w-20 text-center">Type</span>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider w-16 text-center">Status</span>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider w-16 text-center">Installs</span>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider w-28 text-right">Actions</span>
            </div>

            {filtered.map((item) => {
              const TypeIcon = TYPE_ICONS[item.type] ?? FileText;
              return (
                <div
                  key={item.id}
                  className={`grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 items-center px-4 py-3 hover:bg-slate-50 transition-colors ${item.status === 'archived' ? 'opacity-60' : ''}`}                >
                  {/* Title + meta */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${TYPE_COLORS[item.type] ?? 'bg-slate-100 text-slate-500'}`}>
                        <TypeIcon size={11} />
                      </div>
                      <p className="text-sm font-semibold text-slate-800 truncate">{item.title}</p>
                      {item.visibility === 'private' && (
                        <EyeOff size={11} className="text-slate-400 shrink-0" title="Private" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 ml-8">
                      {item.category && <span className="text-[11px] text-slate-400">{item.category}</span>}
                      {item.discipline && <span className="text-[11px] text-slate-400">· {item.discipline}</span>}
                      {item.source_file_name && (
                        <span className="text-[11px] text-slate-400 flex items-center gap-0.5">
                          · <FileText size={10} className="inline" /> {item.source_file_name}
                        </span>
                      )}
                      <span className="text-[11px] text-slate-300">v{item.version}</span>
                    </div>
                  </div>

                  {/* Type badge */}
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full w-20 text-center ${TYPE_COLORS[item.type] ?? 'bg-slate-100 text-slate-600'}`}>
                    {ITEM_TYPES.find(t => t.value === item.type)?.label ?? item.type}
                  </span>

                  {/* Status badge */}
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full w-16 text-center ${STATUS_COLORS[item.status] ?? 'bg-slate-100 text-slate-600'}`}>
                    {item.status}
                  </span>

                  {/* Install count */}
                  <span className="text-sm font-bold text-slate-600 w-16 text-center">{item.install_count}</span>

                  {/* Actions */}
                  <div className="flex items-center gap-1 w-28 justify-end">
                    <button
                      onClick={() => setEditItem(item)}
                      title="Edit metadata"
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-primary hover:bg-orange-50 transition-colors"
                    >
                      <Pencil size={13} />
                    </button>
                    {item.file_path && (
                      <a
                        href={`/api/library/items/${item.id}/download`}
                        download
                        title={`Download ${item.source_file_name ?? 'file'}`}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                      >
                        <Download size={13} />
                      </a>
                    )}
                    <button
                      onClick={() => void handleArchive(item)}
                      title={item.status === 'archived' ? 'Restore' : 'Archive'}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                    >
                      {item.status === 'archived' ? <Eye size={13} /> : <Archive size={13} />}
                    </button>
                    <button
                      onClick={() => setDeleteItem(item)}
                      title="Delete permanently"
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modals */}
      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onSaved={() => { void load(); showToast('Item added to global library.'); }}
        />
      )}
      {editItem && (
        <UploadModal
          editItem={editItem}
          onClose={() => setEditItem(null)}
          onSaved={() => { void load(); showToast('Item updated.'); setEditItem(null); }}
        />
      )}
      {deleteItem && (
        <DeleteModal
          item={deleteItem}
          onClose={() => setDeleteItem(null)}
          onDeleted={() => { setItems(prev => prev.filter(i => i.id !== deleteItem.id)); showToast('Item deleted.'); setDeleteItem(null); }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 bg-slate-900 text-white text-sm font-semibold rounded-xl shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
          {toast}
        </div>
      )}
    </div>
  );
}
