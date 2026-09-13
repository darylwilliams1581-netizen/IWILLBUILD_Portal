/* content-layer-exempt: developer-only admin tool — all text is application UI labels */
/**
 * Owner Console → Repair Seeded Documents tab
 *
 * Fires POST /api/developer/repair-seeded-documents?dryRun=1 first,
 * then (after confirmation) without the flag to execute the repair.
 *
 * Only OC SWMS documents can be damaged (structured envControls, emergencyActions,
 * relatedDocs, competencyRows were incorrectly joined as "[object Object]").
 * Flat SWMS and safety plans are unaffected and will show as "clean".
 */
import { useState } from 'react';
import {
  Wrench, CheckCircle2, XCircle, Loader2, AlertTriangle,
  ChevronDown, ChevronUp, ShieldCheck, Info,
} from 'lucide-react';
import { toast } from 'sonner';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DryRunResponse {
  mode: 'dry-run';
  ok: boolean;
  targetEmail: string;
  companyId: number;
  companyName: string;
  summary: {
    ocSwmsInSeed: number;
    foundInDb: number;
    damaged: number;
    clean: number;
    notFoundInDb: number;
  };
  damagedRows: Array<{ id: number; name: string; existingBlockCount: number; repairedBlockCount: number }>;
  cleanRows: Array<{ id: number; name: string; blockCount: number }>;
  notFoundInDb: string[];
  message: string;
}

interface LiveResponse {
  mode: 'live';
  ok: boolean;
  targetEmail: string;
  companyId: number;
  companyName: string;
  repaired: Array<{ id: number; name: string; blockCount: number }>;
  skipped: string[];
  summary: { repaired: number; skipped: number; errors: number };
  errors: string[];
  message: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Stat({ label, value, colour = 'text-slate-200' }: { label: string; value: string | number; colour?: string }) {
  return (
    <div className="flex flex-col items-center bg-slate-800 rounded-lg px-4 py-2 min-w-[80px]">
      <span className={`text-xl font-bold ${colour}`}>{value}</span>
      <span className="text-[10px] text-slate-400 text-center leading-tight mt-0.5">{label}</span>
    </div>
  );
}

function CollapsibleList({ label, items, variant = 'neutral' }: {
  label: string;
  items: string[];
  variant?: 'repair' | 'clean' | 'neutral';
}) {
  const [open, setOpen] = useState(false);
  const colour = variant === 'repair' ? 'text-amber-400' : variant === 'clean' ? 'text-emerald-400' : 'text-slate-300';
  if (items.length === 0) return null;
  return (
    <div className="mt-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 text-xs font-medium ${colour} hover:opacity-80`}
      >
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {label} ({items.length})
      </button>
      {open && (
        <ul className="mt-1 ml-4 space-y-0.5">
          {items.map((item, i) => (
            <li key={i} className="text-xs text-slate-400 font-mono leading-relaxed">{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RepairSeededDocumentsTab() {
  const [dryRunResult, setDryRunResult] = useState<DryRunResponse | null>(null);
  const [liveResult,   setLiveResult]   = useState<LiveResponse | null>(null);
  const [loading,      setLoading]      = useState<'dry' | 'live' | null>(null);
  const [error,        setError]        = useState<string | null>(null);
  const [confirmed,    setConfirmed]    = useState(false);

  async function runDryRun() {
    setLoading('dry');
    setError(null);
    setDryRunResult(null);
    setLiveResult(null);
    setConfirmed(false);
    try {
      const res = await fetch('/api/developer/repair-seeded-documents?dryRun=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await res.json() as DryRunResponse & { error?: string; detail?: string };
      if (!res.ok || data.error) {
        const msg = [data.error, data.detail].filter(Boolean).join(' — ') || `HTTP ${res.status}`;
        setError(msg);
        toast.error('Dry run failed: ' + msg);
        return;
      }
      setDryRunResult(data);
      if (data.summary.damaged === 0) {
        toast.success('Dry run complete — no damaged documents found');
      } else {
        toast.warning(`Dry run complete — ${data.summary.damaged} damaged document(s) found`);
      }
    } catch (e) {
      setError(String(e));
      toast.error('Dry run error: ' + String(e));
    } finally {
      setLoading(null);
    }
  }

  async function runRepair() {
    if (!confirmed) return;
    setLoading('live');
    setError(null);
    setLiveResult(null);
    try {
      const res = await fetch('/api/developer/repair-seeded-documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await res.json() as LiveResponse & { error?: string; detail?: string };
      if (!res.ok || data.error) {
        const msg = [data.error, data.detail].filter(Boolean).join(' — ') || `HTTP ${res.status}`;
        setError(msg);
        toast.error('Repair failed: ' + msg);
        return;
      }
      setLiveResult(data);
      if (data.ok) {
        toast.success(`Repair complete — ${data.summary.repaired} document(s) rebuilt`);
      } else {
        toast.error(`Repair failed with ${data.summary.errors} error(s) — transaction rolled back`);
      }
    } catch (e) {
      setError(String(e));
      toast.error('Repair error: ' + String(e));
    } finally {
      setLoading(null);
    }
  }

  const dr = dryRunResult;
  const lr = liveResult;

  return (
    <div className="space-y-6 max-w-4xl">

      {/* Header */}
      <div className="flex items-start gap-3">
        <Wrench className="w-6 h-6 text-amber-400 mt-0.5 shrink-0" />
        <div>
          <h2 className="text-lg font-semibold text-white">Repair Seeded Documents</h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Detects and repairs OC SWMS documents whose{' '}
            <code className="text-amber-300 text-xs">builder_json</code> contains{' '}
            <code className="text-red-400 text-xs">[object Object]</code> — the symptom of the
            buggy converter that called <code className="text-xs text-slate-300">.join('\n')</code>{' '}
            on structured-object arrays before the fix was applied.
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <span className="bg-slate-800 text-emerald-400 px-2 py-0.5 rounded">✓ UPDATE only — no INSERT or DELETE</span>
            <span className="bg-slate-800 text-emerald-400 px-2 py-0.5 rounded">✓ Transaction — rolls back on any error</span>
            <span className="bg-slate-800 text-emerald-400 px-2 py-0.5 rounded">✓ Clean rows — untouched</span>
            <span className="bg-slate-800 text-emerald-400 px-2 py-0.5 rounded">✓ Other companies — NOT touched</span>
          </div>
        </div>
      </div>

      {/* Step 1: Dry run */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-amber-600 text-white text-xs flex items-center justify-center font-bold">1</span>
            Dry Run — no database changes
          </h3>
          <button
            onClick={runDryRun}
            disabled={loading !== null}
            className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {loading === 'dry' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
            Run Dry Run
          </button>
        </div>

        {error && !dr && (
          <div className="flex items-start gap-2 bg-red-950 border border-red-800 rounded-lg p-3 text-sm text-red-300">
            <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {dr && (
          <div className="space-y-4">
            {/* Target */}
            <div className="bg-slate-800 rounded-lg p-3 text-sm space-y-1">
              <div className="flex gap-2">
                <span className="text-slate-400 w-32 shrink-0">Target email</span>
                <span className="text-white font-mono">{dr.targetEmail}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-slate-400 w-32 shrink-0">Company</span>
                <span className="text-white">{dr.companyName} <span className="text-slate-500">(ID: {dr.companyId})</span></span>
              </div>
            </div>

            {/* Summary stats */}
            <div>
              <p className="text-xs text-slate-400 mb-2 font-medium uppercase tracking-wide">Scan results</p>
              <div className="flex flex-wrap gap-3">
                <Stat label="OC SWMS in seed" value={dr.summary.ocSwmsInSeed} colour="text-slate-200" />
                <Stat label="Found in DB" value={dr.summary.foundInDb} colour="text-slate-200" />
                <Stat label="Damaged" value={dr.summary.damaged} colour={dr.summary.damaged > 0 ? 'text-red-400' : 'text-emerald-400'} />
                <Stat label="Clean" value={dr.summary.clean} colour="text-emerald-400" />
                <Stat label="Not in DB" value={dr.summary.notFoundInDb} colour={dr.summary.notFoundInDb > 0 ? 'text-yellow-400' : 'text-slate-400'} />
              </div>
            </div>

            {/* Damaged rows */}
            {dr.damagedRows.length > 0 && (
              <div className="bg-red-950 border border-red-800 rounded-lg p-4 space-y-2">
                <p className="text-xs font-semibold text-red-300 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Damaged documents — will be rebuilt
                </p>
                <div className="space-y-1">
                  {dr.damagedRows.map((r) => (
                    <div key={r.id} className="flex items-center gap-3 text-xs">
                      <span className="text-slate-500 font-mono w-10 shrink-0">#{r.id}</span>
                      <span className="text-red-200 font-medium flex-1">{r.name}</span>
                      <span className="text-slate-500">{r.existingBlockCount} blocks → </span>
                      <span className="text-emerald-400 font-medium">{r.repairedBlockCount} blocks</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Clean rows */}
            {dr.cleanRows.length > 0 && (
              <div className="bg-slate-800 rounded-lg p-3">
                <CollapsibleList
                  label="Clean documents (will not be touched)"
                  items={dr.cleanRows.map((r) => `#${r.id} ${r.name} (${r.blockCount} blocks)`)}
                  variant="clean"
                />
              </div>
            )}

            {/* Not found */}
            {dr.notFoundInDb.length > 0 && (
              <div className="bg-slate-800 rounded-lg p-3">
                <CollapsibleList
                  label="Not found in DB (seed not yet run, or already deleted)"
                  items={dr.notFoundInDb}
                  variant="neutral"
                />
              </div>
            )}

            {/* Message */}
            <div className={`flex items-start gap-2 rounded-lg p-3 text-sm ${
              dr.summary.damaged === 0
                ? 'bg-emerald-950 border border-emerald-800 text-emerald-300'
                : 'bg-amber-950 border border-amber-800 text-amber-300'
            }`}>
              {dr.summary.damaged === 0
                ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
              {dr.message}
            </div>
          </div>
        )}
      </div>

      {/* Step 2: Repair */}
      {dr && !lr && dr.summary.damaged > 0 && (
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-amber-600 text-white text-xs flex items-center justify-center font-bold">2</span>
            Execute Repair — UPDATE {dr.summary.damaged} damaged document(s)
          </h3>

          <div className="bg-amber-950 border border-amber-700 rounded-lg p-3 flex items-start gap-2 text-sm text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">
                This will UPDATE {dr.summary.damaged} document(s) — rebuilding their{' '}
                <code className="text-xs">builder_json</code> from the corrected converter.
              </p>
              <p className="text-xs mt-0.5 text-amber-400">
                Any failure rolls back the entire transaction. Clean documents are not touched.
              </p>
            </div>
          </div>

          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="w-4 h-4 rounded accent-amber-500"
            />
            <span className="text-sm text-slate-300">
              I have reviewed the dry-run results and confirm the {dr.summary.damaged} damaged document(s) above should be repaired
            </span>
          </label>

          {error && (
            <div className="flex items-start gap-2 bg-red-950 border border-red-800 rounded-lg p-3 text-sm text-red-300">
              <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <button
            onClick={runRepair}
            disabled={!confirmed || loading !== null}
            className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
          >
            {loading === 'live' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
            Execute Repair
          </button>
        </div>
      )}

      {/* Step 2 (no damage path): nothing to do */}
      {dr && !lr && dr.summary.damaged === 0 && (
        <div className="bg-slate-900 border border-emerald-800 rounded-xl p-5 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <p className="text-sm text-emerald-300 font-medium">
            All {dr.summary.clean} OC SWMS documents are clean — no repair needed.
          </p>
        </div>
      )}

      {/* Step 3: Live results */}
      {lr && (
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            {lr.ok
              ? <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              : <XCircle className="w-5 h-5 text-red-400" />}
            <h3 className="text-sm font-semibold text-white">
              {lr.ok
                ? `Repair complete — ${lr.summary.repaired} document(s) rebuilt`
                : `Repair failed — ${lr.summary.errors} error(s), transaction rolled back`}
            </h3>
          </div>

          <div className="flex flex-wrap gap-3">
            <Stat label="Repaired" value={lr.summary.repaired} colour="text-emerald-400" />
            <Stat label="Skipped (clean)" value={lr.summary.skipped} colour="text-slate-400" />
            <Stat label="Errors" value={lr.summary.errors} colour={lr.summary.errors > 0 ? 'text-red-400' : 'text-slate-400'} />
          </div>

          {lr.repaired.length > 0 && (
            <div className="bg-slate-800 rounded-lg p-3 space-y-1">
              <p className="text-xs font-semibold text-emerald-300 mb-2 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                Repaired documents
              </p>
              {lr.repaired.map((r) => (
                <div key={r.id} className="flex items-center gap-3 text-xs">
                  <span className="text-slate-500 font-mono w-10 shrink-0">#{r.id}</span>
                  <span className="text-emerald-200 font-medium flex-1">{r.name}</span>
                  <span className="text-emerald-400">{r.blockCount} blocks</span>
                </div>
              ))}
            </div>
          )}

          {lr.errors.length > 0 && (
            <div className="bg-red-950 border border-red-800 rounded-lg p-3 space-y-1">
              <p className="text-xs font-semibold text-red-300">Errors (transaction rolled back)</p>
              {lr.errors.map((e, i) => (
                <p key={i} className="text-xs text-red-400 font-mono">{e}</p>
              ))}
            </div>
          )}

          <p className="text-xs text-slate-400 italic">{lr.message}</p>
        </div>
      )}

      {/* Post-repair next steps */}
      {lr?.ok && lr.summary.repaired > 0 && (
        <div className="bg-slate-900 border border-emerald-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-emerald-300 mb-3 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            Next steps — verify the repair
          </h3>
          <ol className="space-y-2 text-sm text-slate-300 list-decimal list-inside">
            <li>Log in as <code className="text-violet-300 text-xs">darylwilliams1581@gmail.com</code></li>
            <li>Go to <strong>Safety → Document Templates</strong></li>
            <li>Open one of the repaired OC SWMS documents (e.g. "Moving Powered Plant")</li>
            <li>Confirm the Document Builder shows readable text — no <code className="text-red-400 text-xs">[object Object]</code> anywhere</li>
            <li>Check Environmental Controls, Emergency Response, Related Documents, and Competency sections specifically</li>
            <li>Once verified, document 111 can be considered for Global Library publish</li>
          </ol>
          <div className="mt-3 flex items-start gap-2 bg-slate-800 rounded-lg p-3 text-xs text-slate-300">
            <Info className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
            <span>
              Block IDs have been regenerated from scratch (b0001, b0002, …). Any Dazza proposals
              referencing old block IDs will need to be re-issued — this is expected and safe.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
