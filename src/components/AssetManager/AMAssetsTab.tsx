/**
 * Assets Tab — CRUD, search/filter, archive/restore/delete lifecycle
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Search, Building2, Archive, RotateCcw, Trash2,
  Edit2, X, Check, ChevronDown, Loader2, AlertTriangle,
} from 'lucide-react';

interface Asset {
  id: number; name: string; acronym: string | null; address: string | null;
  asset_type: string; status: string; created_at: string; archived_at: string | null;
}

const ASSET_TYPES = ['substation', 'building', 'facility', 'vehicle', 'equipment', 'infrastructure', 'other'];
const STATUS_OPTS = ['active', 'inactive', 'decommissioned'];

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    substation: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
    building: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
    facility: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
    vehicle: 'bg-orange-500/15 text-orange-400 border-orange-500/20',
    equipment: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
    infrastructure: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  };
  const cls = colors[type] ?? 'bg-slate-700/50 text-slate-400 border-slate-600/30';
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cls}`}>{type}</span>;
}

interface AssetFormData {
  name: string; acronym: string; address: string; asset_type: string; status: string;
}

const EMPTY_FORM: AssetFormData = { name: '', acronym: '', address: '', asset_type: 'facility', status: 'active' };

function AssetForm({ initial, onSave, onCancel, saving }: {
  initial: AssetFormData; onSave: (d: AssetFormData) => void; onCancel: () => void; saving: boolean;
}) {
  const [form, setForm] = useState(initial);
  const set = (k: keyof AssetFormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <div className="bg-slate-800 border border-slate-700/60 rounded-xl p-5 flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1">Name *</label>
          <input value={form.name} onChange={set('name')} placeholder="e.g. Substation Alpha"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1">Acronym</label>
          <input value={form.acronym} onChange={set('acronym')} placeholder="e.g. SS-A"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500" />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-slate-400 mb-1">Address / Location</label>
          <input value={form.address} onChange={set('address')} placeholder="e.g. 123 Main St, Brisbane QLD"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1">Asset Type</label>
          <select value={form.asset_type} onChange={set('asset_type')}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500">
            {ASSET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1">Status</label>
          <select value={form.status} onChange={set('status')}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500">
            {STATUS_OPTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div className="flex items-center gap-2 justify-end">
        <button onClick={onCancel} className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors">Cancel</button>
        <button onClick={() => onSave(form)} disabled={saving || !form.name.trim()}
          className="flex items-center gap-1.5 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50">
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          Save
        </button>
      </div>
    </div>
  );
}

export default function AMAssetsTab() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: showArchived ? 'archived' : 'active' });
      if (search) params.set('search', search);
      if (typeFilter) params.set('type', typeFilter);
      const r = await fetch(`/api/asset-manager/assets?${params}`, { credentials: 'include' });
      const d = await r.json() as { assets?: Asset[] };
      setAssets(d.assets ?? []);
    } catch { setError('Failed to load assets'); }
    finally { setLoading(false); }
  }, [search, typeFilter, showArchived]);

  useEffect(() => { void load(); }, [load]);

  async function handleCreate(form: AssetFormData) {
    setSaving(true);
    try {
      const r = await fetch('/api/asset-manager/assets', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!r.ok) throw new Error('Failed');
      setCreating(false);
      await load();
    } catch { setError('Failed to create asset'); }
    finally { setSaving(false); }
  }

  async function handleEdit(id: number, form: AssetFormData) {
    setSaving(true);
    try {
      await fetch(`/api/asset-manager/assets/${id}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      setEditId(null);
      await load();
    } catch { setError('Failed to update'); }
    finally { setSaving(false); }
  }

  async function handleArchive(id: number) {
    await fetch(`/api/asset-manager/assets/${id}/archive`, { method: 'POST', credentials: 'include' });
    await load();
  }

  async function handleRestore(id: number) {
    await fetch(`/api/asset-manager/assets/${id}/restore`, { method: 'POST', credentials: 'include' });
    await load();
  }

  async function handleDelete(id: number) {
    await fetch(`/api/asset-manager/assets/${id}/permanent`, { method: 'DELETE', credentials: 'include' });
    setConfirmDelete(null);
    await load();
  }

  return (
    <div className="p-6 flex flex-col gap-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search assets…"
            className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500" />
        </div>
        <div className="relative">
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg pl-3 pr-8 py-2 text-sm text-slate-300 focus:outline-none focus:border-cyan-500 appearance-none">
            <option value="">All types</option>
            {ASSET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
        </div>
        <button onClick={() => setShowArchived((v) => !v)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${showArchived ? 'bg-amber-500/15 border-amber-500/30 text-amber-400' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'}`}>
          <Archive size={13} />
          {showArchived ? 'Archived' : 'Active'}
        </button>
        <button onClick={() => { setCreating(true); setEditId(null); }}
          className="flex items-center gap-1.5 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white text-xs font-semibold rounded-lg transition-colors">
          <Plus size={13} />
          New asset
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">
          <AlertTriangle size={14} />
          {error}
          <button onClick={() => setError('')} className="ml-auto"><X size={13} /></button>
        </div>
      )}

      {/* Create form */}
      {creating && (
        <AssetForm initial={EMPTY_FORM} onSave={handleCreate} onCancel={() => setCreating(false)} saving={saving} />
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={20} className="animate-spin text-slate-500" />
        </div>
      ) : assets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Building2 size={32} className="text-slate-600 mb-3" />
          <p className="text-sm text-slate-500">{showArchived ? 'No archived assets' : 'No assets yet'}</p>
          {!showArchived && <p className="text-xs text-slate-600 mt-1">Create your first asset to get started</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {assets.map((asset) => (
            <div key={asset.id}>
              {editId === asset.id ? (
                <AssetForm
                  initial={{ name: asset.name, acronym: asset.acronym ?? '', address: asset.address ?? '', asset_type: asset.asset_type, status: asset.status }}
                  onSave={(form) => void handleEdit(asset.id, form)}
                  onCancel={() => setEditId(null)}
                  saving={saving}
                />
              ) : (
                <div className="flex items-center gap-3 bg-slate-800/60 border border-slate-700/50 rounded-xl px-4 py-3 group hover:border-slate-600/60 transition-colors">
                  <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center flex-shrink-0">
                    <Building2 size={16} className="text-cyan-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-200">{asset.name}</span>
                      {asset.acronym && <span className="text-xs text-slate-500 font-mono">({asset.acronym})</span>}
                      <TypeBadge type={asset.asset_type} />
                    </div>
                    {asset.address && <p className="text-xs text-slate-500 mt-0.5 truncate">{asset.address}</p>}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!asset.archived_at ? (
                      <>
                        <button onClick={() => setEditId(asset.id)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-500 hover:text-slate-200 transition-colors" title="Edit">
                          <Edit2 size={13} />
                        </button>
                        <button onClick={() => void handleArchive(asset.id)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-500 hover:text-amber-400 transition-colors" title="Archive">
                          <Archive size={13} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => void handleRestore(asset.id)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-500 hover:text-emerald-400 transition-colors" title="Restore">
                          <RotateCcw size={13} />
                        </button>
                        <button onClick={() => setConfirmDelete(asset.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-colors" title="Delete permanently">
                          <Trash2 size={13} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Confirm delete */}
              {confirmDelete === asset.id && (
                <div className="mt-1 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 flex items-center gap-3">
                  <AlertTriangle size={14} className="text-red-400 flex-shrink-0" />
                  <p className="text-xs text-red-300 flex-1">Permanently delete <strong>{asset.name}</strong>? This cannot be undone.</p>
                  <button onClick={() => void handleDelete(asset.id)} className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors">Delete</button>
                  <button onClick={() => setConfirmDelete(null)} className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors">Cancel</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
