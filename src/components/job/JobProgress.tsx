import { useState, useEffect, useCallback, useRef } from 'react';
import {
  AlertCircle, TrendingUp, CheckSquare, Square,
  Plus, Pencil, Trash2, X, Check, Calendar,
} from 'lucide-react';
import {
  type ProgressLine, type Contractor,
  lineTotal, fmt, TRADE_TYPES,
  AssignmentBadge, CreatePOModal,
} from './JobProgressPOModals';

interface Props { jobId: number; }

interface AddForm {
  description: string;
  quantity: string;
  unit: string;
  rate: string;
  startDate: string;
  endDate: string;
}

const EMPTY_FORM: AddForm = { description: '', quantity: '1', unit: '', rate: '0', startDate: '', endDate: '' };

function fmtDate(d: string | null | undefined): string {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return d; }
}

export default function JobProgress({ jobId }: Props) {
  const [lines, setLines] = useState<ProgressLine[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [tradeFilter, setTradeFilter] = useState('');
  const [showCreatePO, setShowCreatePO] = useState(false);

  // Add line form
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<AddForm>(EMPTY_FORM);
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState('');

  // Edit line
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<AddForm>(EMPTY_FORM);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  // Delete confirm
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);

  const pendingRef = useRef<Record<number, { percentComplete?: number; progressNote?: string }>>({});
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const [progRes, contRes] = await Promise.all([
        fetch(`/api/jobs/${jobId}/progress`, { credentials: 'include' }),
        fetch(`/api/customers?type=contractor&status=active`, { credentials: 'include' }),
      ]);
      if (progRes.ok) {
        const d = await progRes.json() as { lines: ProgressLine[] };
        setLines(d.lines ?? []);
      }
      if (contRes.ok) {
        const d = await contRes.json() as { customers: Contractor[] };
        setContractors(d.customers ?? []);
      }
    } catch {
      setError('Failed to load progress.');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { void load(); }, [load]);

  function completedValue(line: ProgressLine): number {
    return lineTotal(line) * (line.percentComplete / 100);
  }

  async function scheduleSave() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const updates = Object.entries(pendingRef.current).map(([id, vals]) => ({ id: parseInt(id), ...vals }));
      if (updates.length === 0) return;
      setSaving(true);
      try {
        const res = await fetch(`/api/jobs/${jobId}/progress`, {
          method: 'PUT', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ updates }),
        });
        if (!res.ok) throw new Error();
        const data = await res.json() as { lines: ProgressLine[] };
        setLines(data.lines ?? []);
        pendingRef.current = {};
      } catch {
        setError('Failed to save progress.');
      } finally {
        setSaving(false);
      }
    }, 800);
  }

  function handlePercent(lineId: number, value: string) {
    const num = Math.max(0, Math.min(100, parseInt(value) || 0));
    setLines((prev) => prev.map((l) => l.id === lineId ? { ...l, percentComplete: num } : l));
    pendingRef.current[lineId] = { ...pendingRef.current[lineId], percentComplete: num };
    void scheduleSave();
  }

  function handleNote(lineId: number, value: string) {
    setLines((prev) => prev.map((l) => l.id === lineId ? { ...l, progressNote: value } : l));
    pendingRef.current[lineId] = { ...pendingRef.current[lineId], progressNote: value };
    void scheduleSave();
  }

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    const visible = filteredLines.map((l) => l.id);
    const allSelected = visible.every((id) => selectedIds.has(id));
    setSelectedIds(allSelected ? new Set() : new Set(visible));
  }

  // ── Add line ──────────────────────────────────────────────────────────────

  async function handleAddLine() {
    setAddError('');
    if (!addForm.description.trim()) { setAddError('Description is required.'); return; }
    setAddSaving(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/progress/lines`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: addForm.description.trim(),
          quantity: addForm.quantity || '1',
          unit: addForm.unit || null,
          rate: addForm.rate || '0',
          startDate: addForm.startDate || null,
          endDate: addForm.endDate || null,
        }),
      });
      if (!res.ok) { const d = await res.json() as { error?: string }; throw new Error(d.error ?? 'Failed'); }
      const data = await res.json() as { lines: ProgressLine[] };
      setLines(data.lines ?? []);
      setAddForm(EMPTY_FORM);
      setShowAddForm(false);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Failed to add line.');
    } finally {
      setAddSaving(false);
    }
  }

  // ── Edit line ─────────────────────────────────────────────────────────────

  function startEdit(line: ProgressLine) {
    setEditId(line.id);
    setEditForm({
      description: line.description,
      quantity: line.quantity,
      unit: line.unit ?? '',
      rate: line.rate,
      startDate: (line as unknown as { startDate?: string | null }).startDate ?? '',
      endDate: (line as unknown as { endDate?: string | null }).endDate ?? '',
    });
    setEditError('');
  }

  async function handleSaveEdit() {
    if (!editId) return;
    setEditError('');
    if (!editForm.description.trim()) { setEditError('Description is required.'); return; }
    setEditSaving(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/progress/lines/${editId}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: editForm.description.trim(),
          quantity: editForm.quantity || '1',
          unit: editForm.unit || null,
          rate: editForm.rate || '0',
          startDate: editForm.startDate || null,
          endDate: editForm.endDate || null,
        }),
      });
      if (!res.ok) { const d = await res.json() as { error?: string }; throw new Error(d.error ?? 'Failed'); }
      const data = await res.json() as { lines: ProgressLine[] };
      setLines(data.lines ?? []);
      setEditId(null);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'Failed to save.');
    } finally {
      setEditSaving(false);
    }
  }

  // ── Delete line ───────────────────────────────────────────────────────────

  async function handleDelete(lineId: number) {
    setDeleteSaving(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/progress/lines/${lineId}`, {
        method: 'DELETE', credentials: 'include',
      });
      if (!res.ok) throw new Error();
      const data = await res.json() as { lines: ProgressLine[] };
      setLines(data.lines ?? []);
      setSelectedIds((prev) => { const n = new Set(prev); n.delete(lineId); return n; });
      setDeleteId(null);
    } catch {
      setError('Failed to delete line.');
    } finally {
      setDeleteSaving(false);
    }
  }

  const filteredLines = tradeFilter
    ? lines.filter((l) => l.tradeType === tradeFilter || (!l.tradeType && tradeFilter === ''))
    : lines;

  const selectedLines = lines.filter((l) => selectedIds.has(l.id));
  const totalValue = lines.reduce((s, l) => s + lineTotal(l), 0);
  const totalCompleted = lines.reduce((s, l) => s + completedValue(l), 0);
  const totalRemaining = totalValue - totalCompleted;
  const overallPct = totalValue > 0 ? Math.round((totalCompleted / totalValue) * 100) : 0;

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-border p-8 flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Shared form fields renderer ───────────────────────────────────────────

  function LineFormFields({ form, onChange, err }: {
    form: AddForm;
    onChange: (f: AddForm) => void;
    err: string;
  }) {
    return (
      <div className="flex flex-col gap-3">
        {err && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-2">
            <AlertCircle size={12} /> {err}
          </p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Description <span className="text-red-500">*</span></label>
            <input
              type="text" value={form.description} placeholder="e.g. Framing — Level 1"
              onChange={(e) => onChange({ ...form, description: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Quantity</label>
            <input
              type="text" value={form.quantity} placeholder="1"
              onChange={(e) => onChange({ ...form, quantity: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Unit</label>
            <input
              type="text" value={form.unit} placeholder="m², hrs, lm…"
              onChange={(e) => onChange({ ...form, unit: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Rate ($)</label>
            <input
              type="text" value={form.rate} placeholder="0.00"
              onChange={(e) => onChange({ ...form, rate: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
          <div />
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1">
              <Calendar size={11} /> Start Date
            </label>
            <input
              type="date" value={form.startDate}
              onChange={(e) => onChange({ ...form, startDate: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1">
              <Calendar size={11} /> End Date
            </label>
            <input
              type="date" value={form.endDate}
              onChange={(e) => onChange({ ...form, endDate: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Header / summary card ── */}
      <div className="bg-white rounded-xl border border-border p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="font-heading font-bold text-sm text-muted-foreground uppercase tracking-wider">Job Progress</h2>
          <div className="flex items-center gap-2 flex-wrap">
            {saving && <span className="text-xs text-muted-foreground">Saving…</span>}
            <button
              onClick={() => { setShowAddForm(true); setAddForm(EMPTY_FORM); setAddError(''); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:bg-primary/90 transition-colors"
            >
              <Plus size={12} /> Add Line
            </button>
          </div>
        </div>

        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-2 mb-3">
            <AlertCircle size={12} /> {error}
          </p>
        )}

        {/* ── Add line form ── */}
        {showAddForm && (
          <div className="mb-4 border border-primary/20 rounded-xl bg-primary/5 p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-primary uppercase tracking-wider">New Progress Line</p>
              <button onClick={() => setShowAddForm(false)} className="text-muted-foreground hover:text-foreground">
                <X size={14} />
              </button>
            </div>
            <LineFormFields form={addForm} onChange={setAddForm} err={addError} />
            <div className="flex items-center gap-2 mt-3 justify-end">
              <button onClick={() => setShowAddForm(false)} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg">
                Cancel
              </button>
              <button
                onClick={() => void handleAddLine()}
                disabled={addSaving}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {addSaving ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> : <Check size={12} />}
                Add Line
              </button>
            </div>
          </div>
        )}

        {lines.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center mb-3">
              <TrendingUp size={18} className="text-muted-foreground" />
            </div>
            <p className="text-sm font-semibold text-foreground mb-1">No progress lines yet</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              Add a line above to start tracking scope, completion and value for this job.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="rounded-lg bg-muted/40 p-3 text-center">
                <p className="text-xs text-muted-foreground mb-0.5">Total Value</p>
                <p className="font-heading font-bold text-sm text-foreground">{fmt(totalValue)}</p>
              </div>
              <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3 text-center">
                <p className="text-xs text-emerald-700 mb-0.5">Completed</p>
                <p className="font-heading font-bold text-sm text-emerald-700">{fmt(totalCompleted)}</p>
              </div>
              <div className="rounded-lg bg-red-50 border border-red-100 p-3 text-center">
                <p className="text-xs text-red-600 mb-0.5">Remaining</p>
                <p className="font-heading font-bold text-sm text-red-600">{fmt(totalRemaining)}</p>
              </div>
            </div>
            <div className="mb-1 flex items-center justify-between text-xs font-semibold">
              <span className="text-muted-foreground">Overall Progress</span>
              <span className="text-foreground">{overallPct}%</span>
            </div>
            <div className="h-2.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${overallPct}%` }} />
            </div>
          </>
        )}
      </div>

      {/* ── Scope lines table ── */}
      {lines.length > 0 && (
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          {/* Toolbar */}
          <div className="px-4 py-3 border-b border-border bg-muted/20 flex items-center gap-2 flex-wrap">
            <select
              value={tradeFilter}
              onChange={(e) => setTradeFilter(e.target.value)}
              className="border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
            >
              <option value="">All trades</option>
              {TRADE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <div className="flex-1" />
            {selectedIds.size > 0 && (
              <>
                <span className="text-xs text-muted-foreground">{selectedIds.size} selected</span>
                <button
                  onClick={() => setShowCreatePO(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:bg-primary/90 transition-colors"
                >
                  <Plus size={12} />Generate PO / Work Order
                </button>
              </>
            )}
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-3 py-3 w-8">
                    <button onClick={toggleAll} className="text-muted-foreground hover:text-foreground">
                      {filteredLines.length > 0 && filteredLines.every((l) => selectedIds.has(l.id))
                        ? <CheckSquare size={14} className="text-primary" />
                        : <Square size={14} />}
                    </button>
                  </th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-muted-foreground">Description</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-muted-foreground whitespace-nowrap">Qty / Unit</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-muted-foreground">Line Total</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-muted-foreground">% Done</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-emerald-700">Completed $</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-muted-foreground">Dates</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-muted-foreground">Assignment</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-muted-foreground">Note</th>
                  <th className="px-3 py-3 w-16" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredLines.map((line) => {
                  const total = lineTotal(line);
                  const done = completedValue(line);
                  const isSelected = selectedIds.has(line.id);
                  const isEditing = editId === line.id;
                  const lineExt = line as unknown as { startDate?: string | null; endDate?: string | null };

                  if (isEditing) {
                    return (
                      <tr key={line.id} className="bg-primary/5">
                        <td colSpan={10} className="px-4 py-4">
                          <LineFormFields form={editForm} onChange={setEditForm} err={editError} />
                          <div className="flex items-center gap-2 mt-3 justify-end">
                            <button onClick={() => setEditId(null)} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg">
                              Cancel
                            </button>
                            <button
                              onClick={() => void handleSaveEdit()}
                              disabled={editSaving}
                              className="flex items-center gap-1.5 px-4 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:bg-primary/90 disabled:opacity-50 transition-colors"
                            >
                              {editSaving ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> : <Check size={12} />}
                              Save
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  if (deleteId === line.id) {
                    return (
                      <tr key={line.id} className="bg-red-50">
                        <td colSpan={10} className="px-4 py-3">
                          <div className="flex items-center gap-3 flex-wrap">
                            <p className="text-sm text-red-700 font-semibold flex-1">Delete "{line.description}"?</p>
                            <button onClick={() => setDeleteId(null)} className="px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground">
                              Cancel
                            </button>
                            <button
                              onClick={() => void handleDelete(line.id)}
                              disabled={deleteSaving}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 disabled:opacity-50 transition-colors"
                            >
                              {deleteSaving ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> : <Trash2 size={12} />}
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={line.id} className={`transition-colors ${isSelected ? 'bg-primary/5' : 'hover:bg-muted/20'}`}>
                      <td className="px-3 py-3">
                        <button onClick={() => toggleSelect(line.id)} className="text-muted-foreground hover:text-foreground">
                          {isSelected ? <CheckSquare size={14} className="text-primary" /> : <Square size={14} />}
                        </button>
                      </td>
                      <td className="px-3 py-3 text-sm text-foreground max-w-[180px]">
                        <p className="truncate">{line.description}</p>
                      </td>
                      <td className="px-3 py-3 text-right text-xs text-muted-foreground whitespace-nowrap">
                        {line.quantity}{line.unit ? ` ${line.unit}` : ''}
                      </td>
                      <td className="px-3 py-3 text-right text-xs font-mono text-foreground whitespace-nowrap">{fmt(total)}</td>
                      <td className="px-3 py-3 text-center">
                        <input
                          type="number" min={0} max={100} value={line.percentComplete}
                          onChange={(e) => handlePercent(line.id, e.target.value)}
                          className="w-16 text-center px-2 py-1 border border-border rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                        />
                      </td>
                      <td className="px-3 py-3 text-right text-xs font-mono font-semibold text-emerald-700 whitespace-nowrap">{fmt(done)}</td>
                      <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {lineExt.startDate || lineExt.endDate ? (
                          <div className="flex flex-col gap-0.5">
                            {lineExt.startDate && <span className="flex items-center gap-1"><Calendar size={10} className="text-blue-400" />{fmtDate(lineExt.startDate)}</span>}
                            {lineExt.endDate && <span className="flex items-center gap-1"><Calendar size={10} className="text-indigo-400" />{fmtDate(lineExt.endDate)}</span>}
                          </div>
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <AssignmentBadge line={line} />
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="text" placeholder="Note…" value={line.progressNote ?? ''}
                          onChange={(e) => handleNote(line.id, e.target.value)}
                          className="w-full min-w-[100px] px-2 py-1 border border-border rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => startEdit(line)}
                            className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                            title="Edit line"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            onClick={() => setDeleteId(line.id)}
                            className="p-1 rounded text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Delete line"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      {showCreatePO && (
        <CreatePOModal
          jobId={jobId}
          selectedLines={selectedLines}
          contractors={contractors}
          onClose={() => setShowCreatePO(false)}
          onCreated={() => {
            setSelectedIds(new Set());
            setShowCreatePO(false);
            void load();
          }}
        />
      )}
    </div>
  );
}
