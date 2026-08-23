import { useState, useEffect, useCallback, useRef } from 'react';
import {
  AlertCircle, TrendingUp, CheckSquare, Square,
  Plus, FileText,
} from 'lucide-react';
import {
  type ProgressLine, type Contractor,
  lineTotal, fmt, TRADE_TYPES,
  AssignmentBadge, CreatePOModal,
} from './JobProgressPOModals';

interface Props { jobId: number; }

export default function JobProgress({ jobId }: Props) {
  const [lines, setLines] = useState<ProgressLine[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [tradeFilter, setTradeFilter] = useState('');
  const [showCreatePO, setShowCreatePO] = useState(false);
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
    scheduleSave();
  }

  function handleNote(lineId: number, value: string) {
    setLines((prev) => prev.map((l) => l.id === lineId ? { ...l, progressNote: value } : l));
    pendingRef.current[lineId] = { ...pendingRef.current[lineId], progressNote: value };
    scheduleSave();
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

  return (
    <div className="flex flex-col gap-4">
      {/* ── Header card ── */}
      <div className="bg-white rounded-xl border border-border p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="font-heading font-bold text-sm text-muted-foreground uppercase tracking-wider">Job Progress</h2>
          <div className="flex items-center gap-2 flex-wrap">
            {saving && <span className="text-xs text-muted-foreground">Saving…</span>}
          </div>
        </div>

        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-2 mb-3">
            <AlertCircle size={12} /> {error}
          </p>
        )}

        {lines.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center mb-3">
              <TrendingUp size={18} className="text-muted-foreground" />
            </div>
            <p className="text-sm font-semibold text-foreground mb-1">No progress activities yet</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              Open the Program of Works to add and manage progress activities for this job.
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

      {/* ── Scope lines with assignment controls ── */}
      {lines.length > 0 && (
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          {/* Toolbar */}
          <div className="px-4 py-3 border-b border-border bg-muted/20 flex items-center gap-2 flex-wrap">
            {/* Trade filter */}
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
                  <th className="text-left px-3 py-3 text-xs font-semibold text-muted-foreground">Assignment</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-muted-foreground">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredLines.map((line) => {
                  const total = lineTotal(line);
                  const done = completedValue(line);
                  const isSelected = selectedIds.has(line.id);
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
