/**
 * Inspections Tab — list, create, edit, photos, share link
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Search, ClipboardCheck, Archive, RotateCcw, Trash2,
  Edit2, X, Check, Loader2, AlertTriangle, Share2, Camera,
  ChevronDown, ExternalLink, Copy,
} from 'lucide-react';
import OutlookEmailButton from '@/components/OutlookEmailButton';
import { useUploadQueue } from '@/hooks/useUploadQueue';

interface Asset { id: number; name: string; acronym: string | null; }
interface Inspection {
  id: number; asset_id: number; report_no: string | null; inspection_date: string | null;
  report_title: string | null; overall_status: string; notes: string | null;
  asset_name: string; asset_acronym: string | null; archived_at: string | null;
  created_at: string;
}

const STATUS_OPTS = ['draft', 'in_progress', 'complete', 'action_required', 'closed'];
const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  in_progress: 'bg-blue-100 text-blue-700',
  complete: 'bg-emerald-100 text-emerald-700',
  action_required: 'bg-red-100 text-red-700',
  closed: 'bg-slate-100 text-slate-500',
};

const INPUT = 'w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-600/30 focus:border-violet-400';
const SELECT = 'w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-600/30';
const LABEL = 'block text-xs font-semibold text-slate-500 mb-1';

export default function AMInspectionsTab() {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [expandId, setExpandId] = useState<number | null>(null);

  // ── Photo upload queue (endpoint changes with expandId) ────────────────────
  const photoQ = useUploadQueue({
    endpoint: expandId ? `/api/asset-manager/inspections/${expandId}/photos` : '/api/asset-manager/inspections/0/photos',
    fieldName: 'file',
    accept: 'image/*,application/pdf',
    multiple: false,
    onSuccess: () => { void load(); },
  });
  const uploadingFor = photoQ.isUploading ? expandId : null;
  const fileRef = photoQ.inputRef;
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [shareResult, setShareResult] = useState<{ id: number; url: string; inspection?: Inspection } | null>(null);
  const [error, setError] = useState('');

  const [form, setForm] = useState({ asset_id: '', report_no: '', inspection_date: '', report_title: '', overall_status: 'draft', notes: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ir, ar] = await Promise.all([
        fetch(`/api/asset-manager/inspections?status=${showArchived ? 'archived' : 'active'}`, { credentials: 'include' }),
        fetch('/api/asset-manager/assets?status=active', { credentials: 'include' }),
      ]);
      const id = await ir.json() as { inspections?: Inspection[] };
      const ad = await ar.json() as { assets?: Asset[] };
      setInspections(id.inspections ?? []);
      setAssets(ad.assets ?? []);
    } catch { setError('Failed to load'); }
    finally { setLoading(false); }
  }, [showArchived]);

  useEffect(() => { void load(); }, [load]);

  const filtered = inspections.filter((i) =>
    !search || [i.report_title, i.report_no, i.asset_name].some((v) => v?.toLowerCase().includes(search.toLowerCase()))
  );

  async function handleCreate() {
    if (!form.asset_id) return setError('Select an asset');
    setSaving(true);
    try {
      await fetch('/api/asset-manager/inspections', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, asset_id: parseInt(form.asset_id, 10) }),
      });
      setCreating(false);
      setForm({ asset_id: '', report_no: '', inspection_date: '', report_title: '', overall_status: 'draft', notes: '' });
      await load();
    } catch { setError('Failed to create'); }
    finally { setSaving(false); }
  }

  async function handlePatch(id: number, data: Record<string, string>) {
    setSaving(true);
    try {
      await fetch(`/api/asset-manager/inspections/${id}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      setEditId(null);
      await load();
    } catch { setError('Failed to update'); }
    finally { setSaving(false); }
  }

  async function handleShare(id: number) {
    const r = await fetch(`/api/asset-manager/inspections/${id}/report/share`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expires_days: 30 }),
    });
    const d = await r.json() as { shareUrl?: string };
    if (d.shareUrl) {
      const insp = inspections.find((i) => i.id === id);
      setShareResult({ id, url: `${window.location.origin}${d.shareUrl}`, inspection: insp });
    }
  }



  return (
    <div className="p-6 flex flex-col gap-5">
      <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden"
        onChange={photoQ.handleInputChange} />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search inspections…"
            className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-600/30 focus:border-violet-400" />
        </div>
        <button onClick={() => setShowArchived((v) => !v)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${showArchived ? 'bg-amber-100 border-amber-200 text-amber-700' : 'bg-white border-slate-200 text-slate-500 hover:text-slate-700'}`}>
          <Archive size={13} />
          {showArchived ? 'Archived' : 'Active'}
        </button>
        <button onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-violet-500 hover:bg-violet-700 text-white text-xs font-semibold rounded-lg transition-colors">
          <Plus size={13} />
          New inspection
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
          <AlertTriangle size={14} />{error}
          <button onClick={() => setError('')} className="ml-auto"><X size={13} /></button>
        </div>
      )}

      {/* Share result */}
      {shareResult && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
          <Share2 size={14} className="text-emerald-600 flex-shrink-0" />
          <p className="text-xs text-emerald-700 flex-1 truncate min-w-0">{shareResult.url}</p>
          <button onClick={() => { void navigator.clipboard.writeText(shareResult.url); }}
            className="flex items-center gap-1 px-2 py-1 bg-emerald-100 rounded text-xs text-emerald-700 hover:bg-emerald-200 transition-colors">
            <Copy size={11} />Copy
          </button>
          <a href={shareResult.url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 px-2 py-1 bg-emerald-100 rounded text-xs text-emerald-700 hover:bg-emerald-200 transition-colors">
            <ExternalLink size={11} />Open
          </a>
          {shareResult.inspection && (
            <OutlookEmailButton
              context={{
                kind: 'asset',
                assetName: shareResult.inspection.asset_name,
                assetAcronym: shareResult.inspection.asset_acronym ?? undefined,
                inspectionTitle: shareResult.inspection.report_title ?? shareResult.inspection.report_no ?? undefined,
                inspectionDate: shareResult.inspection.inspection_date
                  ? new Date(shareResult.inspection.inspection_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
                  : undefined,
                link: shareResult.url,
              }}
              size="xs"
              variant="ghost"
            />
          )}
          <button onClick={() => setShareResult(null)}><X size={13} className="text-slate-400" /></button>
        </div>
      )}

      {/* Create form */}
      {creating && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-4">
          <h3 className="text-sm font-bold text-slate-800">New Inspection</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Asset *</label>
              <select value={form.asset_id} onChange={(e) => setForm((p) => ({ ...p, asset_id: e.target.value }))} className={SELECT}>
                <option value="">Select asset…</option>
                {assets.map((a) => <option key={a.id} value={a.id}>{a.name}{a.acronym ? ` (${a.acronym})` : ''}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL}>Report No.</label>
              <input value={form.report_no} onChange={(e) => setForm((p) => ({ ...p, report_no: e.target.value }))} placeholder="e.g. INS-2024-001" className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Inspection Date</label>
              <input type="date" value={form.inspection_date} onChange={(e) => setForm((p) => ({ ...p, inspection_date: e.target.value }))} className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Status</label>
              <select value={form.overall_status} onChange={(e) => setForm((p) => ({ ...p, overall_status: e.target.value }))} className={SELECT}>
                {STATUS_OPTS.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={LABEL}>Report Title</label>
              <input value={form.report_title} onChange={(e) => setForm((p) => ({ ...p, report_title: e.target.value }))} placeholder="e.g. Annual Condition Assessment" className={INPUT} />
            </div>
            <div className="sm:col-span-2">
              <label className={LABEL}>Notes</label>
              <textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Optional notes…"
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-600/30 resize-none" />
            </div>
          </div>
          <div className="flex items-center gap-2 justify-end">
            <button onClick={() => setCreating(false)} className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors">Cancel</button>
            <button onClick={() => void handleCreate()} disabled={saving || !form.asset_id}
              className="flex items-center gap-1.5 px-4 py-2 bg-violet-500 hover:bg-violet-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50">
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              Create
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 size={20} className="animate-spin text-slate-400" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ClipboardCheck size={32} className="text-slate-300 mb-3" />
          <p className="text-sm text-slate-500">{showArchived ? 'No archived inspections' : 'No inspections yet'}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((insp) => (
            <div key={insp.id} className="bg-white border border-border rounded-xl overflow-hidden hover:border-primary/40 hover:shadow-sm transition-all duration-150">
              <div className="flex items-center gap-3 px-4 py-3 group">
                <div className="w-9 h-9 rounded-lg bg-violet-500/10 border border-violet-600/20 flex items-center justify-center flex-shrink-0">
                  <ClipboardCheck size={16} className="text-violet-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-800">{insp.report_title || `Inspection #${insp.id}`}</span>
                    {insp.report_no && <span className="text-xs text-slate-400 font-mono">{insp.report_no}</span>}
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[insp.overall_status] ?? 'bg-slate-100 text-slate-600'}`}>
                      {insp.overall_status.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {insp.asset_name}{insp.asset_acronym ? ` (${insp.asset_acronym})` : ''}
                    {insp.inspection_date ? ` · ${new Date(insp.inspection_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => setExpandId(expandId === insp.id ? null : insp.id)}
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors" title="Expand">
                    <ChevronDown size={13} className={`transition-transform ${expandId === insp.id ? 'rotate-180' : ''}`} />
                  </button>
                  <button onClick={() => void handleShare(insp.id)}
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-violet-600 transition-colors" title="Share report">
                    <Share2 size={13} />
                  </button>
                  {!insp.archived_at ? (
                    <>
                      <button onClick={() => setEditId(insp.id)}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors" title="Edit">
                        <Edit2 size={13} />
                      </button>
                      <button onClick={() => fetch(`/api/asset-manager/inspections/${insp.id}/archive`, { method: 'POST', credentials: 'include' }).then(() => load())}
                        className="p-1.5 rounded-lg hover:bg-amber-50 text-slate-400 hover:text-amber-600 transition-colors" title="Archive">
                        <Archive size={13} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => fetch(`/api/asset-manager/inspections/${insp.id}/restore`, { method: 'POST', credentials: 'include' }).then(() => load())}
                        className="p-1.5 rounded-lg hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 transition-colors" title="Restore">
                        <RotateCcw size={13} />
                      </button>
                      <button onClick={() => setConfirmDelete(insp.id)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors" title="Delete permanently">
                        <Trash2 size={13} />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Expanded edit / photo upload */}
              {expandId === insp.id && (
                <div className="border-t border-slate-100 px-4 py-3 flex flex-col gap-3 bg-slate-50/60">
                  {editId === insp.id ? (
                    <InspectionEditForm insp={insp} onSave={(d) => void handlePatch(insp.id, d)} onCancel={() => setEditId(null)} saving={saving} />
                  ) : (
                    <div className="flex items-center gap-3">
                      <button onClick={() => setEditId(insp.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold rounded-lg transition-colors">
                        <Edit2 size={12} />Edit details
                      </button>
                      <button
                        onClick={() => { setExpandId(insp.id); fileRef.current?.click(); }}
                        disabled={uploadingFor === insp.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50">
                        {uploadingFor === insp.id ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
                        Add photo/doc
                      </button>
                    </div>
                  )}
                  {insp.notes && <p className="text-xs text-slate-500 italic">{insp.notes}</p>}
                </div>
              )}

              {confirmDelete === insp.id && (
                <div className="border-t border-red-100 bg-red-50 px-4 py-3 flex items-center gap-3">
                  <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />
                  <p className="text-xs text-red-700 flex-1">Permanently delete this inspection? This cannot be undone.</p>
                  <button onClick={() => fetch(`/api/asset-manager/inspections/${insp.id}/permanent`, { method: 'DELETE', credentials: 'include' }).then(() => { setConfirmDelete(null); void load(); })}
                    className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors">Delete</button>
                  <button onClick={() => setConfirmDelete(null)} className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors">Cancel</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InspectionEditForm({ insp, onSave, onCancel, saving }: {
  insp: Inspection; onSave: (d: Record<string, string>) => void; onCancel: () => void; saving: boolean;
}) {
  const [form, setForm] = useState({
    report_no: insp.report_no ?? '',
    inspection_date: insp.inspection_date ?? '',
    report_title: insp.report_title ?? '',
    overall_status: insp.overall_status,
    notes: insp.notes ?? '',
  });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  const INPUT = 'w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-600/30 focus:border-violet-400';
  const SELECT = 'w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-600/30';
  const LABEL = 'block text-xs font-semibold text-slate-500 mb-1';

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <label className={LABEL}>Report No.</label>
        <input value={form.report_no} onChange={set('report_no')} className={INPUT} />
      </div>
      <div>
        <label className={LABEL}>Inspection Date</label>
        <input type="date" value={form.inspection_date} onChange={set('inspection_date')} className={INPUT} />
      </div>
      <div>
        <label className={LABEL}>Report Title</label>
        <input value={form.report_title} onChange={set('report_title')} className={INPUT} />
      </div>
      <div>
        <label className={LABEL}>Status</label>
        <select value={form.overall_status} onChange={set('overall_status')} className={SELECT}>
          {['draft', 'in_progress', 'complete', 'action_required', 'closed'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className={LABEL}>Notes</label>
        <textarea value={form.notes} onChange={set('notes')} rows={2}
          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-600/30 resize-none" />
      </div>
      <div className="sm:col-span-2 flex items-center gap-2 justify-end">
        <button onClick={onCancel} className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors">Cancel</button>
        <button onClick={() => onSave(form)} disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 bg-violet-500 hover:bg-violet-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50">
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          Save
        </button>
      </div>
    </div>
  );
}
