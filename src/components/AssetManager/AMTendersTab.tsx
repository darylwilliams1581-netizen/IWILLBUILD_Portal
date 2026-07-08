/**
 * Tenders / Quotes Tab — create, track, award status transitions
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Search, FileText, X, Check, Loader2, ChevronDown, Edit2, AlertTriangle,
} from 'lucide-react';

interface Tender {
  id: number; inspection_id: number | null; asset_id: number; code: string | null;
  contractor_name: string | null; quote_requested_at: string | null; quote_due_at: string | null;
  quote_amount: number | null; award_status: string; notes: string | null;
  created_at: string; archived_at: string | null;
}
interface Inspection { id: number; report_title: string | null; report_no: string | null; asset_name: string; asset_id: number; }

const AWARD_STATUSES = ['draft', 'requested', 'submitted', 'awarded', 'lost', 'withdrawn'];
const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  requested: 'bg-blue-100 text-blue-700',
  submitted: 'bg-cyan-100 text-cyan-700',
  awarded: 'bg-emerald-100 text-emerald-700',
  lost: 'bg-red-100 text-red-700',
  withdrawn: 'bg-slate-100 text-slate-500',
};

const INPUT = 'w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400';
const SELECT = 'w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500/30';
const LABEL = 'block text-xs font-semibold text-slate-500 mb-1';

export default function AMTendersTab() {
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [creating, setCreating] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({ inspection_id: '', code: '', contractor_name: '', quote_requested_at: '', quote_due_at: '', quote_amount: '', notes: '' });
  const [editForm, setEditForm] = useState<Partial<Tender>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const ir = await fetch('/api/asset-manager/inspections?status=active', { credentials: 'include' });
      const id = await ir.json() as { inspections?: Inspection[] };
      setInspections(id.inspections ?? []);

      const allTenders: Tender[] = [];
      for (const insp of (id.inspections ?? []).slice(0, 50)) {
        const dr = await fetch(`/api/asset-manager/inspections/${insp.id}`, { credentials: 'include' });
        const dd = await dr.json() as { tenders?: Tender[] };
        allTenders.push(...(dd.tenders ?? []));
      }
      setTenders(allTenders);
    } catch { setError('Failed to load tenders'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = tenders.filter((t) => {
    if (search && ![(t.code ?? ''), (t.contractor_name ?? '')].some((v) => v.toLowerCase().includes(search.toLowerCase()))) return false;
    if (statusFilter && t.award_status !== statusFilter) return false;
    return true;
  });

  async function handleCreate() {
    if (!form.inspection_id) return setError('Select an inspection');
    setSaving(true);
    try {
      await fetch(`/api/asset-manager/inspections/${form.inspection_id}/tenders`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      setCreating(false);
      setForm({ inspection_id: '', code: '', contractor_name: '', quote_requested_at: '', quote_due_at: '', quote_amount: '', notes: '' });
      await load();
    } catch { setError('Failed to create tender'); }
    finally { setSaving(false); }
  }

  async function handlePatch(id: number) {
    setSaving(true);
    try {
      await fetch(`/api/asset-manager/tenders/${id}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      setEditId(null);
      await load();
    } catch { setError('Failed to update'); }
    finally { setSaving(false); }
  }

  function inspLabel(id: number | null) {
    if (!id) return '—';
    const i = inspections.find((x) => x.id === id);
    return i ? `${i.report_title || i.report_no || `#${id}`} — ${i.asset_name}` : `#${id}`;
  }

  return (
    <div className="p-6 flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tenders…"
            className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400" />
        </div>
        <div className="relative">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg pl-3 pr-8 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500/30 appearance-none">
            <option value="">All statuses</option>
            {AWARD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
        <button onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold rounded-lg transition-colors">
          <Plus size={13} />
          New tender
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
          <AlertTriangle size={14} />{error}
          <button onClick={() => setError('')} className="ml-auto"><X size={13} /></button>
        </div>
      )}

      {creating && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-4">
          <h3 className="text-sm font-bold text-slate-800">New Tender Cycle</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className={LABEL}>Inspection *</label>
              <select value={form.inspection_id} onChange={(e) => setForm((p) => ({ ...p, inspection_id: e.target.value }))} className={SELECT}>
                <option value="">Select inspection…</option>
                {inspections.map((i) => <option key={i.id} value={i.id}>{i.report_title || i.report_no || `#${i.id}`} — {i.asset_name}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL}>Tender Code</label>
              <input value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))} placeholder="e.g. TND-2024-001" className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Contractor</label>
              <input value={form.contractor_name} onChange={(e) => setForm((p) => ({ ...p, contractor_name: e.target.value }))} placeholder="Contractor name" className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Quote Requested</label>
              <input type="date" value={form.quote_requested_at} onChange={(e) => setForm((p) => ({ ...p, quote_requested_at: e.target.value }))} className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Quote Due</label>
              <input type="date" value={form.quote_due_at} onChange={(e) => setForm((p) => ({ ...p, quote_due_at: e.target.value }))} className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Quote Amount ($)</label>
              <input type="number" value={form.quote_amount} onChange={(e) => setForm((p) => ({ ...p, quote_amount: e.target.value }))} placeholder="0.00" className={INPUT} />
            </div>
            <div className="sm:col-span-2">
              <label className={LABEL}>Notes</label>
              <textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} rows={2}
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

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 size={20} className="animate-spin text-slate-400" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FileText size={32} className="text-slate-300 mb-3" />
          <p className="text-sm text-slate-500">No tenders yet</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((tender) => (
            <div key={tender.id} className="bg-white border border-border rounded-xl overflow-hidden hover:border-primary/40 hover:shadow-sm transition-all duration-150">
              {editId === tender.id ? (
                <div className="p-4 flex flex-col gap-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={LABEL}>Contractor</label>
                      <input value={String(editForm.contractor_name ?? tender.contractor_name ?? '')} onChange={(e) => setEditForm((p) => ({ ...p, contractor_name: e.target.value }))} className={INPUT} />
                    </div>
                    <div>
                      <label className={LABEL}>Award Status</label>
                      <select value={String(editForm.award_status ?? tender.award_status)} onChange={(e) => setEditForm((p) => ({ ...p, award_status: e.target.value }))} className={SELECT}>
                        {AWARD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={LABEL}>Quote Amount ($)</label>
                      <input type="number" value={String(editForm.quote_amount ?? tender.quote_amount ?? '')} onChange={(e) => setEditForm((p) => ({ ...p, quote_amount: parseFloat(e.target.value) || undefined }))} className={INPUT} />
                    </div>
                    <div>
                      <label className={LABEL}>Quote Due</label>
                      <input type="date" value={String(editForm.quote_due_at ?? tender.quote_due_at ?? '')} onChange={(e) => setEditForm((p) => ({ ...p, quote_due_at: e.target.value }))} className={INPUT} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 justify-end">
                    <button onClick={() => setEditId(null)} className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors">Cancel</button>
                    <button onClick={() => void handlePatch(tender.id)} disabled={saving}
                      className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50">
                      {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 px-4 py-3 group">
                  <div className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center flex-shrink-0">
                    <FileText size={16} className="text-slate-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {tender.code && <span className="text-xs font-mono text-slate-400">{tender.code}</span>}
                      <span className="text-sm font-semibold text-slate-800">{tender.contractor_name || 'No contractor'}</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[tender.award_status] ?? 'bg-slate-100 text-slate-600'}`}>
                        {tender.award_status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      <span className="text-xs text-slate-500">{inspLabel(tender.inspection_id)}</span>
                      {tender.quote_amount && <span className="text-xs text-slate-500">${Number(tender.quote_amount).toLocaleString('en-AU', { minimumFractionDigits: 2 })}</span>}
                      {tender.quote_due_at && <span className="text-xs text-slate-400">Due {new Date(tender.quote_due_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => { setEditId(tender.id); setEditForm({}); }}
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors">
                      <Edit2 size={13} />
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
