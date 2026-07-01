/**
 * Owner Console → Starter Pack tab
 * Lets the platform owner manually trigger or re-run the starter pack
 * for any company. Shows per-company status and run history.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Package, CheckCircle2, XCircle, RefreshCw, Loader2,
  ChevronDown, AlertTriangle, Clock, Play,
} from 'lucide-react';

interface Company {
  id: number;
  name: string;
  totalUsers: number;
}

interface StarterPackStatus {
  company: {
    id: number;
    name: string;
    starterPackLoaded: boolean;
    starterPackLoadedAt: string | null;
  };
  runs: Array<{
    id: number;
    status: string;
    notes: string | null;
    created_at: string;
  }>;
}

interface SeedResult {
  ok: boolean;
  alreadyLoaded: boolean;
  sections: Record<string, string>;
  errors: string[];
  message: string;
}

interface Props {
  companies: Company[];
}

const SECTION_LABELS: Record<string, string> = {
  project:        'Test Project',
  stakeholders:   'Stakeholders',
  form_templates: 'Form Templates',
  swms_library:   'SWMS Library',
  safety_plan:    'Safety Plan',
  cost_guide:     'Cost Guide',
  fleet_asset:    'Fleet Asset',
};

export default function StarterPackTab({ companies }: Props) {
  const [selectedId, setSelectedId] = useState<number | ''>('');
  const [status, setStatus] = useState<StarterPackStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<SeedResult | null>(null);
  const [force, setForce] = useState(false);

  const fetchStatus = useCallback(async (id: number) => {
    setLoadingStatus(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/owner-console/starter-pack?companyId=${id}`, { credentials: 'include' });
      if (res.ok) setStatus(await res.json());
    } catch {
      // ignore
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) fetchStatus(selectedId as number);
  }, [selectedId, fetchStatus]);

  async function runStarterPack() {
    if (!selectedId) return;
    setRunning(true);
    setLastResult(null);
    try {
      const res = await fetch('/api/owner-console/starter-pack', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: selectedId, force }),
      });
      const data: SeedResult = await res.json();
      setLastResult(data);
      // Refresh status
      await fetchStatus(selectedId as number);
    } catch (e) {
      setLastResult({ ok: false, alreadyLoaded: false, sections: {}, errors: [String(e)], message: 'Request failed' });
    } finally {
      setRunning(false);
    }
  }

  const selected = companies.find((c) => c.id === selectedId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
          <Package size={18} className="text-orange-600" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">Company Starter Pack</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Auto-loads when a new company signs up. Use this panel to manually trigger or re-run seeding for any company.
          </p>
        </div>
      </div>

      {/* What gets seeded */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">What gets seeded</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {Object.entries(SECTION_LABELS).map(([key, label]) => (
            <div key={key} className="flex items-center gap-2 text-sm text-slate-700">
              <CheckCircle2 size={13} className="text-green-500 flex-shrink-0" />
              {label}
            </div>
          ))}
        </div>
      </div>

      {/* Company selector */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-slate-700">Select Company</label>
        <div className="relative">
          <select
            value={selectedId}
            onChange={(e) => {
              setSelectedId(e.target.value ? parseInt(e.target.value) : '');
              setLastResult(null);
            }}
            className="w-full appearance-none bg-white border border-slate-200 rounded-lg px-3 py-2.5 pr-8 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400"
          >
            <option value="">— Choose a company —</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name} (ID: {c.id})</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {/* Status panel */}
      {selectedId && (
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">
              {selected?.name ?? `Company ${selectedId}`}
            </span>
            <button
              onClick={() => fetchStatus(selectedId as number)}
              disabled={loadingStatus}
              className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
            >
              {loadingStatus ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              Refresh
            </button>
          </div>

          <div className="p-4 space-y-4">
            {loadingStatus && (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 size={14} className="animate-spin" />
                Loading status…
              </div>
            )}

            {!loadingStatus && status && (
              <>
                {/* Pack loaded status */}
                <div className="flex items-center gap-3">
                  {status.company.starterPackLoaded ? (
                    <CheckCircle2 size={18} className="text-green-500 flex-shrink-0" />
                  ) : (
                    <XCircle size={18} className="text-slate-400 flex-shrink-0" />
                  )}
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      {status.company.starterPackLoaded ? 'Starter pack loaded' : 'Starter pack not yet loaded'}
                    </p>
                    {status.company.starterPackLoadedAt && (
                      <p className="text-xs text-slate-500 mt-0.5">
                        Loaded at: {new Date(status.company.starterPackLoadedAt).toLocaleString('en-AU')}
                      </p>
                    )}
                  </div>
                </div>

                {/* Run history */}
                {status.runs.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Run History</p>
                    <div className="space-y-1.5">
                      {status.runs.slice(0, 5).map((run) => (
                        <div key={run.id} className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2">
                          <Clock size={11} className="text-slate-400 flex-shrink-0" />
                          <span className={`font-semibold ${run.status === 'success' ? 'text-green-600' : run.status === 'partial' ? 'text-amber-600' : run.status === 'failed' ? 'text-red-600' : 'text-slate-500'}`}>
                            {run.status}
                          </span>
                          <span className="text-slate-400">—</span>
                          <span>{new Date(run.created_at).toLocaleString('en-AU')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Force re-run toggle */}
      {selectedId && status?.company.starterPackLoaded && (
        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={force}
            onChange={(e) => setForce(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-orange-500 focus:ring-orange-400"
          />
          <span className="text-sm text-slate-700">
            Force re-run <span className="text-slate-400">(resets guard and re-seeds; skips items that already exist)</span>
          </span>
        </label>
      )}

      {/* Run button */}
      {selectedId && (
        <button
          onClick={runStarterPack}
          disabled={running || loadingStatus}
          className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-colors"
        >
          {running ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
          {running ? 'Running…' : force ? 'Force Re-run Starter Pack' : 'Load Starter Pack'}
        </button>
      )}

      {/* Result */}
      {lastResult && (
        <div className={`border rounded-xl p-4 space-y-3 ${lastResult.ok && lastResult.errors.length === 0 ? 'border-green-200 bg-green-50' : lastResult.errors.length > 0 ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
          <div className="flex items-center gap-2">
            {lastResult.ok && lastResult.errors.length === 0 ? (
              <CheckCircle2 size={16} className="text-green-600" />
            ) : (
              <AlertTriangle size={16} className="text-amber-600" />
            )}
            <p className="text-sm font-semibold text-slate-800">{lastResult.message}</p>
          </div>

          {Object.keys(lastResult.sections).length > 0 && (
            <div className="space-y-1">
              {Object.entries(lastResult.sections).map(([key, val]) => (
                <div key={key} className="flex items-start gap-2 text-xs text-slate-700">
                  <span className="font-semibold text-slate-500 w-28 flex-shrink-0">{SECTION_LABELS[key] ?? key}:</span>
                  <span className={val.startsWith('ERROR') ? 'text-red-600' : 'text-slate-700'}>{val}</span>
                </div>
              ))}
            </div>
          )}

          {lastResult.errors.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-red-600">Errors:</p>
              {lastResult.errors.map((e, i) => (
                <p key={i} className="text-xs text-red-600 font-mono bg-red-50 rounded px-2 py-1">{e}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
