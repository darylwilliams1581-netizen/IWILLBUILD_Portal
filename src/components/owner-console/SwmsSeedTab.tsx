/**
 * Owner Console → SWMS Seed tab
 *
 * One-click UI to seed all 24 SWMS templates into the platform library
 * and push them to all companies. No DevTools console required.
 */
import { useState } from 'react';
import {
  ShieldCheck, Play, Loader2, CheckCircle2, XCircle,
  AlertTriangle, RefreshCw, Send,
} from 'lucide-react';

const SEEDS = [
  { name: 'fencing',               label: 'Fencing' },
  { name: 'carpenter-framing',     label: 'Carpenter – Framing' },
  { name: 'carpenter-fixing',      label: 'Carpenter – Fixing' },
  { name: 'bricklaying',           label: 'Bricklaying' },
  { name: 'concreting-slab',       label: 'Concreting – Slab' },
  { name: 'ceramic-tiling',        label: 'Ceramic Tiling' },
  { name: 'painting',              label: 'Painting' },
  { name: 'landscaping',           label: 'Landscaping' },
  { name: 'ewp',                   label: 'EWP (Elevated Work Platform)' },
  { name: 'cabinets',              label: 'Cabinet Installation' },
  { name: 'carpenter-lockup',      label: 'Carpenter – Lock-up' },
  { name: 'manual-handling',       label: 'Manual Handling' },
  { name: 'underground-services',  label: 'Underground Services' },
  { name: 'live-parts',            label: 'Live Electrical Parts' },
  { name: 'moving-plant',          label: 'Moving Plant' },
  { name: 'excavations-substation',label: 'Excavations – Substation' },
  { name: 'vacuum-excavation',     label: 'Vacuum Excavation' },
  { name: 'traffic-management',    label: 'Traffic Management' },
  { name: 'silica-dust',           label: 'Silica Dust' },
  { name: 'power-tools',           label: 'Power Tools' },
  { name: 'delivery-loading',      label: 'Delivery & Loading' },
  { name: 'environmental-spill',   label: 'Environmental Spill' },
  { name: 'heat-stress',           label: 'Heat Stress' },
  { name: 'building-inspection',   label: 'Building Inspection' },
] as const;

type SeedName = typeof SEEDS[number]['name'];
type Status = 'idle' | 'ok' | 'error' | 'skipped';

interface SeedResult {
  name: SeedName;
  status: Status;
  message: string;
}

interface PushResult {
  ok: boolean;
  pushed?: number;
  companies?: number;
  message?: string;
  error?: string;
}

export default function SwmsSeedTab() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<SeedResult[]>([]);
  const [replace, setReplace] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState<PushResult | null>(null);

  async function runSeedAll() {
    setRunning(true);
    setResults([]);
    setPushResult(null);

    const out: SeedResult[] = [];
    for (const seed of SEEDS) {
      try {
        const url = `/api/owner-console/swms/seed-${seed.name}${replace ? '?replace=1' : ''}`;
        const r = await fetch(url, { method: 'POST', credentials: 'include' });
        const d = await r.json() as { message?: string; error?: string; skipped?: boolean };
        if (r.ok) {
          out.push({ name: seed.name, status: d.skipped ? 'skipped' : 'ok', message: d.message ?? 'Seeded' });
        } else {
          out.push({ name: seed.name, status: 'error', message: d.error ?? `HTTP ${r.status}` });
        }
      } catch (e) {
        out.push({ name: seed.name, status: 'error', message: String(e) });
      }
      // Update incrementally so user sees progress
      setResults([...out]);
    }
    setRunning(false);
  }

  async function runPush() {
    setPushing(true);
    setPushResult(null);
    try {
      const r = await fetch('/api/owner-console/swms/push', { method: 'POST', credentials: 'include' });
      const d = await r.json() as PushResult;
      setPushResult(d);
    } catch (e) {
      setPushResult({ ok: false, error: String(e) });
    } finally {
      setPushing(false);
    }
  }

  const okCount    = results.filter((r) => r.status === 'ok').length;
  const errCount   = results.filter((r) => r.status === 'error').length;
  const skipCount  = results.filter((r) => r.status === 'skipped').length;
  const allDone    = results.length === SEEDS.length;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
          <ShieldCheck size={18} className="text-orange-600" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">SWMS Library Seed</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Seeds all 24 SWMS templates into the platform library, then optionally pushes them to every company.
            Requires platform owner authentication.
          </p>
        </div>
      </div>

      {/* Options */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Options</p>
        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={replace}
            onChange={(e) => setReplace(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-orange-500 focus:ring-orange-400"
          />
          <span className="text-sm text-slate-700">
            Replace existing <span className="text-slate-400">(adds <code className="bg-slate-100 px-1 rounded text-xs">?replace=1</code> — overwrites any already-seeded template)</span>
          </span>
        </label>
      </div>

      {/* Seed button */}
      <div className="flex items-center gap-3">
        <button
          onClick={runSeedAll}
          disabled={running || pushing}
          className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-colors"
        >
          {running ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
          {running ? `Seeding… (${results.length}/${SEEDS.length})` : 'Seed All 24 SWMS'}
        </button>

        {allDone && errCount === 0 && (
          <button
            onClick={runPush}
            disabled={pushing}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-colors"
          >
            {pushing ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            {pushing ? 'Pushing…' : 'Push to All Companies'}
          </button>
        )}

        {allDone && (
          <button
            onClick={() => { setResults([]); setPushResult(null); }}
            className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-600 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors"
          >
            <RefreshCw size={14} />
            Reset
          </button>
        )}
      </div>

      {/* Summary bar */}
      {results.length > 0 && (
        <div className="flex items-center gap-4 text-sm">
          {okCount > 0    && <span className="flex items-center gap-1.5 text-green-700"><CheckCircle2 size={14} />{okCount} seeded</span>}
          {skipCount > 0  && <span className="flex items-center gap-1.5 text-slate-500"><AlertTriangle size={14} />{skipCount} skipped</span>}
          {errCount > 0   && <span className="flex items-center gap-1.5 text-red-600"><XCircle size={14} />{errCount} failed</span>}
        </div>
      )}

      {/* Per-seed results */}
      {results.length > 0 && (
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Seed Results</p>
          </div>
          <div className="divide-y divide-slate-100">
            {results.map((r) => (
              <div key={r.name} className="flex items-center gap-3 px-4 py-2.5">
                {r.status === 'ok'      && <CheckCircle2 size={14} className="text-green-500 flex-shrink-0" />}
                {r.status === 'skipped' && <AlertTriangle size={14} className="text-slate-400 flex-shrink-0" />}
                {r.status === 'error'   && <XCircle size={14} className="text-red-500 flex-shrink-0" />}
                <span className="text-sm font-semibold text-slate-700 w-52 flex-shrink-0">
                  {SEEDS.find((s) => s.name === r.name)?.label ?? r.name}
                </span>
                <span className={`text-xs ${r.status === 'error' ? 'text-red-600' : 'text-slate-400'}`}>
                  {r.message}
                </span>
              </div>
            ))}
            {/* Pending rows */}
            {running && SEEDS.slice(results.length).map((s) => (
              <div key={s.name} className="flex items-center gap-3 px-4 py-2.5 opacity-40">
                <Loader2 size={14} className="text-slate-300 flex-shrink-0 animate-spin" />
                <span className="text-sm text-slate-400 w-52 flex-shrink-0">{s.label}</span>
                <span className="text-xs text-slate-300">Waiting…</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Push result */}
      {pushResult && (
        <div className={`border rounded-xl p-4 flex items-start gap-3 ${pushResult.ok ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
          {pushResult.ok
            ? <CheckCircle2 size={16} className="text-green-600 flex-shrink-0 mt-0.5" />
            : <XCircle size={16} className="text-red-600 flex-shrink-0 mt-0.5" />}
          <div>
            <p className="text-sm font-semibold text-slate-800">
              {pushResult.ok
                ? `Pushed ${pushResult.pushed ?? 0} templates to ${pushResult.companies ?? 0} companies`
                : 'Push failed'}
            </p>
            {(pushResult.message || pushResult.error) && (
              <p className="text-xs text-slate-500 mt-0.5">{pushResult.message ?? pushResult.error}</p>
            )}
          </div>
        </div>
      )}

      {/* Info box */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
        <AlertTriangle size={14} className="text-blue-500 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-blue-700">
          Seeding adds templates to the platform-level SWMS library (<code className="bg-blue-100 px-1 rounded">swms_templates</code> with no company_id).
          "Push to All Companies" copies them into every company's library.
          Use <strong>Replace existing</strong> to overwrite previously seeded templates with the latest content.
        </p>
      </div>
    </div>
  );
}
