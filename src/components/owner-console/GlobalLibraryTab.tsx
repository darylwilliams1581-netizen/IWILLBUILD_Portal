/**
 * GlobalLibraryTab — Developer Console → Global Library
 * ─────────────────────────────────────────────────────────────────────────────
 * Four sub-views:
 *   1. Form Sources      — all form_templates
 *   2. SWMS Sources      — all swms_templates
 *   3. Document Sources  — all document_templates
 *   4. Published Library — existing LibraryManagerTab (full governance)
 *
 * Access: platform_role = 'developer' (enforced server-side on every endpoint).
 *
 * Publishing uses the existing stable endpoints:
 *   POST /api/form-templates/:id/publish-to-library
 *   POST /api/safety/swms/:id/publish-to-library
 *   POST /api/document-templates/:id/publish-to-library
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import {
  ClipboardList, ShieldCheck, FileText, BookOpen, RefreshCw, Loader2,
  Globe, Archive, RotateCcw, Search, ChevronDown, X,
  Building2, Info, Trash2, AlertTriangle, Pencil,
} from 'lucide-react';
import { toast } from 'sonner';
import LibraryManagerTab from './LibraryManagerTab';

// ── Shared types ──────────────────────────────────────────────────────────────

type LibraryStatus = 'not_published' | 'published' | 'archived';

interface BaseSource {
  id: number;
  status: string;
  category: string | null;
  createdAt: string;
  updatedAt: string;
  libraryItemId: number | null;
  libraryStatus: LibraryStatus;
  libraryVisibility: string | null;
  installCount: number;
}

interface FormSource extends BaseSource {
  name: string;
  formType: string | null;
}

interface SwmsSource extends BaseSource {
  title: string;
  buildMode: string | null;
  documentType: string | null;
  revisionNumber: string | null;
}

interface DocSource extends BaseSource {
  name: string;
  type: string | null;
}

// ── Shared UI helpers ─────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active:   'bg-emerald-100 text-emerald-700',
    draft:    'bg-amber-100 text-amber-700',
    archived: 'bg-slate-100 text-slate-500',
  };
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${map[status] ?? 'bg-slate-100 text-slate-500'}`}>
      {status}
    </span>
  );
}

function LibraryBadge({ state, visibility, installCount }: {
  state: LibraryStatus;
  visibility: string | null;
  installCount: number;
}) {
  if (state === 'not_published') {
    return (
      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-400 whitespace-nowrap">
        Not published
      </span>
    );
  }
  if (state === 'archived') {
    return (
      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-600 whitespace-nowrap">
        Library archived
      </span>
    );
  }
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 whitespace-nowrap ${visibility === 'public' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
      <Globe size={9} />
      {visibility === 'public' ? 'Published' : 'Private'}
      {installCount > 0 && <span className="opacity-70">· {installCount}</span>}
    </span>
  );
}

function DeleteConfirmDialog({
  title, hasLibraryEntry, onConfirm, onCancel, deleting,
}: {
  title: string;
  hasLibraryEntry: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
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
            Permanently delete <strong>"{title}"</strong>?
          </p>
          {hasLibraryEntry && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
              <Info size={13} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">
                This template has a Global Library entry. Deleting the source will <strong>not</strong> remove the library item or any company copies.
              </p>
            </div>
          )}
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
            <AlertTriangle size={13} className="text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-700">This cannot be undone.</p>
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

// ── Generic source table ──────────────────────────────────────────────────────
// Shared rendering logic for all three source types.

interface SourceRow {
  id: number;
  displayName: string;
  category: string | null;
  subLabel: string | null;
  status: string;
  libraryItemId: number | null;
  libraryStatus: LibraryStatus;
  libraryVisibility: string | null;
  installCount: number;
  isJunk?: boolean;
}

interface SourceTableProps {
  rows: SourceRow[];
  selected: Set<number>;
  publishingIds: Set<number>;
  archivingId: number | null;
  onToggleSelect: (id: number) => void;
  onToggleSelectAll: () => void;
  onPublish: (id: number) => void;
  onArchiveToggle: (id: number, currentStatus: string) => void;
  onDeleteRequest: (id: number) => void;
  onEdit: (id: number) => void;
}

function SourceTable({
  rows, selected, publishingIds, archivingId,
  onToggleSelect, onToggleSelectAll,
  onPublish, onArchiveToggle, onDeleteRequest, onEdit,
}: SourceTableProps) {
  if (rows.length === 0) return null;

  return (
    <div className="border border-slate-200 rounded-2xl overflow-hidden">
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-2.5 grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-3 items-center text-[11px] font-bold text-slate-400 uppercase tracking-wider">
        <input
          type="checkbox"
          checked={selected.size === rows.length && rows.length > 0}
          onChange={onToggleSelectAll}
          className="w-4 h-4 rounded accent-violet-600"
        />
        <span>Name / Category</span>
        <span>Status</span>
        <span>Library</span>
        <span className="hidden sm:block">Installs</span>
        <span>Actions</span>
      </div>
      <div className="divide-y divide-slate-100">
        {rows.map(row => {
          const busy = publishingIds.has(row.id) || archivingId === row.id;
          return (
            <div
              key={row.id}
              className={`px-4 py-3 grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-3 items-center ${selected.has(row.id) ? 'bg-violet-50/40' : ''} ${row.isJunk ? 'bg-amber-50/30' : ''}`}
            >
              <input
                type="checkbox"
                checked={selected.has(row.id)}
                onChange={() => onToggleSelect(row.id)}
                className="w-4 h-4 rounded accent-violet-600"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-sm font-semibold text-slate-800 truncate">{row.displayName}</p>
                  {row.isJunk && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-600 flex-shrink-0">Review</span>
                  )}
                </div>
                {row.category && <p className="text-xs text-slate-400 truncate">{row.category}</p>}
                {row.subLabel && <p className="text-[11px] text-slate-300">{row.subLabel}</p>}
              </div>
              <StatusBadge status={row.status} />
              <LibraryBadge state={row.libraryStatus} visibility={row.libraryVisibility} installCount={row.installCount} />
              <span className="hidden sm:flex items-center gap-1 text-xs text-slate-400">
                <Building2 size={11} />
                {row.installCount}
              </span>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => onEdit(row.id)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                  title="Edit"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={() => onPublish(row.id)}
                  disabled={busy}
                  className={`flex items-center gap-1 px-2 py-1.5 text-[11px] font-bold rounded-lg transition-colors disabled:opacity-40 ${
                    row.libraryStatus === 'not_published'
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'border border-blue-200 text-blue-700 hover:bg-blue-50'
                  }`}
                  title={row.libraryStatus === 'not_published' ? 'Publish to Global Library' : 'Update Global Library copy'}
                >
                  {publishingIds.has(row.id) ? <Loader2 size={11} className="animate-spin" /> : <Globe size={11} />}
                  {row.libraryStatus === 'not_published' ? 'Publish' : 'Update'}
                </button>
                <button
                  onClick={() => onArchiveToggle(row.id, row.status)}
                  disabled={busy}
                  className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors disabled:opacity-40"
                  title={row.status === 'archived' ? 'Restore' : 'Archive source'}
                >
                  {archivingId === row.id ? <Loader2 size={13} className="animate-spin" /> : row.status === 'archived' ? <RotateCcw size={13} /> : <Archive size={13} />}
                </button>
                <button
                  onClick={() => onDeleteRequest(row.id)}
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
  );
}

// ── Generic source tab hook ───────────────────────────────────────────────────

function useSourceTab<T extends BaseSource>(
  fetchUrl: string,
  publishUrl: (id: number) => string,
  archiveUrl: (id: number) => string,
  deleteUrl: (id: number) => string,
) {
  const [templates, setTemplates] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [publishingIds, setPublishingIds] = useState<Set<number>>(new Set());
  const [archivingId, setArchivingId] = useState<number | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [bulkPublishing, setBulkPublishing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(fetchUrl, { credentials: 'include' });
      const d = await r.json() as { ok?: boolean; templates?: T[]; error?: string };
      if (!r.ok || !d.ok) throw new Error(d.error ?? 'Failed to load');
      setTemplates(d.templates ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [fetchUrl]);

  useEffect(() => { void load(); }, [load]);

  function toggleSelect(id: number) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function toggleSelectAll(filteredIds: number[]) {
    setSelected(prev => prev.size === filteredIds.length ? new Set() : new Set(filteredIds));
  }

  async function publishOne(id: number) {
    setPublishingIds(prev => new Set([...prev, id]));
    try {
      const r = await fetch(publishUrl(id), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify({}),
      });
      const d = await r.json() as { ok?: boolean; error?: string; updated?: boolean };
      if (!r.ok || d.error) throw new Error(d.error ?? `HTTP ${r.status}`);
      toast.success(d.updated ? 'Global Library entry updated' : 'Published to Global Library');
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Publish failed');
    } finally {
      setPublishingIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
  }

  async function publishSelected() {
    if (selected.size === 0) return;
    setBulkPublishing(true);
    let ok = 0; let failed = 0;
    for (const id of selected) {
      try {
        const r = await fetch(publishUrl(id), {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          credentials: 'include', body: JSON.stringify({}),
        });
        const d = await r.json() as { ok?: boolean; error?: string };
        if (!r.ok || d.error) { failed++; } else { ok++; }
      } catch { failed++; }
    }
    toast.success(`Published ${ok}${failed > 0 ? ` (${failed} failed)` : ''}`);
    setSelected(new Set());
    setBulkPublishing(false);
    void load();
  }

  async function archiveToggle(id: number, currentStatus: string) {
    setArchivingId(id);
    const newStatus = currentStatus === 'archived' ? 'active' : 'archived';
    try {
      const r = await fetch(archiveUrl(id), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify({ status: newStatus }),
      });
      if (!r.ok) throw new Error('Failed');
      toast.success(newStatus === 'archived' ? 'Archived' : 'Restored');
      void load();
    } catch { toast.error('Failed to update status'); }
    finally { setArchivingId(null); }
  }

  async function confirmDelete() {
    if (!deleteTargetId) return;
    setDeleting(true);
    try {
      const r = await fetch(deleteUrl(deleteTargetId), { method: 'DELETE', credentials: 'include' });
      const d = await r.json() as { ok?: boolean; error?: string };
      if (!r.ok || d.error) throw new Error(d.error ?? 'Delete failed');
      toast.success('Deleted');
      setDeleteTargetId(null);
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    } finally { setDeleting(false); }
  }

  const deleteTarget = deleteTargetId ? templates.find(t => t.id === deleteTargetId) ?? null : null;

  return {
    templates, loading, selected, publishingIds, archivingId,
    deleteTarget, deleting,
    toggleSelect, toggleSelectAll, publishOne, publishSelected,
    archiveToggle, setDeleteTargetId, confirmDelete, cancelDelete: () => setDeleteTargetId(null),
    bulkPublishing, load,
  };
}

// ── Toolbar ───────────────────────────────────────────────────────────────────

function SourceToolbar({
  search, onSearch, filterStatus, onFilterStatus, filterLibrary, onFilterLibrary, onRefresh,
  statusOptions,
}: {
  search: string;
  onSearch: (v: string) => void;
  filterStatus: string;
  onFilterStatus: (v: string) => void;
  filterLibrary: string;
  onFilterLibrary: (v: string) => void;
  onRefresh: () => void;
  statusOptions: string[];
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="relative flex-1 min-w-[180px]">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={e => onSearch(e.target.value)}
          placeholder="Search…"
          className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white"
        />
      </div>
      <div className="relative">
        <select value={filterStatus} onChange={e => onFilterStatus(e.target.value)} className="pl-3 pr-7 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none appearance-none cursor-pointer">
          <option value="">All statuses</option>
          {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      </div>
      <div className="relative">
        <select value={filterLibrary} onChange={e => onFilterLibrary(e.target.value)} className="pl-3 pr-7 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none appearance-none cursor-pointer">
          <option value="">All library states</option>
          <option value="not_published">Not published</option>
          <option value="published">Published</option>
          <option value="archived">Library archived</option>
        </select>
        <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      </div>
      <button onClick={onRefresh} className="p-2 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50" title="Refresh">
        <RefreshCw size={14} />
      </button>
    </div>
  );
}

function BulkBar({ count, onPublish, onClear, busy }: { count: number; onPublish: () => void; onClear: () => void; busy: boolean }) {
  if (count === 0) return null;
  return (
    <div className="flex items-center gap-3 bg-violet-50 border border-violet-200 rounded-xl px-4 py-2.5">
      <span className="text-sm font-semibold text-violet-700">{count} selected</span>
      <button
        onClick={onPublish}
        disabled={busy}
        className="flex items-center gap-1.5 px-3.5 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors"
      >
        {busy ? <Loader2 size={12} className="animate-spin" /> : <Globe size={12} />}
        {busy ? 'Publishing…' : `Publish ${count} to library`}
      </button>
      <button onClick={onClear} className="ml-auto text-xs text-violet-500 hover:text-violet-700 font-semibold">Clear</button>
    </div>
  );
}

// ── Form Sources ──────────────────────────────────────────────────────────────

function FormSourcesTab() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterLibrary, setFilterLibrary] = useState('');

  const hook = useSourceTab<FormSource>(
    '/api/owner-console/sources/forms',
    id => `/api/form-templates/${id}/publish-to-library`,
    id => `/api/owner-console/sources/forms/${id}`,
    id => `/api/owner-console/sources/forms/${id}`,
  );

  const filtered = hook.templates.filter(t => {
    if (search && !t.name.toLowerCase().includes(search.toLowerCase()) && !(t.category ?? '').toLowerCase().includes(search.toLowerCase())) return false;
    if (filterStatus && t.status !== filterStatus) return false;
    if (filterLibrary && t.libraryStatus !== filterLibrary) return false;
    return true;
  });

  const rows: SourceRow[] = filtered.map(t => ({
    id: t.id,
    displayName: t.name,
    category: t.category,
    subLabel: t.formType,
    status: t.status,
    libraryItemId: t.libraryItemId,
    libraryStatus: t.libraryStatus,
    libraryVisibility: t.libraryVisibility,
    installCount: t.installCount,
  }));

  if (hook.loading) return <div className="flex items-center justify-center py-20"><Loader2 size={22} className="animate-spin text-primary" /></div>;

  return (
    <div className="flex flex-col gap-4">
      <SourceToolbar
        search={search} onSearch={setSearch}
        filterStatus={filterStatus} onFilterStatus={setFilterStatus}
        filterLibrary={filterLibrary} onFilterLibrary={setFilterLibrary}
        onRefresh={() => void hook.load()}
        statusOptions={['active', 'archived']}
      />
      <BulkBar count={hook.selected.size} onPublish={() => void hook.publishSelected()} onClear={() => hook.toggleSelectAll([])} busy={hook.bulkPublishing} />
      <p className="text-xs text-slate-400">{filtered.length} of {hook.templates.length} form template{hook.templates.length !== 1 ? 's' : ''}</p>
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ClipboardList size={28} className="text-slate-300 mb-3" />
          <p className="text-sm font-semibold text-slate-500">No form templates found</p>
        </div>
      ) : (
        <SourceTable
          rows={rows}
          selected={hook.selected}
          publishingIds={hook.publishingIds}
          archivingId={hook.archivingId}
          onToggleSelect={hook.toggleSelect}
          onToggleSelectAll={() => hook.toggleSelectAll(filtered.map(t => t.id))}
          onPublish={id => void hook.publishOne(id)}
          onArchiveToggle={(id, status) => void hook.archiveToggle(id, status)}
          onDeleteRequest={hook.setDeleteTargetId}
          onEdit={id => navigate(`/forms?edit=${id}`)}
        />
      )}
      {hook.deleteTarget && (
        <DeleteConfirmDialog
          title={(hook.deleteTarget as FormSource).name}
          hasLibraryEntry={hook.deleteTarget.libraryItemId !== null}
          onConfirm={() => void hook.confirmDelete()}
          onCancel={hook.cancelDelete}
          deleting={hook.deleting}
        />
      )}
    </div>
  );
}

// ── SWMS Sources ──────────────────────────────────────────────────────────────

function SwmsSourcesTab() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterLibrary, setFilterLibrary] = useState('');

  const hook = useSourceTab<SwmsSource>(
    '/api/owner-console/sources/swms',
    id => `/api/safety/swms/${id}/publish-to-library`,
    id => `/api/owner-console/sources/swms/${id}`,
    id => `/api/owner-console/sources/swms/${id}`,
  );

  const filtered = hook.templates.filter(t => {
    if (search && !t.title.toLowerCase().includes(search.toLowerCase()) && !(t.category ?? '').toLowerCase().includes(search.toLowerCase())) return false;
    if (filterStatus && t.status !== filterStatus) return false;
    if (filterLibrary && t.libraryStatus !== filterLibrary) return false;
    return true;
  });

  const rows: SourceRow[] = filtered.map(t => ({
    id: t.id,
    displayName: t.title,
    category: t.category,
    subLabel: t.buildMode,
    status: t.status,
    libraryItemId: t.libraryItemId,
    libraryStatus: t.libraryStatus,
    libraryVisibility: t.libraryVisibility,
    installCount: t.installCount,
    isJunk: t.title === 'SWMS Title' || t.title.toLowerCase().endsWith('(copy)'),
  }));

  const hasJunk = rows.some(r => r.isJunk);

  if (hook.loading) return <div className="flex items-center justify-center py-20"><Loader2 size={22} className="animate-spin text-primary" /></div>;

  return (
    <div className="flex flex-col gap-4">
      <SourceToolbar
        search={search} onSearch={setSearch}
        filterStatus={filterStatus} onFilterStatus={setFilterStatus}
        filterLibrary={filterLibrary} onFilterLibrary={setFilterLibrary}
        onRefresh={() => void hook.load()}
        statusOptions={['active', 'archived', 'draft']}
      />
      <BulkBar count={hook.selected.size} onPublish={() => void hook.publishSelected()} onClear={() => hook.toggleSelectAll([])} busy={hook.bulkPublishing} />
      <div className="flex items-center gap-3 flex-wrap">
        <p className="text-xs text-slate-400">{filtered.length} of {hook.templates.length} SWMS template{hook.templates.length !== 1 ? 's' : ''}</p>
        {hasJunk && (
          <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1">
            <AlertTriangle size={11} />
            Some templates may be duplicates or junk — review and archive/delete as needed
          </div>
        )}
      </div>
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ShieldCheck size={28} className="text-slate-300 mb-3" />
          <p className="text-sm font-semibold text-slate-500">No SWMS templates found</p>
        </div>
      ) : (
        <SourceTable
          rows={rows}
          selected={hook.selected}
          publishingIds={hook.publishingIds}
          archivingId={hook.archivingId}
          onToggleSelect={hook.toggleSelect}
          onToggleSelectAll={() => hook.toggleSelectAll(filtered.map(t => t.id))}
          onPublish={id => void hook.publishOne(id)}
          onArchiveToggle={(id, status) => void hook.archiveToggle(id, status)}
          onDeleteRequest={hook.setDeleteTargetId}
          onEdit={id => navigate(`/safety?editSwms=${id}`)}
        />
      )}
      {hook.deleteTarget && (
        <DeleteConfirmDialog
          title={(hook.deleteTarget as SwmsSource).title}
          hasLibraryEntry={hook.deleteTarget.libraryItemId !== null}
          onConfirm={() => void hook.confirmDelete()}
          onCancel={hook.cancelDelete}
          deleting={hook.deleting}
        />
      )}
    </div>
  );
}

// ── Document Sources ──────────────────────────────────────────────────────────

function DocumentSourcesTab() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterLibrary, setFilterLibrary] = useState('');

  const hook = useSourceTab<DocSource>(
    '/api/owner-console/sources/documents',
    id => `/api/document-templates/${id}/publish-to-library`,
    id => `/api/owner-console/sources/documents/${id}`,
    id => `/api/owner-console/sources/documents/${id}`,
  );

  const filtered = hook.templates.filter(t => {
    if (search && !t.name.toLowerCase().includes(search.toLowerCase()) && !(t.category ?? '').toLowerCase().includes(search.toLowerCase()) && !(t.type ?? '').toLowerCase().includes(search.toLowerCase())) return false;
    if (filterStatus && t.status !== filterStatus) return false;
    if (filterLibrary && t.libraryStatus !== filterLibrary) return false;
    return true;
  });

  const rows: SourceRow[] = filtered.map(t => ({
    id: t.id,
    displayName: t.name,
    category: t.category,
    subLabel: t.type,
    status: t.status,
    libraryItemId: t.libraryItemId,
    libraryStatus: t.libraryStatus,
    libraryVisibility: t.libraryVisibility,
    installCount: t.installCount,
  }));

  if (hook.loading) return <div className="flex items-center justify-center py-20"><Loader2 size={22} className="animate-spin text-primary" /></div>;

  return (
    <div className="flex flex-col gap-4">
      <SourceToolbar
        search={search} onSearch={setSearch}
        filterStatus={filterStatus} onFilterStatus={setFilterStatus}
        filterLibrary={filterLibrary} onFilterLibrary={setFilterLibrary}
        onRefresh={() => void hook.load()}
        statusOptions={['active', 'archived', 'draft']}
      />
      <BulkBar count={hook.selected.size} onPublish={() => void hook.publishSelected()} onClear={() => hook.toggleSelectAll([])} busy={hook.bulkPublishing} />
      <p className="text-xs text-slate-400">{filtered.length} of {hook.templates.length} document template{hook.templates.length !== 1 ? 's' : ''}</p>
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FileText size={28} className="text-slate-300 mb-3" />
          <p className="text-sm font-semibold text-slate-500">No document templates found</p>
        </div>
      ) : (
        <SourceTable
          rows={rows}
          selected={hook.selected}
          publishingIds={hook.publishingIds}
          archivingId={hook.archivingId}
          onToggleSelect={hook.toggleSelect}
          onToggleSelectAll={() => hook.toggleSelectAll(filtered.map(t => t.id))}
          onPublish={id => void hook.publishOne(id)}
          onArchiveToggle={(id, status) => void hook.archiveToggle(id, status)}
          onDeleteRequest={hook.setDeleteTargetId}
          onEdit={id => navigate(`/studio?edit=${id}`)}
        />
      )}
      {hook.deleteTarget && (
        <DeleteConfirmDialog
          title={(hook.deleteTarget as DocSource).name}
          hasLibraryEntry={hook.deleteTarget.libraryItemId !== null}
          onConfirm={() => void hook.confirmDelete()}
          onCancel={hook.cancelDelete}
          deleting={hook.deleting}
        />
      )}
    </div>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────

type SubTab = 'form-sources' | 'swms-sources' | 'document-sources' | 'published-library';

export default function GlobalLibraryTab() {
  const [subTab, setSubTab] = useState<SubTab>('form-sources');

  const subTabs: Array<{ id: SubTab; label: string; icon: React.ElementType; description: string }> = [
    { id: 'form-sources',      label: 'Form Sources',      icon: ClipboardList, description: 'All form_templates — review, edit, publish, archive, delete' },
    { id: 'swms-sources',      label: 'SWMS Sources',      icon: ShieldCheck,   description: 'All swms_templates — review, edit, publish, archive, delete' },
    { id: 'document-sources',  label: 'Document Sources',  icon: FileText,      description: 'All document_templates — review, edit, publish, archive, delete' },
    { id: 'published-library', label: 'Published Library', icon: BookOpen,      description: 'Global Library items — visibility, push updates, delete entries' },
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

      {/* Description */}
      <div className="bg-slate-50 border-b border-slate-100 px-6 py-2 flex-shrink-0">
        <p className="text-xs text-slate-500">
          {subTabs.find(s => s.id === subTab)?.description}
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-6">
        {subTab === 'form-sources'      && <FormSourcesTab />}
        {subTab === 'swms-sources'      && <SwmsSourcesTab />}
        {subTab === 'document-sources'  && <DocumentSourcesTab />}
        {subTab === 'published-library' && <LibraryManagerTab />}
      </div>
    </div>
  );
}
