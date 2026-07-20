/**
 * Defects Tab — list all defects across inspections, create, edit, status pipeline
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Search, AlertTriangle, X, Check, Loader2, ChevronDown, Edit2, Archive,
} from 'lucide-react';

interface Defect {
  id: number; inspection_id: number; title: string; severity: string;
  location: string | null; description: string | null; due_date: string | null;
  status: string; created_at: string;
}
interface Inspection { id: number; report_title: string | null; report_no: string | null; asset_name: string; }

const SEVERITY_COLORS: Record<string, string> = {
  low: 'bg-slate-100 text-slate-600 border-slate-200',
  med: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  critical: 'bg-red-100 text-red-700 border-red-200',
};
const STATUS_PIPELINE = ['open', 'in_progress', 'resolved'];
const STATUS_COLORS: Record<string, string> = {
  open: 'bg-red-100 text-red-700',
  in_progress: 'bg-blue-100 text-blue-700',
  resolved: 'bg-emerald-100 text-emerald-700',
};

const INPUT = 'w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400';
const SELECT = 'w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500/30';
const LABEL = 'block text-xs font-semibold text-slate-500 mb-1';

export default function AMDefectsTab() {
  const [defects, setDefects] = useState<Defect[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [creating, setCreating] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({ inspection_id: '', title: '', severity: 'med', location: '', description: '', due_date: '' });
  const [editForm, setEditForm] = useState<Partial<Defect & { status: string }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const ir = await fetch('/api/asset-manager/inspections?status=active', { credentials: 'include' });
      const id = await ir.json() as { inspections?: Inspection[] };
      setInspections(id.inspections ?? []);

      const allDefects: Defect[] = [];
      for (const insp of (id.inspections ?? []).slice(0, 50)) {
        const dr = await fetch(`/api/asset-manager/inspections/${insp.id}`, { credentials: 'include' });
        const dd = await dr.json() as { defects?: Defect[] };
        allDefects.push(...(dd.defects ?? []));
      }
      setDefects(allDefects);
    } catch { setError('Failed to load defects'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = defects.filter((d) => {
    if (search && !d.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (severityFilter && d.severity !== severityFilter) return false;
    if (statusFilter && d.status !== statusFilter) return false;
    return true;
  });

  async function handleCreate() {
    if (!form.inspection_id || !form.title.trim()) return setError('Inspection and title required');
    setSaving(true);
    try {
      await fetch(`/api/asset-manager/inspections/${form.inspection_id}/defects`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      setCreating(false);
      setForm({ inspection_id: '', title: '', severity: 'med', location: '', description: '', due_date: '' });
      await load();
    } catch { setError('Failed to create defect'); }
    finally { setSaving(false); }
  }

  async function handlePatch(id: number) {
    setSaving(true);
    try {
      await fetch(`/api/asset-manager/defects/${id}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      setEditId(null);
      await load();
    } catch { setError('Failed to update'); }
    finally { setSaving(false); }
  }

  async function advanceStatus(defect: Defect) {
    const idx = STATUS_PIPELINE.indexOf(defect.status);
    const next = STATUS_PIPELINE[Math.min(idx + 1, STATUS_PIPELINE.length - 1)];
    if (next === defect.status) return;
    await fetch(`/api/asset-manager/defects/${defect.id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
    await load();
  }

  function inspLabel(id: number) {
    const i = inspections.find((x) => x.id === id);
    return i ? (i.report_title || i.report_no || `Inspection #${id}`) : `#${id}`;
  }

  return (
    <div className="p-6 flex flex-col gap-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search defects…"
            className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400" />
        </div>
        <div className="relative">
          <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg pl-3 pr-8 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500/30 appearance-none">
            <option value="">All severities</option>
            {['low', 'med', 'high', 'critical'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
        <div className="relative">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg pl-3 pr-8 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500/30 appearance-none">
            <option value="">All statuses</option>
            {STATUS_PIPELINE.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
          <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
        <button onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold rounded-lg transition-colors">
          <Plus size={13} />
          New defect
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
          <AlertTriangle size={14} />{error}
          <button onClick={() => setError('')} className="ml-auto"><X size={13} /></button>
        </div>
      )}

      {/* Create form */}
      {creating && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-4">
          <h3 className="text-sm font-bold text-slate-800">New Defect</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Inspection *</label>
              <select value={form.inspection_id} onChange={(e) => setForm((p) => ({ ...p, inspection_id: e.target.value }))} className={SELECT}>
                <option value="">Select inspection…</option>
                {inspections.map((i) => <option key={i.id} value={i.id}>{i.report_title || i.report_no || `#${i.id}`} — {i.asset_name}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL}>Severity</label>
              <select value={form.severity} onChange={(e) => setForm((p) => ({ ...p, severity: e.target.value }))} className={SELECT}>
                {['low', 'med', 'high', 'critical'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={LABEL}>Title *</label>
              <input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="e.g. Corroded cable tray section" className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Location</label>
              <input value={form.location} onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))} placeholder="e.g. Bay 3, Level 2" className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Due Date</label>
              <input type="date" value={form.due_date} onChange={(e) => setForm((p) => ({ ...p, due_date: e.target.value }))} className={INPUT} />
            </div>
            <div className="sm:col-span-2">
              <label className={LABEL}>Description</label>
              <textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} rows={2}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 resize-none" />
            </div>
          </div>
          <div className="flex items-center gap-2 justify-end">
            <button onClick={() => setCreating(false)} className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors">Cancel</button>
            <button onClick={() => void handleCreate()} disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50">
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
          <AlertTriangle size={32} className="text-slate-300 mb-3" />
          <p className="text-sm text-slate-500">No defects found</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((defect) => (
            <div key={defect.id} className="bg-white border border-border rounded-xl overflow-hidden hover:border-primary/40 hover:shadow-sm transition-all duration-150">
              {editId === defect.id ? (
                <div className="p-4 flex flex-col gap-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={LABEL}>Title</label>
                      <input value={editForm.title ?? defect.title} onChange={(e) => setEditForm((p) => ({ ...p, title: e.target.value }))} className={INPUT} />
                    </div>
                    <div>
                      <label className={LABEL}>Severity</label>
                      <select value={editForm.severity ?? defect.severity} onChange={(e) => setEditForm((p) => ({ ...p, severity: e.target.value }))} className={SELECT}>
                        {['low', 'med', 'high', 'critical'].map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={LABEL}>Status</label>
                      <select value={editForm.status ?? defect.status} onChange={(e) => setEditForm((p) => ({ ...p, status: e.target.value }))} className={SELECT}>
                        {STATUS_PIPELINE.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={LABEL}>Due Date</label>
                      <input type="date" value={editForm.due_date ?? defect.due_date ?? ''} onChange={(e) => setEditForm((p) => ({ ...p, due_date: e.target.value }))} className={INPUT} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 justify-end">
                    <button onClick={() => setEditId(null)} className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors">Cancel</button>
                    <button onClick={() => void handlePatch(defect.id)} disabled={saving}
                      className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50">
                      {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 px-4 py-3 group">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${SEVERITY_COLORS[defect.severity] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                        {defect.severity}
                      </span>
                      <span className="text-sm font-semibold text-slate-800">{defect.title}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      <span className="text-xs text-slate-500">{inspLabel(defect.inspection_id)}</span>
                      {defect.location && <span className="text-xs text-slate-400">@ {defect.location}</span>}
                      {defect.due_date && <span className="text-xs text-slate-400">Due {new Date(defect.due_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span>}
                    </div>
                  </div>
                  <button onClick={() => void advanceStatus(defect)}
                    className={`flex-shrink-0 text-[10px] font-semibold px-2.5 py-1 rounded-full transition-colors cursor-pointer hover:opacity-80 ${STATUS_COLORS[defect.status] ?? 'bg-slate-100 text-slate-600'}`}
                    title="Click to advance status">
                    {defect.status.replace('_', ' ')}
                  </button>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => { setEditId(defect.id); setEditForm({}); }}
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors">
                      <Edit2 size={13} />
                    </button>
                    <button onClick={() => fetch(`/api/asset-manager/defects/${defect.id}/archive`, { method: 'POST', credentials: 'include' }).then(() => load())}
                      className="p-1.5 rounded-lg hover:bg-amber-50 text-slate-400 hover:text-amber-600 transition-colors">
                      <Archive size={13} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
