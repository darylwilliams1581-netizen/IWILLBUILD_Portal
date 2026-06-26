import { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, AlertCircle, TrendingUp } from 'lucide-react';

interface ProgressLine {
  id: number;
  description: string;
  quantity: string;
  unit: string | null;
  rate: string;
  percentComplete: number;
  progressNote: string | null;
}

interface Props {
  jobId: number;
}

function lineTotal(line: ProgressLine) {
  const qty = parseFloat(line.quantity) || 0;
  const rate = parseFloat(line.rate) || 0;
  return qty * rate;
}

function completedValue(line: ProgressLine) {
  return lineTotal(line) * (line.percentComplete / 100);
}

function fmt(n: number) {
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2 });
}

export default function JobProgress({ jobId }: Props) {
  const [lines, setLines] = useState<ProgressLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [syncMsg, setSyncMsg] = useState('');
  // Track local edits without re-rendering input on every keystroke
  const pendingRef = useRef<Record<number, { percentComplete?: number; progressNote?: string }>>({});
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/jobs/${jobId}/progress`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setLines(data.lines ?? []);
    } catch {
      setError('Failed to load progress.');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  async function syncFromEstimate() {
    if (!confirm('This will replace current progress lines with lines from the approved estimate. Continue?')) return;
    setSyncing(true);
    setError('');
    setSyncMsg('');
    try {
      const res = await fetch(`/api/jobs/${jobId}/progress/sync`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Sync failed');
      setLines(data.lines ?? []);
      setSyncMsg(`Synced from "${data.estimateTitle}"`);
      pendingRef.current = {};
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  function scheduleSave() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const updates = Object.entries(pendingRef.current).map(([id, vals]) => ({ id: parseInt(id), ...vals }));
      if (updates.length === 0) return;
      setSaving(true);
      try {
        const res = await fetch(`/api/jobs/${jobId}/progress`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ updates }),
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
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
    // Update local state without moving cursor
    setLines((prev) => prev.map((l) => l.id === lineId ? { ...l, percentComplete: num } : l));
    pendingRef.current[lineId] = { ...pendingRef.current[lineId], percentComplete: num };
    scheduleSave();
  }

  function handleNote(lineId: number, value: string) {
    setLines((prev) => prev.map((l) => l.id === lineId ? { ...l, progressNote: value } : l));
    pendingRef.current[lineId] = { ...pendingRef.current[lineId], progressNote: value };
    scheduleSave();
  }

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
      {/* Header */}
      <div className="bg-white rounded-xl border border-border p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading font-bold text-sm text-muted-foreground uppercase tracking-wider">Job Progress</h2>
          <div className="flex items-center gap-2">
            {saving && <span className="text-xs text-muted-foreground">Saving…</span>}
            <button
              onClick={syncFromEstimate}
              disabled={syncing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-border hover:bg-muted disabled:opacity-40 transition-colors"
            >
              <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Syncing…' : 'Sync from Estimate'}
            </button>
          </div>
        </div>

        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-2 mb-3">
            <AlertCircle size={12} /> {error}
          </p>
        )}
        {syncMsg && (
          <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-3">{syncMsg}</p>
        )}

        {lines.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center mb-3">
              <TrendingUp size={18} className="text-muted-foreground" />
            </div>
            <p className="text-sm font-semibold text-foreground mb-1">No approved estimate yet</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              Approve an estimate on the Estimates tab, then click "Sync from Estimate" to set up progress tracking.
            </p>
          </div>
        ) : (
          <>
            {/* Summary bar */}
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

            {/* Progress bar */}
            <div className="mb-1 flex items-center justify-between text-xs font-semibold">
              <span className="text-muted-foreground">Overall Progress</span>
              <span className="text-foreground">{overallPct}%</span>
            </div>
            <div className="h-2.5 bg-muted rounded-full overflow-hidden mb-5">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${overallPct}%` }}
              />
            </div>
          </>
        )}
      </div>

      {/* Lines table */}
      {lines.length > 0 && (
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Description</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-muted-foreground whitespace-nowrap">Qty / Unit</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-muted-foreground">Line Total</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-muted-foreground">% Done</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-emerald-700">Completed $</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-muted-foreground">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lines.map((line) => {
                  const total = lineTotal(line);
                  const done = completedValue(line);
                  return (
                    <tr key={line.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 text-sm text-foreground max-w-[200px]">
                        <p className="truncate">{line.description}</p>
                      </td>
                      <td className="px-3 py-3 text-right text-xs text-muted-foreground whitespace-nowrap">
                        {line.quantity}{line.unit ? ` ${line.unit}` : ''}
                      </td>
                      <td className="px-3 py-3 text-right text-xs font-mono text-foreground whitespace-nowrap">
                        {fmt(total)}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={line.percentComplete}
                          onChange={(e) => handlePercent(line.id, e.target.value)}
                          className="w-16 text-center px-2 py-1 border border-border rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                        />
                      </td>
                      <td className="px-3 py-3 text-right text-xs font-mono font-semibold text-emerald-700 whitespace-nowrap">
                        {fmt(done)}
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="text"
                          placeholder="Note…"
                          value={line.progressNote ?? ''}
                          onChange={(e) => handleNote(line.id, e.target.value)}
                          className="w-full min-w-[120px] px-2 py-1 border border-border rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
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
    </div>
  );
}
