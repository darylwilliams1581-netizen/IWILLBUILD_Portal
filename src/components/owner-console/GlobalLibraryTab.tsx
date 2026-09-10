/**
 * GlobalLibraryTab — Developer Console → Global Library
 * ─────────────────────────────────────────────────────────────────────────────
 * Three sub-views:
 *   1. Form Sources     — all form_templates owned by the developer company
 *   2. SWMS Sources     — all swms_templates owned by the developer company
 *   3. Published Library — the existing LibraryManagerTab (full governance)
 *
 * Form Sources and SWMS Sources show:
 *   - Template name / title
 *   - Category
 *   - Active / Archived status
 *   - Published / Not Published / Archived-in-library state
 *   - Install count (when published)
 *   - Edit (navigates to existing builder)
 *   - Publish / Update Global Copy (single or multi-select)
 *   - Archive / Restore
 *   - Delete (with confirmation dialog)
 *   - Multi-select + "Publish selected" bulk action
 *
 * Publishing uses the existing stable endpoints:
 *   POST /api/form-templates/:id/publish-to-library
 *   POST /api/safety/swms/:id/publish-to-library
 * which create/update library_items with source_ref = 'form:{id}' / 'swms:{id}'
 * and preserve install_count on re-publish.
 *
 * Archiving/deleting a source does NOT touch library_items or installed copies.
 * Deleting a library item does NOT delete the source template.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import {
  ClipboardList, ShieldCheck, BookOpen, RefreshCw, Loader2,
  CheckCircle2, XCircle, AlertTriangle, Pencil, Trash2,
  Globe, Archive, RotateCcw, Search, ChevronDown, X,
  Building2, Info, Send,
} from 'lucide-react';
import { toast } from 'sonner';
import LibraryManagerTab from './LibraryManagerTab';

// ── Types ─────────────────────────────────────────────────────────────────────

interface FormSource {
  id: number;
  name: string;
  category: string | null;
  formType: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  libraryItemId: number | null;
  libraryStatus: 'not_published' | 'published' | 'archived';
  libraryVisibility: string | null;
  installCount: number;
}

interface SwmsSource {
  id: number;
  title: string;
  category: string | null;
  status: string;
  buildMode: string | null;
  documentType: string | null;
  revisionNumber: string | null;
  createdAt: string;
  updatedAt: string;
  libraryItemId: number | null;
  libraryStatus: 'not_published' | 'published' | 'archived';
  libraryVisibility: string | null;
  installCount: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active:   'bg-emerald-100 text-emerald-700',
    draft:    'bg-amber-100 text-amber-700',
    archived: 'bg-slate-100 text-slate-500',
  };
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${map[status] ?? 'bg-slate-100 text-slate-500'}`}>
      {status}
    </span>
  );
}

function LibraryBadge({ state, visibility, installCount }: {
  state: 'not_published' | 'published' | 'archived';
  visibility: string | null;
  installCount: number;
}) {
  if (state === 'not_published') {
    return (
      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-400">
        Not published
      </span>
    );
  }
  if (state === 'archived') {
    return (
      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-600">
        Library archived
      </span>
    );
  }
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${visibility === 'public' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
      <Globe size={9} />
      {visibility === 'public' ? 'Published' : 'Private'}
      {installCount > 0 && <span className="ml-0.5 opacity-70">· {installCount} installed</span>}
    </span>
  );
}

// ── Delete confirmation dialog ─────────────────────────────────────────────────

function DeleteConfirmDialog({
  title,
  hasLibraryEntry,
  onConfirm,
  onCancel,
  deleting,
}: {
  title: string;
  hasLibraryEntry: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-50 border border-red-200 flex items-center justify-center">
              <Trash2 size={14} className="text-red-500" />
            </div>
            <p className="text-sm font-bold text-slate-800">Delete source template?</p>
          </div>
          <button onClick={onCancel} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-slate-500 hover:bg-slate-100">
            <X size={14} />
          </button>
        </div>
        <div className="p-5 flex flex-col gap-3">
          <p className="text-sm text-slate-700">
            Permanently delete <strong>"{title}"</strong> from the source library?
          </p>
          {hasLibraryEntry && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
              <Info size={13} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">
                This template has a Global Library entry. Deleting the source will <strong>not</strong> remove the library item or any company copies — those are preserved.
              </p>
            </div>
          )}
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
            <AlertTriangle size={13} className="text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-700">
              This cannot be undone. The source template will be permanently removed.
            </p>
          </div>
        </div>
        <div className="flex gap-2.5 px-5 pb-5">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-bold transition-colors flex items-center justify-center gap-2"
          >
            {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            Delete permanently
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Form Sources sub-tab ──────────────────────────────────────────────────────

function FormSourcesTab() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<FormSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterLibrary, setFilterLibrary] = useState('');

  // Multi-select
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Action states
  const [publishingIds, setPublishingIds] = useState<Set<number>>(new Set());
  const [archivingId, setArchivingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FormSource | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [bulkPublishing, setBulkPublishing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/owner-console/sources/forms', { credentials: 'include' });
      const d = await r.json() as { ok?: boolean; templates?: FormSource[]; error?: string };
      if (!r.ok || !d.ok) throw new Error(d.error ?? 'Failed to load');
      setTemplates(d.templates ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load form sources');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Filtered list
  const filtered = templates.filter(t => {
    if (search && !t.name.toLowerCase().includes(search.toLowerCase()) && !(t.category ?? '').toLowerCase().includes(search.toLowerCase())) return false;
    if (filterStatus && t.status !== filterStatus) return false;
    if (filterLibrary && t.libraryStatus !== filterLibrary) return false;
    return true;
  });

  function toggleSelect(id: number) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(t => t.id)));
    }
  }

  async function publishOne(id: number) {
    setPublishingIds(prev => new Set([...prev, id]));
    try {
      const r = await fetch(`/api/form-templates/${id}/publish-to-library`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      const d = await r.json() as { ok?: boolean; error?: string; updated?: boolean };
      if (!r.ok || d.error) throw new Error(d.error ?? `HTTP ${r.status}`);
      toast.success(d.updated ? 'Global Library entry updated' : 'Published to Global Library');
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Publish failed');
    } finally {
      setPublishingIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    }
  }

  async function publishSelected() {
    if (selected.size === 0) return;
    setBulkPublishing(true);
    let ok = 0; let failed = 0;
    for (const id of selected) {
      try {
        const r = await fetch(`/api/form-templates/${id}/publish-to-library`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({}),
        });
        const d = await r.json() as { ok?: boolean; error?: string };
        if (!r.ok || d.error) { failed++; } else { ok++; }
      } catch { failed++; }
    }
    toast.success(`Published ${ok} form${ok !== 1 ? 's' : ''}${failed > 0 ? ` (${failed} failed)` : ''}`);
    setSelected(new Set());
    setBulkPublishing(false);
    void load();
  }

  async function archiveToggle(t: FormSource) {
    setArchivingId(t.id);
    const newStatus = t.status === 'archived' ? 'active' : 'archived';
    try {
      const r = await fetch(`/api/owner-console/sources/forms/${t.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus }),
      });
      if (!r.ok) throw new Error('Failed');
      toast.success(newStatus === 'archived' ? `"${t.name}" archived` : `"${t.name}" restored`);
      void load();
    } catch {
      toast.error('Failed to update status');
    } finally {
      setArchivingId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const r = await fetch(`/api/owner-console/sources/forms/${deleteTarget.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const d = await r.json() as { ok?: boolean; error?: string };
      if (!r.ok || d.error) throw new Error(d.error ?? 'Delete failed');
      toast.success(`"${deleteTarget.name}" deleted`);
      setDeleteTarget(null);
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 size={22} className="animate-spin text-primary" />
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name or category…"
            className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white"
          />
        </div>
        <div className="relative">
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="pl-3 pr-7 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none appearance-none cursor-pointer">
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
          <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
        <div className="relative">
          <select value={filterLibrary} onChange={e => setFilterLibrary(e.target.value)} className="pl-3 pr-7 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none appearance-none cursor-pointer">
            <option value="">All library states</option>
            <option value="not_published">Not published</option>
            <option value="published">Published</option>
            <option value="archived">Library archived</option>
          </select>
          <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
        <button onClick={() => void load()} className="p-2 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50" title="Refresh">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 bg-violet-50 border border-violet-200 rounded-xl px-4 py-2.5">
          <span className="text-sm font-semibold text-violet-700">{selected.size} selected</span>
          <button
            onClick={() => void publishSelected()}
            disabled={bulkPublishing}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors"
          >
            {bulkPublishing ? <Loader2 size={12} className="animate-spin" /> : <Globe size={12} />}
            {bulkPublishing ? 'Publishing…' : `Publish ${selected.size} to library`}
          </button>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-violet-500 hover:text-violet-700 font-semibold">
            Clear selection
          </button>
        </div>
      )}

      {/* Count */}
      <p className="text-xs text-slate-400">{filtered.length} of {templates.length} form template{templates.length !== 1 ? 's' : ''}</p>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ClipboardList size={28} className="text-slate-300 mb-3" />
          <p className="text-sm font-semibold text-slate-500">No form templates found</p>
          <p className="text-xs text-slate-400 mt-1">Try adjusting your filters.</p>
        </div>
      ) : (
        <div className="border border-slate-200 rounded-2xl overflow-hidden">
          {/* Header row */}
          <div className="bg-slate-50 border-b border-slate-200 px-4 py-2.5 grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-3 items-center text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            <input
              type="checkbox"
              checked={selected.size === filtered.length && filtered.length > 0}
              onChange={toggleSelectAll}
              className="w-4 h-4 rounded accent-violet-600"
            />
            <span>Name / Category</span>
            <span>Status</span>
            <span>Library</span>
            <span className="hidden sm:block">Installs</span>
            <span>Actions</span>
          </div>
          <div className="divide-y divide-slate-100">
            {filtered.map(t => {
              const busy = publishingIds.has(t.id) || archivingId === t.id;
              return (
                <div key={t.id} className={`px-4 py-3 grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-3 items-center ${selected.has(t.id) ? 'bg-violet-50/40' : ''}`}>
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={selected.has(t.id)}
                    onChange={() => toggleSelect(t.id)}
                    className="w-4 h-4 rounded accent-violet-600"
                  />

                  {/* Name + category */}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{t.name}</p>
                    {t.category && <p className="text-xs text-slate-400 truncate">{t.category}</p>}
                    {t.formType && <p className="text-[11px] text-slate-300">{t.formType}</p>}
                  </div>

                  {/* Source status */}
                  <StatusBadge status={t.status} />

                  {/* Library state */}
                  <LibraryBadge state={t.libraryStatus} visibility={t.libraryVisibility} installCount={t.installCount} />

                  {/* Install count */}
                  <span className="hidden sm:flex items-center gap-1 text-xs text-slate-400">
                    <Building2 size={11} />
                    {t.installCount}
                  </span>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {/* Edit — opens existing form builder */}
                    <button
                      onClick={() => navigate(`/forms?edit=${t.id}`)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                      title="Edit in form builder"
                    >
                      <Pencil size={13} />
                    </button>

                    {/* Publish / Update */}
                    <button
                      onClick={() => void publishOne(t.id)}
                      disabled={busy}
                      className={`flex items-center gap-1 px-2 py-1.5 text-[11px] font-bold rounded-lg transition-colors disabled:opacity-40 ${
                        t.libraryStatus === 'not_published'
                          ? 'bg-blue-600 hover:bg-blue-700 text-white'
                          : 'border border-blue-200 text-blue-700 hover:bg-blue-50'
                      }`}
                      title={t.libraryStatus === 'not_published' ? 'Publish to Global Library' : 'Update Global Library copy'}
                    >
                      {publishingIds.has(t.id) ? <Loader2 size={11} className="animate-spin" /> : <Globe size={11} />}
                      {t.libraryStatus === 'not_published' ? 'Publish' : 'Update'}
                    </button>

                    {/* Archive / Restore */}
                    <button
                      onClick={() => void archiveToggle(t)}
                      disabled={busy}
                      className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors disabled:opacity-40"
                      title={t.status === 'archived' ? 'Restore' : 'Archive source'}
                    >
                      {archivingId === t.id ? <Loader2 size={13} className="animate-spin" /> : t.status === 'archived' ? <RotateCcw size={13} /> : <Archive size={13} />}
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() => setDeleteTarget(t)}
                      disabled={busy}
                      className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                      title="Delete source template"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Delete confirm dialog */}
      {deleteTarget && (
        <DeleteConfirmDialog
          title={deleteTarget.name}
          hasLibraryEntry={deleteTarget.libraryItemId !== null}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setDeleteTarget(null)}
          deleting={deleting}
        />
      )}
    </div>
  );
}

// ── SWMS Sources sub-tab ──────────────────────────────────────────────────────

function SwmsSourcesTab() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<SwmsSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterLibrary, setFilterLibrary] = useState('');

  // Multi-select
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Action states
  const [publishingIds, setPublishingIds] = useState<Set<number>>(new Set());
  const [archivingId, setArchivingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SwmsSource | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [bulkPublishing, setBulkPublishing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/owner-console/sources/swms', { credentials: 'include' });
      const d = await r.json() as { ok?: boolean; templates?: SwmsSource[]; error?: string };
      if (!r.ok || !d.ok) throw new Error(d.error ?? 'Failed to load');
      setTemplates(d.templates ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load SWMS sources');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = templates.filter(t => {
    if (search && !t.title.toLowerCase().includes(search.toLowerCase()) && !(t.category ?? '').toLowerCase().includes(search.toLowerCase())) return false;
    if (filterStatus && t.status !== filterStatus) return false;
    if (filterLibrary && t.libraryStatus !== filterLibrary) return false;
    return true;
  });

  function toggleSelect(id: number) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(t => t.id)));
    }
  }

  async function publishOne(id: number) {
    setPublishingIds(prev => new Set([...prev, id]));
    try {
      const r = await fetch(`/api/safety/swms/${id}/publish-to-library`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      const d = await r.json() as { ok?: boolean; error?: string; updated?: boolean };
      if (!r.ok || d.error) throw new Error(d.error ?? `HTTP ${r.status}`);
      toast.success(d.updated ? 'Global Library entry updated' : 'Published to Global Library');
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Publish failed');
    } finally {
      setPublishingIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    }
  }

  async function publishSelected() {
    if (selected.size === 0) return;
    setBulkPublishing(true);
    let ok = 0; let failed = 0;
    for (const id of selected) {
      try {
        const r = await fetch(`/api/safety/swms/${id}/publish-to-library`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({}),
        });
        const d = await r.json() as { ok?: boolean; error?: string };
        if (!r.ok || d.error) { failed++; } else { ok++; }
      } catch { failed++; }
    }
    toast.success(`Published ${ok} SWMS${failed > 0 ? ` (${failed} failed)` : ''}`);
    setSelected(new Set());
    setBulkPublishing(false);
    void load();
  }

  async function archiveToggle(t: SwmsSource) {
    setArchivingId(t.id);
    const newStatus = t.status === 'archived' ? 'active' : 'archived';
    try {
      const r = await fetch(`/api/owner-console/sources/swms/${t.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus }),
      });
      if (!r.ok) throw new Error('Failed');
      toast.success(newStatus === 'archived' ? `"${t.title}" archived` : `"${t.title}" restored`);
      void load();
    } catch {
      toast.error('Failed to update status');
    } finally {
      setArchivingId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const r = await fetch(`/api/owner-console/sources/swms/${deleteTarget.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const d = await r.json() as { ok?: boolean; error?: string };
      if (!r.ok || d.error) throw new Error(d.error ?? 'Delete failed');
      toast.success(`"${deleteTarget.title}" deleted`);
      setDeleteTarget(null);
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 size={22} className="animate-spin text-primary" />
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search title or category…"
            className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white"
          />
        </div>
        <div className="relative">
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="pl-3 pr-7 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none appearance-none cursor-pointer">
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
            <option value="draft">Draft</option>
          </select>
          <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
        <div className="relative">
          <select value={filterLibrary} onChange={e => setFilterLibrary(e.target.value)} className="pl-3 pr-7 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none appearance-none cursor-pointer">
            <option value="">All library states</option>
            <option value="not_published">Not published</option>
            <option value="published">Published</option>
            <option value="archived">Library archived</option>
          </select>
          <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
        <button onClick={() => void load()} className="p-2 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50" title="Refresh">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 bg-violet-50 border border-violet-200 rounded-xl px-4 py-2.5">
          <span className="text-sm font-semibold text-violet-700">{selected.size} selected</span>
          <button
            onClick={() => void publishSelected()}
            disabled={bulkPublishing}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors"
          >
            {bulkPublishing ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
            {bulkPublishing ? 'Publishing…' : `Publish ${selected.size} to library`}
          </button>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-violet-500 hover:text-violet-700 font-semibold">
            Clear selection
          </button>
        </div>
      )}

      {/* Count + junk warning */}
      <div className="flex items-center gap-3 flex-wrap">
        <p className="text-xs text-slate-400">{filtered.length} of {templates.length} SWMS template{templates.length !== 1 ? 's' : ''}</p>
        {templates.some(t => t.title.toLowerCase().includes('copy') || t.title === 'SWMS Title') && (
          <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1">
            <AlertTriangle size={11} />
            Some templates may be duplicates or junk — review and archive/delete as needed
          </div>
        )}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ShieldCheck size={28} className="text-slate-300 mb-3" />
          <p className="text-sm font-semibold text-slate-500">No SWMS templates found</p>
          <p className="text-xs text-slate-400 mt-1">Try adjusting your filters.</p>
        </div>
      ) : (
        <div className="border border-slate-200 rounded-2xl overflow-hidden">
          {/* Header row */}
          <div className="bg-slate-50 border-b border-slate-200 px-4 py-2.5 grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-3 items-center text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            <input
              type="checkbox"
              checked={selected.size === filtered.length && filtered.length > 0}
              onChange={toggleSelectAll}
              className="w-4 h-4 rounded accent-violet-600"
            />
            <span>Title / Category</span>
            <span>Status</span>
            <span>Library</span>
            <span className="hidden sm:block">Installs</span>
            <span>Actions</span>
          </div>
          <div className="divide-y divide-slate-100">
            {filtered.map(t => {
              const busy = publishingIds.has(t.id) || archivingId === t.id;
              const isJunk = t.title === 'SWMS Title' || t.title.toLowerCase().endsWith('(copy)');
              return (
                <div key={t.id} className={`px-4 py-3 grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-3 items-center ${selected.has(t.id) ? 'bg-violet-50/40' : ''} ${isJunk ? 'bg-amber-50/30' : ''}`}>
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={selected.has(t.id)}
                    onChange={() => toggleSelect(t.id)}
                    className="w-4 h-4 rounded accent-violet-600"
                  />

                  {/* Title + category */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold text-slate-800 truncate">{t.title}</p>
                      {isJunk && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-600 flex-shrink-0">
                          Review
                        </span>
                      )}
                    </div>
                    {t.category && <p className="text-xs text-slate-400 truncate">{t.category}</p>}
                    {t.buildMode && <p className="text-[11px] text-slate-300">{t.buildMode}</p>}
                  </div>

                  {/* Source status */}
                  <StatusBadge status={t.status} />

                  {/* Library state */}
                  <LibraryBadge state={t.libraryStatus} visibility={t.libraryVisibility} installCount={t.installCount} />

                  {/* Install count */}
                  <span className="hidden sm:flex items-center gap-1 text-xs text-slate-400">
                    <Building2 size={11} />
                    {t.installCount}
                  </span>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {/* Edit — opens existing SWMS builder */}
                    <button
                      onClick={() => navigate(`/safety?editSwms=${t.id}`)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                      title="Edit in SWMS builder"
                    >
                      <Pencil size={13} />
                    </button>

                    {/* Publish / Update */}
                    <button
                      onClick={() => void publishOne(t.id)}
                      disabled={busy}
                      className={`flex items-center gap-1 px-2 py-1.5 text-[11px] font-bold rounded-lg transition-colors disabled:opacity-40 ${
                        t.libraryStatus === 'not_published'
                          ? 'bg-blue-600 hover:bg-blue-700 text-white'
                          : 'border border-blue-200 text-blue-700 hover:bg-blue-50'
                      }`}
                      title={t.libraryStatus === 'not_published' ? 'Publish to Global Library' : 'Update Global Library copy'}
                    >
                      {publishingIds.has(t.id) ? <Loader2 size={11} className="animate-spin" /> : <Globe size={11} />}
                      {t.libraryStatus === 'not_published' ? 'Publish' : 'Update'}
                    </button>

                    {/* Archive / Restore */}
                    <button
                      onClick={() => void archiveToggle(t)}
                      disabled={busy}
                      className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors disabled:opacity-40"
                      title={t.status === 'archived' ? 'Restore' : 'Archive source'}
                    >
                      {archivingId === t.id ? <Loader2 size={13} className="animate-spin" /> : t.status === 'archived' ? <RotateCcw size={13} /> : <Archive size={13} />}
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() => setDeleteTarget(t)}
                      disabled={busy}
                      className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                      title="Delete source template"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Delete confirm dialog */}
      {deleteTarget && (
        <DeleteConfirmDialog
          title={deleteTarget.title}
          hasLibraryEntry={deleteTarget.libraryItemId !== null}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setDeleteTarget(null)}
          deleting={deleting}
        />
      )}
    </div>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────

type SubTab = 'form-sources' | 'swms-sources' | 'published-library';

export default function GlobalLibraryTab() {
  const [subTab, setSubTab] = useState<SubTab>('form-sources');

  const subTabs: Array<{ id: SubTab; label: string; icon: React.ElementType; description: string }> = [
    {
      id: 'form-sources',
      label: 'Form Sources',
      icon: ClipboardList,
      description: 'All form_templates — review, edit, publish, archive, delete',
    },
    {
      id: 'swms-sources',
      label: 'SWMS Sources',
      icon: ShieldCheck,
      description: 'All swms_templates — review, edit, publish, archive, delete',
    },
    {
      id: 'published-library',
      label: 'Published Library',
      icon: BookOpen,
      description: 'Global Library items — visibility, push updates, delete entries',
    },
  ];

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Sub-tab bar */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex gap-1 flex-shrink-0 flex-wrap">
        {subTabs.map(st => {
          const Icon = st.icon;
          return (
            <button
              key={st.id}
              onClick={() => setSubTab(st.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                subTab === st.id
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Icon size={14} />
              {st.label}
            </button>
          );
        })}
      </div>

      {/* Sub-tab description */}
      <div className="bg-slate-50 border-b border-slate-100 px-6 py-2 flex-shrink-0">
        <p className="text-xs text-slate-500">
          {subTabs.find(s => s.id === subTab)?.description}
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-6">
        {subTab === 'form-sources' && <FormSourcesTab />}
        {subTab === 'swms-sources' && <SwmsSourcesTab />}
        {subTab === 'published-library' && <LibraryManagerTab />}
      </div>
    </div>
  );
}
