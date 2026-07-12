/**
 * Owner Console → SWMS Master Library tab
 *
 * Platform owner workflow:
 *  1. Run migration once (makes company_id nullable, adds is_platform_master)
 *  2. Seed the 24 built-in templates into the master library
 *  3. Review / edit / create new masters
 *  4. Publish individual masters (or all) to every company's SWMS library
 */
import { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck, Plus, Send, RefreshCw, Loader2, CheckCircle2,
  XCircle, AlertTriangle, Pencil, Trash2, Play, ChevronDown,
  ChevronUp, BookOpen, Globe, Eye, Database,
} from 'lucide-react';
import { toast } from 'sonner';

// ── Types ─────────────────────────────────────────────────────────────────────

interface MasterTemplate {
  id: number;
  title: string;
  category: string | null;
  build_mode: string;
  document_type: string;
  status: string;
  revision_number: string;
  review_date: string | null;
  author_name: string | null;
  approved_by_name: string | null;
  is_platform_master: number;
  created_at: string;
  updated_at: string;
}

interface PublishResult {
  ok: boolean;
  title?: string;
  companies?: number;
  inserted?: number;
  updated?: number;
  skipped?: number;
  error?: string;
}

// ── Seed list (same 24 as before) ─────────────────────────────────────────────

const SEEDS = [
  { name: 'fencing',                label: 'Fencing' },
  { name: 'carpenter-framing',      label: 'Carpenter – Framing' },
  { name: 'carpenter-fixing',       label: 'Carpenter – Fixing' },
  { name: 'bricklaying',            label: 'Bricklaying' },
  { name: 'concreting-slab',        label: 'Concreting – Slab' },
  { name: 'ceramic-tiling',         label: 'Ceramic Tiling' },
  { name: 'painting',               label: 'Painting' },
  { name: 'landscaping',            label: 'Landscaping' },
  { name: 'ewp',                    label: 'EWP (Elevated Work Platform)' },
  { name: 'cabinets',               label: 'Cabinet Installation' },
  { name: 'carpenter-lockup',       label: 'Carpenter – Lock-up' },
  { name: 'manual-handling',        label: 'Manual Handling' },
  { name: 'underground-services',   label: 'Underground Services' },
  { name: 'live-parts',             label: 'Live Electrical Parts' },
  { name: 'moving-plant',           label: 'Moving Plant' },
  { name: 'excavations-substation', label: 'Excavations – Substation' },
  { name: 'vacuum-excavation',      label: 'Vacuum Excavation' },
  { name: 'traffic-management',     label: 'Traffic Management' },
  { name: 'silica-dust',            label: 'Silica Dust' },
  { name: 'power-tools',            label: 'Power Tools' },
  { name: 'delivery-loading',       label: 'Delivery & Loading' },
  { name: 'environmental-spill',    label: 'Environmental Spill' },
  { name: 'heat-stress',            label: 'Heat Stress' },
  { name: 'building-inspection',    label: 'Building Inspection' },
] as const;

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft:    'bg-amber-100 text-amber-700',
    active:   'bg-green-100 text-green-700',
    archived: 'bg-slate-100 text-slate-500',
  };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${map[status] ?? 'bg-slate-100 text-slate-500'}`}>
      {status}
    </span>
  );
}

// ── Edit modal ────────────────────────────────────────────────────────────────

interface EditModalProps {
  template: MasterTemplate | null;  // null = create new
  onClose: () => void;
  onSaved: () => void;
}

function EditModal({ template, onClose, onSaved }: EditModalProps) {
  const isNew = !template;
  const [title, setTitle]       = useState(template?.title ?? '');
  const [category, setCategory] = useState(template?.category ?? '');
  const [buildMode, setBuildMode] = useState(template?.build_mode ?? 'advanced');
  const [status, setStatus]     = useState(template?.status ?? 'draft');
  const [revision, setRevision] = useState(template?.revision_number ?? '1');
  const [author, setAuthor]     = useState(template?.author_name ?? '');
  const [approved, setApproved] = useState(template?.approved_by_name ?? '');
  const [saving, setSaving]     = useState(false);

  async function handleSave() {
    if (!title.trim()) { toast.error('Title is required'); return; }
    setSaving(true);
    try {
      const body = {
        title: title.trim(),
        category: category.trim() || undefined,
        build_mode: buildMode,
        status,
        revision_number: revision,
        author_name: author.trim() || undefined,
        approved_by_name: approved.trim() || undefined,
      };
      const url    = isNew ? '/api/owner-console/swms/masters' : `/api/owner-console/swms/masters/${template!.id}`;
      const method = isNew ? 'POST' : 'PUT';
      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const d = await r.json() as { master?: MasterTemplate; error?: string };
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      toast.success(isNew ? 'Master template created' : 'Master template updated');
      onSaved();
      onClose();
    } catch (e) {
      toast.error(String(e instanceof Error ? e.message : e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-900">
            {isNew ? 'New Master Template' : 'Edit Master Template'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Title *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Roof Tiling"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Category</label>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Roofing / Cladding"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Build mode</label>
              <select
                value={buildMode}
                onChange={(e) => setBuildMode(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              >
                <option value="quick">Quick (9 sections)</option>
                <option value="advanced">Advanced (14 sections)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Revision</label>
              <input
                value={revision}
                onChange={(e) => setRevision(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Author name</label>
            <input
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="e.g. Platform Safety Team"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Approved by</label>
            <input
              value={approved}
              onChange={(e) => setApproved(e.target.value)}
              placeholder="e.g. Principal Contractor"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-bold rounded-lg"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {isNew ? 'Create' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export default function SwmsMasterLibraryTab() {
  const [masters, setMasters]             = useState<MasterTemplate[]>([]);
  const [loading, setLoading]             = useState(true);
  const [migrated, setMigrated]           = useState<boolean | null>(null);
  const [migrating, setMigrating]         = useState(false);

  // Seed panel
  const [showSeed, setShowSeed]           = useState(false);
  const [seeding, setSeeding]             = useState(false);
  const [seedReplace, setSeedReplace]     = useState(false);
  const [seedResults, setSeedResults]     = useState<Array<{ name: string; status: 'ok' | 'error' | 'skipped'; message: string }>>([]);

  // Edit modal
  const [editTarget, setEditTarget]       = useState<MasterTemplate | null | 'new'>('new' as never);
  const [showEdit, setShowEdit]           = useState(false);

  // Publish
  const [publishingId, setPublishingId]   = useState<number | null>(null);
  const [publishingAll, setPublishingAll] = useState(false);
  const [publishReplace, setPublishReplace] = useState(false);
  const [publishResults, setPublishResults] = useState<Record<number, PublishResult>>({});
  const [publishAllResult, setPublishAllResult] = useState<PublishResult | null>(null);

  // Delete
  const [deletingId, setDeletingId]       = useState<number | null>(null);

  // ── Load masters ────────────────────────────────────────────────────────────

  const loadMasters = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/owner-console/swms/masters', { credentials: 'include' });
      if (r.status === 403) { setMigrated(false); setLoading(false); return; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json() as { masters: MasterTemplate[] };
      setMasters(d.masters ?? []);
      setMigrated(true);
    } catch {
      // Column may not exist yet — treat as not migrated
      setMigrated(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadMasters(); }, [loadMasters]);

  // ── Migration ───────────────────────────────────────────────────────────────

  async function runMigration() {
    setMigrating(true);
    try {
      const r = await fetch('/api/owner-console/swms/migrate-master-library', {
        method: 'POST', credentials: 'include',
      });
      const d = await r.json() as { ok: boolean; results: string[]; error?: string };
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      toast.success('Migration complete');
      setMigrated(true);
      void loadMasters();
    } catch (e) {
      toast.error(String(e instanceof Error ? e.message : e));
    } finally {
      setMigrating(false);
    }
  }

  // ── Seed ────────────────────────────────────────────────────────────────────

  async function runSeedAll() {
    setSeeding(true);
    setSeedResults([]);
    const out: typeof seedResults = [];
    for (const seed of SEEDS) {
      try {
        const url = `/api/owner-console/swms/seed-${seed.name}${seedReplace ? '?replace=1' : ''}`;
        const r = await fetch(url, { method: 'POST', credentials: 'include' });
        const d = await r.json() as { ok?: boolean; action?: string; message?: string; error?: string };
        if (!r.ok) {
          out.push({ name: seed.name, status: 'error', message: d.error ?? `HTTP ${r.status}` });
        } else if (d.action === 'skipped') {
          out.push({ name: seed.name, status: 'skipped', message: 'Already exists (use Replace to overwrite)' });
        } else {
          out.push({ name: seed.name, status: 'ok', message: d.action === 'updated' ? 'Updated' : 'Inserted as platform master' });
        }
      } catch (e) {
        out.push({ name: seed.name, status: 'error', message: String(e) });
      }
      setSeedResults([...out]);
    }
    setSeeding(false);
    await loadMasters();
    const ok = out.filter((r) => r.status === 'ok').length;
    const skipped = out.filter((r) => r.status === 'skipped').length;
    const failed = out.filter((r) => r.status === 'error').length;
    toast.success(`Seed complete — ${ok} seeded, ${skipped} skipped, ${failed} failed`);
  }

  // ── Publish one ─────────────────────────────────────────────────────────────

  async function publishOne(id: number) {
    setPublishingId(id);
    try {
      const r = await fetch(`/api/owner-console/swms/masters/${id}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ replace: publishReplace }),
      });
      const d = await r.json() as PublishResult;
      setPublishResults((prev) => ({ ...prev, [id]: d }));
      if (d.ok) {
        toast.success(`"${d.title}" pushed to ${d.companies} companies (${d.inserted} new, ${d.updated} updated, ${d.skipped} skipped)`);
      } else {
        toast.error(d.error ?? 'Publish failed');
      }
    } catch (e) {
      setPublishResults((prev) => ({ ...prev, [id]: { ok: false, error: String(e) } }));
      toast.error(String(e instanceof Error ? e.message : e));
    } finally {
      setPublishingId(null);
    }
  }

  // ── Publish all ─────────────────────────────────────────────────────────────

  async function publishAll() {
    setPublishingAll(true);
    setPublishAllResult(null);
    try {
      const r = await fetch('/api/owner-console/swms/masters/publish-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ replace: publishReplace }),
      });
      const d = await r.json() as PublishResult & { masters?: number };
      setPublishAllResult(d);
      if (d.ok) {
        toast.success(`Published ${(d as { masters?: number }).masters ?? 0} masters to ${d.companies} companies`);
      } else {
        toast.error(d.error ?? 'Publish all failed');
      }
    } catch (e) {
      setPublishAllResult({ ok: false, error: String(e) });
      toast.error(String(e instanceof Error ? e.message : e));
    } finally {
      setPublishingAll(false);
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────────

  async function deleteMaster(id: number, title: string) {
    if (!confirm(`Delete master template "${title}"?\n\nThis only removes it from the master library — company copies are not affected.`)) return;
    setDeletingId(id);
    try {
      const r = await fetch(`/api/owner-console/swms/masters/${id}`, {
        method: 'DELETE', credentials: 'include',
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      toast.success(`"${title}" deleted from master library`);
      setMasters((prev) => prev.filter((m) => m.id !== id));
    } catch (e) {
      toast.error(String(e instanceof Error ? e.message : e));
    } finally {
      setDeletingId(null);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={24} className="animate-spin text-orange-500" />
      </div>
    );
  }

  // ── Step 0: Migration needed ─────────────────────────────────────────────────

  if (migrated === false) {
    return (
      <div className="max-w-xl space-y-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
            <Database size={18} className="text-orange-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">One-time setup required</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              The master library needs a quick database migration before it can be used.
              This is safe to run multiple times — it only adds columns if they don't exist.
            </p>
          </div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          <strong>What this does:</strong> Allows <code className="bg-amber-100 px-1 rounded">swms_templates.company_id</code> to be NULL
          (platform masters have no company), adds <code className="bg-amber-100 px-1 rounded">is_platform_master</code> and
          <code className="bg-amber-100 px-1 rounded">source_master_id</code> columns.
        </div>
        <button
          onClick={runMigration}
          disabled={migrating}
          className="flex items-center gap-2 px-6 py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-bold rounded-lg"
        >
          {migrating ? <Loader2 size={16} className="animate-spin" /> : <Database size={16} />}
          {migrating ? 'Running migration…' : 'Run migration'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
            <BookOpen size={18} className="text-orange-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">SWMS Master Library</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Platform-level master templates. Review and edit here, then publish to all companies.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => void loadMasters()}
            className="p-2 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50"
            title="Refresh"
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={() => { setEditTarget(null); setShowEdit(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-lg"
          >
            <Plus size={14} />
            New master
          </button>
        </div>
      </div>

      {/* ── Publish options bar ── */}
      <div className="flex items-center gap-4 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
        <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-slate-700">
          <input
            type="checkbox"
            checked={publishReplace}
            onChange={(e) => setPublishReplace(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-orange-500"
          />
          Replace existing company copies when publishing
        </label>
        <div className="flex-1" />
        {masters.length > 0 && (
          <button
            onClick={publishAll}
            disabled={publishingAll}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-bold rounded-lg"
          >
            {publishingAll ? <Loader2 size={14} className="animate-spin" /> : <Globe size={14} />}
            {publishingAll ? 'Publishing all…' : `Publish all ${masters.length} to companies`}
          </button>
        )}
      </div>

      {/* Publish-all result */}
      {publishAllResult && (
        <div className={`border rounded-xl p-3 flex items-start gap-3 text-sm ${publishAllResult.ok ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
          {publishAllResult.ok
            ? <CheckCircle2 size={15} className="text-green-600 flex-shrink-0 mt-0.5" />
            : <XCircle size={15} className="text-red-600 flex-shrink-0 mt-0.5" />}
          <span className="text-slate-700">
            {publishAllResult.ok
              ? `Published to ${publishAllResult.companies} companies — ${publishAllResult.inserted} new, ${publishAllResult.updated} updated, ${publishAllResult.skipped} skipped`
              : publishAllResult.error}
          </span>
        </div>
      )}

      {/* ── Master list ── */}
      {masters.length === 0 ? (
        <div className="border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center">
          <ShieldCheck size={32} className="text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-semibold">No master templates yet</p>
          <p className="text-slate-400 text-sm mt-1">
            Seed the 24 built-in templates below, or create a new one manually.
          </p>
        </div>
      ) : (
        <div className="border border-slate-200 rounded-2xl overflow-hidden">
          <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center gap-2">
            <ShieldCheck size={13} className="text-slate-400" />
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              {masters.length} master template{masters.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {masters.map((m) => {
              const pr = publishResults[m.id];
              return (
                <div key={m.id} className="px-4 py-3 flex items-center gap-3">
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-800 truncate">{m.title}</span>
                      <StatusBadge status={m.status} />
                      <span className="text-xs text-slate-400">{m.build_mode}</span>
                    </div>
                    {m.category && (
                      <p className="text-xs text-slate-400 mt-0.5">{m.category}</p>
                    )}
                    {pr && (
                      <p className={`text-xs mt-0.5 ${pr.ok ? 'text-green-600' : 'text-red-600'}`}>
                        {pr.ok
                          ? `✓ Pushed to ${pr.companies} companies (${pr.inserted} new, ${pr.updated} updated, ${pr.skipped} skipped)`
                          : `✗ ${pr.error}`}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => { setEditTarget(m); setShowEdit(true); }}
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
                      title="Edit metadata"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => publishOne(m.id)}
                      disabled={publishingId === m.id || publishingAll}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-orange-600 disabled:opacity-40 text-white text-xs font-bold rounded-lg"
                      title="Publish to all companies"
                    >
                      {publishingId === m.id
                        ? <Loader2 size={12} className="animate-spin" />
                        : <Send size={12} />}
                      Publish
                    </button>
                    <button
                      onClick={() => deleteMaster(m.id, m.title)}
                      disabled={deletingId === m.id}
                      className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg"
                      title="Delete master"
                    >
                      {deletingId === m.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Seed panel (collapsible) ── */}
      <div className="border border-slate-200 rounded-2xl overflow-hidden">
        <button
          onClick={() => setShowSeed((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 text-left"
        >
          <div className="flex items-center gap-2">
            <Play size={13} className="text-slate-400" />
            <span className="text-sm font-semibold text-slate-700">Seed built-in templates</span>
            <span className="text-xs text-slate-400">(24 standard SWMS)</span>
          </div>
          {showSeed ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
        </button>

        {showSeed && (
          <div className="px-4 py-4 space-y-4 border-t border-slate-100">
            <p className="text-sm text-slate-500">
              Seeds all 24 built-in SWMS as <strong>platform master templates</strong> in this library.
              They will appear in the list above where you can review, edit, and then publish to companies.
              Uncheck "Replace existing" to skip templates that are already seeded.
            </p>

            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={seedReplace}
                onChange={(e) => setSeedReplace(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-orange-500"
              />
              <span className="text-sm text-slate-700">Replace existing (overwrite already-seeded templates)</span>
            </label>

            <div className="flex items-center gap-3">
              <button
                onClick={runSeedAll}
                disabled={seeding}
                className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-bold rounded-lg"
              >
                {seeding ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                {seeding ? `Seeding… (${seedResults.length}/${SEEDS.length})` : 'Seed all 24 SWMS'}
              </button>
              {seedResults.length > 0 && (
                <button
                  onClick={() => setSeedResults([])}
                  className="flex items-center gap-1.5 px-3 py-2.5 border border-slate-200 text-slate-500 text-sm rounded-lg hover:bg-slate-50"
                >
                  <RefreshCw size={13} />
                  Clear
                </button>
              )}
            </div>

            {/* Seed summary */}
            {seedResults.length > 0 && (
              <div className="flex items-center gap-4 text-sm">
                {seedResults.filter((r) => r.status === 'ok').length > 0 && (
                  <span className="flex items-center gap-1.5 text-green-700">
                    <CheckCircle2 size={13} />{seedResults.filter((r) => r.status === 'ok').length} seeded
                  </span>
                )}
                {seedResults.filter((r) => r.status === 'skipped').length > 0 && (
                  <span className="flex items-center gap-1.5 text-slate-500">
                    <AlertTriangle size={13} />{seedResults.filter((r) => r.status === 'skipped').length} skipped
                  </span>
                )}
                {seedResults.filter((r) => r.status === 'error').length > 0 && (
                  <span className="flex items-center gap-1.5 text-red-600">
                    <XCircle size={13} />{seedResults.filter((r) => r.status === 'error').length} failed
                  </span>
                )}
              </div>
            )}

            {/* Seed rows */}
            {seedResults.length > 0 && (
              <div className="border border-slate-100 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                <div className="divide-y divide-slate-50">
                  {seedResults.map((r) => (
                    <div key={r.name} className="flex items-center gap-3 px-3 py-2">
                      {r.status === 'ok'      && <CheckCircle2 size={12} className="text-green-500 flex-shrink-0" />}
                      {r.status === 'skipped' && <AlertTriangle size={12} className="text-slate-400 flex-shrink-0" />}
                      {r.status === 'error'   && <XCircle size={12} className="text-red-500 flex-shrink-0" />}
                      <span className="text-xs font-semibold text-slate-700 w-48 flex-shrink-0">
                        {SEEDS.find((s) => s.name === r.name)?.label ?? r.name}
                      </span>
                      <span className={`text-xs ${r.status === 'error' ? 'text-red-600' : 'text-slate-400'}`}>{r.message}</span>
                    </div>
                  ))}
                  {seeding && SEEDS.slice(seedResults.length).map((s) => (
                    <div key={s.name} className="flex items-center gap-3 px-3 py-2 opacity-30">
                      <Loader2 size={12} className="text-slate-300 flex-shrink-0 animate-spin" />
                      <span className="text-xs text-slate-400 w-48 flex-shrink-0">{s.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Info ── */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
        <Eye size={14} className="text-blue-500 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-blue-700">
          <strong>Workflow:</strong> Create or edit master templates here → set status to <em>Active</em> when ready →
          click <strong>Publish</strong> to push to all companies. Company copies link back to the master via
          <code className="bg-blue-100 px-1 rounded mx-0.5">source_master_id</code> so you can re-push updates later.
          The <strong>Seed</strong> panel below pushes the 24 built-in templates directly to company libraries
          (bypassing the master review step).
        </p>
      </div>

      {/* Edit modal */}
      {showEdit && (
        <EditModal
          template={editTarget === 'new' ? null : editTarget as MasterTemplate | null}
          onClose={() => setShowEdit(false)}
          onSaved={loadMasters}
        />
      )}
    </div>
  );
}
