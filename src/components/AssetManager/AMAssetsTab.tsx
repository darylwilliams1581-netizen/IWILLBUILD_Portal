/**
 * AMAssetsTab — Equipment list: tools, plant, safety gear, hire items
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Search, Wrench, Archive, RotateCcw, Trash2,
  Check, ChevronDown, Loader2, AlertTriangle, Package,
  HardHat, Truck, ShieldCheck, Tag, X,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Asset {
  id: number;
  name: string;
  asset_number: string | null;
  asset_type: string;
  status: string;
  make: string | null;
  model: string | null;
  serial_number: string | null;
  purchase_or_hire: string;
  condition_rating: string | null;
  current_location: string | null;
  assigned_person_name: string | null;
  next_inspection_due: string | null;
  next_service_date: string | null;
  created_at: string;
  archived_at: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const EQUIPMENT_TYPES = [
  { value: 'equipment',   label: 'Equipment',    icon: Wrench,     color: 'bg-purple-100 text-purple-700 border-purple-200' },
  { value: 'plant',       label: 'Plant',        icon: Truck,      color: 'bg-orange-100 text-orange-700 border-orange-200' },
  { value: 'tools',       label: 'Tools',        icon: Wrench,     color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { value: 'safety',      label: 'Safety Gear',  icon: ShieldCheck,color: 'bg-green-100 text-green-700 border-green-200' },
  { value: 'hire',        label: 'Hire Item',    icon: Tag,        color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  { value: 'other',       label: 'Other',        icon: Package,    color: 'bg-slate-100 text-slate-600 border-slate-200' },
];

const STATUS_OPTS = ['active', 'in-use', 'under-repair', 'retired'];

const CONDITION_OPTS = ['excellent', 'good', 'fair', 'poor'];

// ── Badges ────────────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  const t = EQUIPMENT_TYPES.find((x) => x.value === type);
  const color = t?.color ?? 'bg-slate-100 text-slate-600 border-slate-200';
  const label = t?.label ?? type;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${color}`}>
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active:       'bg-emerald-100 text-emerald-700 border-emerald-200',
    'in-use':     'bg-blue-100 text-blue-700 border-blue-200',
    'under-repair':'bg-amber-100 text-amber-700 border-amber-200',
    retired:      'bg-slate-100 text-slate-500 border-slate-200',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${colors[status] ?? 'bg-slate-100 text-slate-500 border-slate-200'}`}>
      {status}
    </span>
  );
}

// ── Add form ──────────────────────────────────────────────────────────────────

interface FormData {
  name: string; asset_number: string; asset_type: string; status: string;
  make: string; model: string; serial_number: string;
  purchase_or_hire: string; current_location: string;
}
const EMPTY: FormData = {
  name: '', asset_number: '', asset_type: 'equipment', status: 'active',
  make: '', model: '', serial_number: '', purchase_or_hire: 'owned', current_location: '',
};

function AddForm({ onSave, onCancel, saving }: {
  onSave: (d: FormData) => void; onCancel: () => void; saving: boolean;
}) {
  const [form, setForm] = useState<FormData>(EMPTY);
  const set = (k: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-3">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">New Equipment</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Name *</label>
          <input value={form.name} onChange={set('name')} placeholder="e.g. Angle Grinder"
            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Asset No.</label>
          <input value={form.asset_number} onChange={set('asset_number')} placeholder="e.g. EQ-001"
            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Category</label>
          <select value={form.asset_type} onChange={set('asset_type')}
            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30">
            {EQUIPMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Owned / Hire</label>
          <select value={form.purchase_or_hire} onChange={set('purchase_or_hire')}
            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30">
            <option value="owned">Owned</option>
            <option value="hire">Hire</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Make</label>
          <input value={form.make} onChange={set('make')} placeholder="e.g. Makita"
            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Model</label>
          <input value={form.model} onChange={set('model')} placeholder="e.g. GA9020"
            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Serial No.</label>
          <input value={form.serial_number} onChange={set('serial_number')} placeholder="e.g. SN123456"
            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Location</label>
          <input value={form.current_location} onChange={set('current_location')} placeholder="e.g. Site A / Depot"
            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400" />
        </div>
      </div>
      <div className="flex items-center gap-2 justify-end pt-1">
        <button onClick={onCancel} className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors">Cancel</button>
        <button onClick={() => onSave(form)} disabled={saving || !form.name.trim()}
          className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50">
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          Add Equipment
        </button>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function AMAssetsTab({ onSelectAsset }: { onSelectAsset: (id: number) => void }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ status: showArchived ? 'archived' : 'active' });
      if (search) params.set('search', search);
      if (typeFilter) params.set('type', typeFilter);
      const r = await fetch(`/api/asset-manager/assets?${params}`, { credentials: 'include' });
      const d = await r.json();
      setAssets(d.assets ?? []);
    } catch { setError('Failed to load equipment'); }
    finally { setLoading(false); }
  }, [search, typeFilter, showArchived]);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(form: FormData) {
    setSaving(true);
    try {
      const r = await fetch('/api/asset-manager/assets', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!r.ok) throw new Error();
      setShowAdd(false);
      load();
    } catch { alert('Failed to add equipment'); }
    finally { setSaving(false); }
  }

  async function handleArchive(id: number, archive: boolean) {
    await fetch(`/api/asset-manager/assets/${id}/archive`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archive }),
    });
    load();
  }

  async function handleDelete(id: number) {
    await fetch(`/api/asset-manager/assets/${id}/permanent`, {
      method: 'DELETE', credentials: 'include',
    });
    setConfirmDelete(null);
    load();
  }

  const isOverdue = (dateStr: string | null) => {
    if (!dateStr) return false;
    return new Date(dateStr) < new Date();
  };

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4">

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search equipment..."
            className="w-full pl-8 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400"
          />
        </div>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30 text-slate-600">
          <option value="">All categories</option>
          {EQUIPMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <button
          onClick={() => setShowArchived((v) => !v)}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition-colors ${
            showArchived ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
          }`}
        >
          <Archive size={13} />
          {showArchived ? 'Archived' : 'Active'}
        </button>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold rounded-lg transition-colors"
        >
          {showAdd ? <X size={13} /> : <Plus size={13} />}
          {showAdd ? 'Cancel' : 'Add'}
        </button>
      </div>

      {/* Add form */}
      {showAdd && <AddForm onSave={handleAdd} onCancel={() => setShowAdd(false)} saving={saving} />}

      {/* States */}
      {loading && (
        <div className="flex items-center justify-center py-12 text-slate-400">
          <Loader2 size={20} className="animate-spin mr-2" /> Loading...
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {/* List */}
      {!loading && !error && (
        <div className="flex flex-col gap-2">
          {assets.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <Package size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">{showArchived ? 'No archived equipment' : 'No equipment yet — add your first item'}</p>
            </div>
          )}
          {assets.map((a) => (
            <div key={a.id}
              className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-3 hover:border-orange-300 hover:shadow-sm transition-all cursor-pointer group"
              onClick={() => onSelectAsset(a.id)}
            >
              {/* Icon */}
              <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                {(() => {
                  const t = EQUIPMENT_TYPES.find((x) => x.value === a.asset_type);
                  const Icon = t?.icon ?? Package;
                  return <Icon size={16} className="text-slate-500" />;
                })()}
              </div>

              {/* Main info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-slate-800 truncate">{a.name}</span>
                  {a.asset_number && (
                    <span className="text-[10px] text-slate-400 font-mono">{a.asset_number}</span>
                  )}
                  <TypeBadge type={a.asset_type} />
                  <StatusBadge status={a.status} />
                  {a.purchase_or_hire === 'hire' && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-yellow-50 text-yellow-700 border-yellow-200">
                      Hire
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                  {(a.make || a.model) && (
                    <span className="text-xs text-slate-400">{[a.make, a.model].filter(Boolean).join(' ')}</span>
                  )}
                  {a.current_location && (
                    <span className="text-xs text-slate-400">📍 {a.current_location}</span>
                  )}
                  {a.assigned_person_name && (
                    <span className="text-xs text-slate-400">👤 {a.assigned_person_name}</span>
                  )}
                  {a.next_inspection_due && (
                    <span className={`text-xs font-medium ${isOverdue(a.next_inspection_due) ? 'text-red-500' : 'text-amber-500'}`}>
                      Insp: {new Date(a.next_inspection_due).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: '2-digit' })}
                    </span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}>
                {showArchived ? (
                  <button onClick={() => handleArchive(a.id, false)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors" title="Restore">
                    <RotateCcw size={14} />
                  </button>
                ) : (
                  <button onClick={() => handleArchive(a.id, true)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors" title="Archive">
                    <Archive size={14} />
                  </button>
                )}
                {confirmDelete === a.id ? (
                  <div className="flex items-center gap-1">
                    <button onClick={() => handleDelete(a.id)}
                      className="px-2 py-1 text-[10px] font-semibold bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors">
                      Confirm
                    </button>
                    <button onClick={() => setConfirmDelete(null)}
                      className="px-2 py-1 text-[10px] font-semibold text-slate-500 hover:text-slate-700 transition-colors">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmDelete(a.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>

              {/* Chevron */}
              <ChevronDown size={14} className="text-slate-300 -rotate-90 shrink-0 group-hover:text-orange-400 transition-colors" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
