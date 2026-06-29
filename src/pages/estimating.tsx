import { useState, useEffect, useCallback, useRef } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  Calculator, Plus, Pencil, Trash2, Copy, Loader2, AlertCircle,
  BookOpen, ArrowUp, ArrowDown, ChevronDown, ChevronRight, Save, Search, X,
  Upload, Download, FileText,
} from 'lucide-react';
import PortalSidebar from '@/components/PortalSidebar';
import BuildersCalc from '@/components/estimating/BuildersCalc';
import TakeoffPad from '@/components/estimating/TakeoffPad';
import CsvImportModal from '@/components/CsvImportModal';
import { LIMITS } from '@/lib/limits';

// ── Types ─────────────────────────────────────────────────────────────────────
interface CostItem {
  id: number;
  description: string;
  unit: string | null;
  rate: string;
}

interface RecipeLine {
  id?: number;
  description: string;
  quantity: string;
  unit: string | null;
  rate: string;
  lineOrder: number;
}

interface Recipe {
  id: number;
  title: string;
  notes: string | null;
  lines: RecipeLine[];
}

// ── Shared helpers ────────────────────────────────────────────────────────────
const inputCls = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors bg-white';
const labelCls = 'block text-xs font-semibold text-slate-600 mb-1';

let _rk = 0;
function rk() { return `rk-${++_rk}`; }

interface LocalRecipeLine extends RecipeLine { _key: string }

function blankRLine(): LocalRecipeLine {
  return { _key: rk(), description: '', quantity: '1', unit: null, rate: '0', lineOrder: 0 };
}

function lineCalc(l: { quantity: string; rate: string }) {
  return (parseFloat(l.quantity) || 0) * (parseFloat(l.rate) || 0);
}

// ── Cost Guide Item Modal ─────────────────────────────────────────────────────
function CostItemModal({
  initial,
  onSave,
  onClose,
}: {
  initial?: CostItem;
  onSave: (data: { description: string; unit: string; rate: string }) => Promise<void>;
  onClose: () => void;
}) {
  const [description, setDescription] = useState(initial?.description ?? '');
  const [unit, setUnit] = useState(initial?.unit ?? '');
  const [rate, setRate] = useState(initial?.rate ?? '0');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) { setError('Description is required'); return; }
    setSaving(true);
    try {
      await onSave({ description: description.trim(), unit: unit.trim(), rate: rate.trim() || '0' });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md flex flex-col gap-4">
        <h3 className="font-heading font-bold text-base">{initial ? 'Edit Cost Item' : 'New Cost Item'}</h3>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className={labelCls}>Description <span className="text-red-500">*</span></label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} placeholder="e.g. Labour – General" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Unit</label>
              <input value={unit} onChange={(e) => setUnit(e.target.value)} className={inputCls} placeholder="hr, m², ea…" />
            </div>
            <div>
              <label className={labelCls}>Rate ($)</label>
              <input type="number" min="0" step="any" value={rate} onChange={(e) => setRate(e.target.value)} className={inputCls} />
            </div>
          </div>
          {error && (
            <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertCircle size={12} />{error}
            </div>
          )}
          <div className="flex gap-2 justify-end pt-1">
            <button type="button" onClick={onClose} className="text-sm text-slate-500 hover:text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="flex items-center gap-1.5 text-sm font-bold bg-primary hover:bg-orange-600 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              {initial ? 'Save Changes' : 'Add Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Cost Guide Picker (used inside Recipe editor) ─────────────────────────────
function CostGuidePickerModal({
  onInsert,
  onClose,
}: {
  onInsert: (item: CostItem) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<CostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/cost-guide', { credentials: 'include' })
      .then((r) => r.json() as Promise<{ items?: CostItem[] }>)
      .then((d) => setItems(d.items ?? []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = items
    .filter((i) => !search || i.description.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.description.toLowerCase().localeCompare(b.description.toLowerCase()));

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[70vh]">
        <div className="px-5 pt-5 pb-3 border-b border-slate-100 shrink-0 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-heading font-bold text-sm flex items-center gap-2">
              <Calculator size={14} className="text-primary" />Pick from Cost Guide
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Click an item to add it as a recipe line (qty defaults to 1).</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors shrink-0">
            <X size={16} />
          </button>
        </div>
        <div className="px-4 py-2.5 border-b border-slate-100 shrink-0">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search cost items…"
              className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              autoFocus
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading && <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin text-primary" /></div>}
          {!loading && filtered.length === 0 && (
            <div className="text-center py-10 text-slate-400 text-sm">
              {search ? 'No items match your search' : 'No cost items in your guide yet'}
            </div>
          )}
          {!loading && filtered.map((item) => (
            <button
              key={item.id}
              onClick={() => { onInsert(item); onClose(); }}
              className="w-full flex items-center justify-between px-5 py-3 hover:bg-orange-50 border-b border-slate-50 transition-colors text-left"
            >
              <div>
                <div className="text-sm font-medium text-slate-800">{item.description}</div>
                {item.unit && <div className="text-xs text-slate-400">{item.unit}</div>}
              </div>
              <div className="text-sm font-mono font-semibold text-slate-700 shrink-0 ml-4">
                ${parseFloat(item.rate).toFixed(2)}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Recipe Editor Modal ───────────────────────────────────────────────────────
function RecipeModal({
  initial,
  onSave,
  onClose,
}: {
  initial?: Recipe;
  onSave: (data: { title: string; notes: string; lines: LocalRecipeLine[] }) => Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [lines, setLines] = useState<LocalRecipeLine[]>(
    initial?.lines?.length
      ? initial.lines.map((l) => ({ ...l, _key: rk(), unit: l.unit ?? null }))
      : [blankRLine()]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showCostPicker, setShowCostPicker] = useState(false);

  function updateLine(key: string, field: keyof LocalRecipeLine, value: string) {
    setLines((prev) => prev.map((l) => l._key === key ? { ...l, [field]: value } : l));
  }
  function addLine() {
    if (lines.length >= LIMITS.RECIPE_LINES) return;
    setLines((prev) => [...prev, blankRLine()]);
  }
  function deleteLine(key: string) {
    setLines((prev) => { const n = prev.filter((l) => l._key !== key); return n.length ? n : [blankRLine()]; });
  }
  function moveLine(key: string, dir: 'up' | 'down') {
    setLines((prev) => {
      const idx = prev.findIndex((l) => l._key === key);
      if (idx < 0) return prev;
      const next = [...prev];
      const swap = dir === 'up' ? idx - 1 : idx + 1;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  }
  function copyLine(key: string) {
    setLines((prev) => {
      const idx = prev.findIndex((l) => l._key === key);
      if (idx < 0) return prev;
      const copy = { ...prev[idx], _key: rk(), id: undefined };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
  }
  function insertCostItem(item: CostItem) {
    const newLine: LocalRecipeLine = {
      _key: rk(),
      description: item.description,
      quantity: '1',
      unit: item.unit,
      rate: item.rate,
      lineOrder: 0,
    };
    setLines((prev) => {
      // Replace a single blank line
      const filtered = prev.length === 1 && !prev[0].description && prev[0].rate === '0'
        ? [] : prev;
      return [...filtered, newLine];
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError('Title is required'); return; }
    setSaving(true);
    try {
      await onSave({ title: title.trim(), notes: notes.trim(), lines });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        <div className="px-6 pt-6 pb-4 border-b border-slate-100 shrink-0">
          <h3 className="font-heading font-bold text-base">{initial ? 'Edit Recipe' : 'New Recipe'}</h3>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Title <span className="text-red-500">*</span></label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="e.g. Concrete Slab 100mm" autoFocus />
              </div>
              <div>
                <label className={labelCls}>Notes</label>
                <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} placeholder="Optional notes" />
              </div>
            </div>

            {/* Lines */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Lines</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                    lines.length >= LIMITS.RECIPE_LINES
                      ? 'bg-red-50 text-red-600 border-red-200'
                      : lines.length >= LIMITS.RECIPE_LINES * 0.9
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'bg-slate-100 text-slate-400 border-slate-200'
                  }`}>{lines.length} / {LIMITS.RECIPE_LINES}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowCostPicker(true)}
                    className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-primary hover:bg-orange-50 px-2 py-1 rounded-lg transition-colors border border-slate-200 hover:border-primary/30"
                  >
                    <Calculator size={11} />Cost Guide
                  </button>
                  <button
                    type="button"
                    onClick={addLine}
                    disabled={lines.length >= LIMITS.RECIPE_LINES}
                    title={lines.length >= LIMITS.RECIPE_LINES ? `Recipe limit reached (${LIMITS.RECIPE_LINES} lines)` : undefined}
                    className="flex items-center gap-1 text-xs font-bold text-primary hover:bg-orange-50 disabled:opacity-40 disabled:cursor-not-allowed px-2 py-1 rounded-lg transition-colors"
                  >
                    <Plus size={12} />Add Line
                  </button>
                </div>
              </div>
              {lines.length >= LIMITS.RECIPE_LINES && (
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800 mb-2">
                  <AlertCircle size={12} className="shrink-0" />
                  Recipe line limit reached ({LIMITS.RECIPE_LINES} lines). Delete lines to add more.
                </div>
              )}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-xs font-semibold text-slate-500">
                      <th className="text-left px-3 py-2 w-[40%]">Description</th>
                      <th className="text-right px-2 py-2 w-[10%]">Qty</th>
                      <th className="text-left px-2 py-2 w-[10%]">Unit</th>
                      <th className="text-right px-2 py-2 w-[12%]">Rate</th>
                      <th className="text-right px-2 py-2 w-[12%]">Calc</th>
                      <th className="px-2 py-2 w-[16%]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, idx) => (
                      <tr key={line._key} className="border-t border-slate-100">
                        <td className="px-2 py-1.5">
                          <input value={line.description} onChange={(e) => updateLine(line._key, 'description', e.target.value)} placeholder="Description" className="w-full px-2 py-1 border border-transparent rounded text-sm focus:outline-none focus:border-primary/40 focus:bg-orange-50/30 transition-colors" />
                        </td>
                        <td className="px-2 py-1.5">
                          <input type="number" min="0" step="any" value={line.quantity} onChange={(e) => updateLine(line._key, 'quantity', e.target.value)} className="w-full px-2 py-1 border border-transparent rounded text-right text-sm focus:outline-none focus:border-primary/40 focus:bg-orange-50/30 transition-colors" />
                        </td>
                        <td className="px-2 py-1.5">
                          <input value={line.unit ?? ''} onChange={(e) => updateLine(line._key, 'unit', e.target.value)} placeholder="ea" className="w-full px-2 py-1 border border-transparent rounded text-sm focus:outline-none focus:border-primary/40 focus:bg-orange-50/30 transition-colors" />
                        </td>
                        <td className="px-2 py-1.5">
                          <input type="number" min="0" step="any" value={line.rate} onChange={(e) => updateLine(line._key, 'rate', e.target.value)} className="w-full px-2 py-1 border border-transparent rounded text-right text-sm focus:outline-none focus:border-primary/40 focus:bg-orange-50/30 transition-colors" />
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono text-xs text-slate-600">
                          ${lineCalc(line).toFixed(2)}
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="flex items-center gap-0.5 justify-end">
                            <button type="button" onClick={() => moveLine(line._key, 'up')} disabled={idx === 0} className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 transition-colors"><ArrowUp size={11} /></button>
                            <button type="button" onClick={() => moveLine(line._key, 'down')} disabled={idx === lines.length - 1} className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 transition-colors"><ArrowDown size={11} /></button>
                            <button type="button" onClick={() => copyLine(line._key)} className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"><Copy size={11} /></button>
                            <button type="button" onClick={() => deleteLine(line._key)} className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"><Trash2 size={11} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <AlertCircle size={12} />{error}
              </div>
            )}
          </div>

          <div className="px-6 py-4 border-t border-slate-100 flex gap-2 justify-end shrink-0">
            <button type="button" onClick={onClose} className="text-sm text-slate-500 hover:text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="flex items-center gap-1.5 text-sm font-bold bg-primary hover:bg-orange-600 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              {initial ? 'Save Changes' : 'Create Recipe'}
            </button>
          </div>
        </form>
      </div>

      {showCostPicker && (
        <CostGuidePickerModal
          onInsert={insertCostItem}
          onClose={() => setShowCostPicker(false)}
        />
      )}
    </div>
  );
}

// ── Cost Guide Tab ────────────────────────────────────────────────────────────
function CostGuideTab() {
  const [items, setItems] = useState<CostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<CostItem | undefined>();
  const [search, setSearch] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/cost-guide', { credentials: 'include' });
      const data = await res.json() as { items?: CostItem[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to load');
      setItems(data.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load cost guide');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSave(data: { description: string; unit: string; rate: string }) {
    if (editing) {
      const res = await fetch(`/api/cost-guide/${editing.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!res.ok) { const d = await res.json() as { error?: string }; throw new Error(d.error ?? 'Failed'); }
    } else {
      const res = await fetch('/api/cost-guide', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!res.ok) { const d = await res.json() as { error?: string }; throw new Error(d.error ?? 'Failed'); }
    }
    await load();
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this cost item?')) return;
    await fetch(`/api/cost-guide/${id}`, { method: 'DELETE', credentials: 'include' });
    await load();
  }

  async function handleExportCsv() {
    setExportingCsv(true);
    try {
      const res = await fetch('/api/cost-guide/export-csv', { credentials: 'include' });
      if (!res.ok) { alert('Export failed'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cost-guide-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportingCsv(false);
    }
  }

  function downloadTemplate() {
    const csv = 'description,unit,rate\nFix out labour,hr,92\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cost-guide-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  const filtered = items
    .filter((i) => !search || i.description.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.description.toLowerCase().localeCompare(b.description.toLowerCase()));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search cost items…"
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 w-64 bg-white"
          />
          {/* Count / limit badge */}
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
            items.length >= 200
              ? 'bg-red-50 text-red-600 border-red-200'
              : items.length >= 180
              ? 'bg-amber-50 text-amber-700 border-amber-200'
              : 'bg-slate-100 text-slate-500 border-slate-200'
          }`}>
            {items.length} / 200 items
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* CSV actions */}
          <button
            onClick={downloadTemplate}
            className="flex items-center gap-1.5 text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 px-3 py-2 rounded-lg transition-colors"
            title="Download CSV template"
          >
            <FileText size={13} />Template
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-1.5 text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 px-3 py-2 rounded-lg transition-colors"
          >
            <Upload size={13} />Import CSV
          </button>
          <button
            onClick={handleExportCsv}
            disabled={exportingCsv || items.length === 0}
            className="flex items-center gap-1.5 text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-2 rounded-lg transition-colors"
          >
            {exportingCsv ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}Export CSV
          </button>
          <button
            onClick={() => { setEditing(undefined); setShowModal(true); }}
            disabled={items.length >= 200}
            title={items.length >= 200 ? 'Cost Guide limit reached (200 items). Delete unused items to add more.' : undefined}
            className="flex items-center gap-1.5 text-sm font-bold bg-primary hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg transition-colors"
          >
            <Plus size={14} />Cost Item
          </button>
        </div>
      </div>

      {items.length >= 200 && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-sm text-amber-800">
          <AlertCircle size={14} className="shrink-0" />
          Cost Guide limit reached (200 items). Delete unused items before adding more.
        </div>
      )}

      {loading && <div className="flex justify-center py-12"><Loader2 size={22} className="animate-spin text-primary" /></div>}
      {error && <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3"><AlertCircle size={14} />{error}</div>}

      {!loading && !error && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Calculator size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm font-semibold">{search ? 'No items match your search' : 'No cost items yet'}</p>
              {!search && <p className="text-xs mt-1">Add your labour and material rates to build up your cost guide.</p>}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs font-semibold text-slate-500 border-b border-slate-200">
                  <th className="text-left px-4 py-3">Description</th>
                  <th className="text-left px-3 py-3 w-24">Unit</th>
                  <th className="text-right px-3 py-3 w-28">Rate</th>
                  <th className="px-3 py-3 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100 hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800">{item.description}</td>
                    <td className="px-3 py-3 text-slate-500">{item.unit || '—'}</td>
                    <td className="px-3 py-3 text-right font-mono text-slate-700">${parseFloat(item.rate).toFixed(2)}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => { setEditing(item); setShowModal(true); }} className="p-1.5 rounded text-slate-400 hover:text-primary hover:bg-orange-50 transition-colors"><Pencil size={13} /></button>
                        <button onClick={() => handleDelete(item.id)} className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showModal && (
        <CostItemModal
          initial={editing}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditing(undefined); }}
        />
      )}

      {showImportModal && (
        <CsvImportModal
          title="Import Cost Guide CSV"
          uploadUrl="/api/cost-guide/import-csv"
          showDuplicateOption
          onSuccess={() => { load(); }}
          onClose={() => setShowImportModal(false)}
        />
      )}
    </div>
  );
}

// ── Recipes Tab ───────────────────────────────────────────────────────────────
function RecipesTab() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Recipe | undefined>();
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/recipes', { credentials: 'include' });
      const data = await res.json() as { recipes?: Recipe[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to load');
      setRecipes(data.recipes ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load recipes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSave(data: { title: string; notes: string; lines: LocalRecipeLine[] }) {
    const payload = {
      title: data.title,
      notes: data.notes,
      lines: data.lines.map((l, i) => ({
        description: l.description,
        quantity: l.quantity,
        unit: l.unit || null,
        rate: l.rate,
        lineOrder: i,
      })),
    };
    if (editing) {
      const res = await fetch(`/api/recipes/${editing.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const d = await res.json() as { error?: string }; throw new Error(d.error ?? 'Failed'); }
    } else {
      const res = await fetch('/api/recipes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const d = await res.json() as { error?: string }; throw new Error(d.error ?? 'Failed'); }
    }
    await load();
  }

  async function handleDuplicate(recipe: Recipe) {
    const payload = {
      title: `${recipe.title} (Copy)`,
      notes: recipe.notes ?? '',
      lines: recipe.lines.map((l, i) => ({ ...l, lineOrder: i })),
    };
    await fetch('/api/recipes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify(payload),
    });
    await load();
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this recipe?')) return;
    await fetch(`/api/recipes/${id}`, { method: 'DELETE', credentials: 'include' });
    await load();
  }

  function toggleExpand(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <button
          onClick={() => { setEditing(undefined); setShowModal(true); }}
          className="flex items-center gap-1.5 text-sm font-bold bg-primary hover:bg-orange-600 text-white px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={14} />Recipe
        </button>
      </div>

      {loading && <div className="flex justify-center py-12"><Loader2 size={22} className="animate-spin text-primary" /></div>}
      {error && <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3"><AlertCircle size={14} />{error}</div>}

      {!loading && !error && recipes.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 text-center py-16 text-slate-400">
          <BookOpen size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm font-semibold">No recipes yet</p>
          <p className="text-xs mt-1">Build reusable scope assemblies to insert into estimates.</p>
        </div>
      )}

      {!loading && !error && recipes.length > 0 && (
        <div className="flex flex-col gap-2">
          {recipes.map((recipe) => {
            const isOpen = expanded.has(recipe.id);
            const total = recipe.lines.reduce((sum, l) => sum + lineCalc(l), 0);
            return (
              <div key={recipe.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50/60 transition-colors"
                  onClick={() => toggleExpand(recipe.id)}
                >
                  {isOpen ? <ChevronDown size={15} className="text-slate-400 shrink-0" /> : <ChevronRight size={15} className="text-slate-400 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-800 text-sm">{recipe.title}</div>
                    {recipe.notes && <div className="text-xs text-slate-400 truncate">{recipe.notes}</div>}
                  </div>
                  <div className="text-xs text-slate-400 shrink-0">{recipe.lines.length} line{recipe.lines.length !== 1 ? 's' : ''}</div>
                  <div className="text-sm font-mono font-semibold text-slate-700 shrink-0 ml-2">${total.toFixed(2)}</div>
                  <div className="flex items-center gap-1 ml-2" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => { setEditing(recipe); setShowModal(true); }} className="p-1.5 rounded text-slate-400 hover:text-primary hover:bg-orange-50 transition-colors"><Pencil size={13} /></button>
                    <button onClick={() => handleDuplicate(recipe)} className="p-1.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"><Copy size={13} /></button>
                    <button onClick={() => handleDelete(recipe.id)} className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"><Trash2 size={13} /></button>
                  </div>
                </div>

                {isOpen && recipe.lines.length > 0 && (
                  <div className="border-t border-slate-100 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-slate-400 font-semibold">
                          <th className="text-left px-4 py-2">Description</th>
                          <th className="text-right px-3 py-2 w-16">Qty</th>
                          <th className="text-left px-3 py-2 w-16">Unit</th>
                          <th className="text-right px-3 py-2 w-20">Rate</th>
                          <th className="text-right px-3 py-2 w-20">Calc</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recipe.lines.map((l, i) => (
                          <tr key={i} className="border-t border-slate-50">
                            <td className="px-4 py-2 text-slate-700">{l.description || '—'}</td>
                            <td className="px-3 py-2 text-right text-slate-500">{l.quantity}</td>
                            <td className="px-3 py-2 text-slate-500">{l.unit || '—'}</td>
                            <td className="px-3 py-2 text-right font-mono text-slate-600">${parseFloat(l.rate).toFixed(2)}</td>
                            <td className="px-3 py-2 text-right font-mono text-slate-700">${lineCalc(l).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <RecipeModal
          initial={editing}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditing(undefined); }}
        />
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
type Tab = 'cost-guide' | 'recipes' | 'builders-calc' | 'takeoff-pad';

export default function EstimatingPage() {
  const [tab, setTab] = useState<Tab>('cost-guide');

  function openMobileMenu() {
    window.dispatchEvent(new Event('portal:open-menu'));
  }

  return (
    <div className="portal-page">
      <Helmet>
        <title>Estimating Library — IWILLBUILD Portal</title>
        <meta name="description" content="Manage your cost guide and recipe assemblies for the IWILLBUILD estimating engine." />
        <link rel="canonical" href="https://iwillbuild.com/estimating" />
        <meta name="robots" content="noindex" />
        <meta property="og:title" content="Estimating Library — IWILLBUILD Portal" />
        <meta property="og:description" content="Manage your cost guide and recipe assemblies for the IWILLBUILD estimating engine." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://iwillbuild.com/estimating" />
        <meta property="og:image" content="https://iwillbuild.com/og-image.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Estimating Library — IWILLBUILD Portal" />
        <meta name="twitter:description" content="Manage your cost guide and recipe assemblies for the IWILLBUILD estimating engine." />
        <meta name="twitter:image" content="https://iwillbuild.com/og-image.png" />
      </Helmet>
      <PortalSidebar />
      <div className="portal-main">
        {/* Top bar */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center px-4 md:px-6 shrink-0 gap-3">
          <button onClick={openMobileMenu} className="md:hidden p-2 -ml-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
            <Calculator size={20} />
          </button>
          <Calculator size={18} className="text-primary shrink-0" />
          <h1 className="font-heading font-bold text-lg">Estimating Library</h1>
        </header>

        {/* Tabs */}
        <div className="bg-white border-b border-slate-200 px-4 md:px-6 flex gap-1 shrink-0 overflow-x-auto">
          {([
            { key: 'cost-guide',    label: 'Cost Guide' },
            { key: 'recipes',       label: 'Recipes' },
            { key: 'builders-calc', label: 'Builders Calc' },
            { key: 'takeoff-pad',   label: 'Take-off Pad' },
          ] as const).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
                tab === t.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className={tab === 'takeoff-pad' ? 'max-w-3xl' : 'max-w-4xl'}>
            {tab === 'cost-guide'    && <CostGuideTab />}
            {tab === 'recipes'       && <RecipesTab />}
            {tab === 'builders-calc' && <BuildersCalc />}
            {tab === 'takeoff-pad'   && <TakeoffPad />}
          </div>
        </div>
      </div>
    </div>
  );
}
