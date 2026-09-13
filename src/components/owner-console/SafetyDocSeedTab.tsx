/* content-layer-exempt: developer-only admin tool — all text is application UI labels */
/**
 * Owner Console → Safety Doc Seed tab
 *
 * Fires POST /api/developer/seed-safety-documents with ?dryRun=1 first,
 * then (after confirmation) without the flag to execute the real import.
 *
 * Target: darylwilliams1581@gmail.com (hardcoded in the endpoint).
 * Destination: document_templates (SWMS + safety plans) + form_templates.
 * Does NOT touch: swms_templates, cost_guide_items, global library.
 */
import { useState } from 'react';
import {
  Play, CheckCircle2, XCircle, Loader2, AlertTriangle,
  ChevronDown, ChevronUp, Database, FileText, ClipboardList,
  ShieldCheck, Info, Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DryRunResponse {
  mode: 'dry-run';
  ok: boolean;
  targetEmail: string;
  companyId: number;
  companyName: string;
  existingCounts: { documentTemplates: number; formTemplates: number };
  sourceTotals: { swms: number; safetyPlans: number; forms: number; total: number; note: string };
  swms: { sourceTotal: number; wouldInsert: string[]; wouldInsertCount: number; wouldSkip: string[]; wouldSkipCount: number };
  safetyPlans: { sourceTotal: number; wouldInsert: string[]; wouldInsertCount: number; wouldSkip: string[]; wouldSkipCount: number };
  forms: { sourceTotal: number; wouldInsert: string[]; wouldInsertCount: number; wouldSkip: string[]; wouldSkipCount: number };
  semanticDuplicateMapping: Record<string, string>;
  untouchedTables: Record<string, string>;
  destination: Record<string, string>;
  message: string;
}

interface LiveResponse {
  mode: 'live';
  ok: boolean;
  targetEmail: string;
  companyId: number;
  companyName: string;
  results: {
    swmsDocuments: { inserted: number; skipped: number; errors: string[]; insertedItems: Array<{ id: number; title: string }>; skippedTitles: string[] };
    safetyPlans:   { inserted: number; skipped: number; errors: string[]; insertedItems: Array<{ id: number; title: string }>; skippedTitles: string[] };
    formTemplates: { inserted: number; skipped: number; errors: string[]; insertedItems: Array<{ id: number; title: string; fieldCount: number }>; skippedTitles: string[] };
  };
  summary: { totalInserted: number; totalSkipped: number; totalErrors: number };
  errors: string[];
  verification: {
    documentTemplates: {
      totalForCompany: number;
      swmsCount: number;
      safetyPlanCount: number;
      sampleSwmsFlat: { id: number; name: string; blockCount: number } | null;
      sampleSwmsOc:   { id: number; name: string; blockCount: number } | null;
      samplePlan:     { id: number; name: string; blockCount: number } | null;
    };
    formTemplates: {
      totalForCompany: number;
      sampleForm: { id: number; name: string; fieldCount: number; isActive: boolean } | null;
      draftMechanism: string;
    };
    globalLibraryUntouched: boolean;
    swmsTemplatesUntouched: boolean;
  };
  message: string;
}

// ── Collapsible list ──────────────────────────────────────────────────────────

function CollapsibleList({ label, items, variant = 'neutral' }: {
  label: string;
  items: string[];
  variant?: 'insert' | 'skip' | 'neutral';
}) {
  const [open, setOpen] = useState(false);
  const colour = variant === 'insert' ? 'text-emerald-400' : variant === 'skip' ? 'text-yellow-400' : 'text-slate-300';
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

// ── Stat pill ─────────────────────────────────────────────────────────────────

function Stat({ label, value, colour = 'text-slate-200' }: { label: string; value: string | number; colour?: string }) {
  return (
    <div className="flex flex-col items-center bg-slate-800 rounded-lg px-4 py-2 min-w-[80px]">
      <span className={`text-xl font-bold ${colour}`}>{value}</span>
      <span className="text-[10px] text-slate-400 text-center leading-tight mt-0.5">{label}</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SafetyDocSeedTab() {
  const [dryRunResult, setDryRunResult] = useState<DryRunResponse | null>(null);
  const [liveResult,   setLiveResult]   = useState<LiveResponse | null>(null);
  const [loading,      setLoading]      = useState<'dry' | 'live' | 'deleteDry' | 'deleteLive' | null>(null);
  const [error,        setError]        = useState<string | null>(null);
  const [confirmed,    setConfirmed]    = useState(false);
  const [showSemanticMap, setShowSemanticMap] = useState(false);

  // Delete state
  const [deleteDryResult, setDeleteDryResult] = useState<{
    wouldDelete: { documentTemplates: { count: number; names: string[] }; formTemplates: { count: number; names: string[] } };
    notFound: { documentTemplates: string[]; formTemplates: string[] };
    companyName: string; companyId: number; message: string;
  } | null>(null);
  const [deleteResult, setDeleteResult] = useState<{ deleted: { documentTemplates: { count: number }; formTemplates: { count: number } }; message: string } | null>(null);
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function runDeleteDryRun() {
    setLoading('deleteDry');
    setDeleteError(null);
    setDeleteDryResult(null);
    setDeleteResult(null);
    setDeleteConfirmed(false);
    try {
      const res = await fetch('/api/developer/delete-seeded-documents?dryRun=1', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || data.error) { setDeleteError(data.error || `HTTP ${res.status}`); return; }
      setDeleteDryResult(data);
      toast.success('Delete dry run complete — review before confirming');
    } catch (e) {
      setDeleteError(String(e));
    } finally {
      setLoading(null);
    }
  }

  async function runDeleteLive() {
    if (!deleteConfirmed) return;
    setLoading('deleteLive');
    setDeleteError(null);
    setDeleteResult(null);
    try {
      const res = await fetch('/api/developer/delete-seeded-documents', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || data.error) { setDeleteError(data.error || `HTTP ${res.status}`); return; }
      setDeleteResult(data);
      // Reset seed state so user can re-run dry run fresh
      setDryRunResult(null);
      setLiveResult(null);
      setConfirmed(false);
      toast.success(`Deleted ${data.deleted.documentTemplates.count} doc templates + ${data.deleted.formTemplates.count} form templates`);
    } catch (e) {
      setDeleteError(String(e));
    } finally {
      setLoading(null);
    }
  }

  async function runDryRun() {
    setLoading('dry');
    setError(null);
    setDryRunResult(null);
    setLiveResult(null);
    setConfirmed(false);
    try {
      const res = await fetch('/api/developer/seed-safety-documents?dryRun=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await res.json() as DryRunResponse & { error?: string; detail?: string; sourceMismatch?: string[] };
      if (!res.ok || data.error) {
        const msg = data.sourceMismatch
          ? `Source mismatch: ${data.sourceMismatch.join('; ')}`
          : [data.error, data.detail].filter(Boolean).join(' — ') || `HTTP ${res.status}`;
        setError(msg);
        toast.error('Dry run failed: ' + msg);
        return;
      }
      setDryRunResult(data);
      toast.success('Dry run complete — review results before importing');
    } catch (e) {
      setError(String(e));
      toast.error('Dry run error: ' + String(e));
    } finally {
      setLoading(null);
    }
  }

  async function runLiveImport() {
    if (!confirmed) return;
    setLoading('live');
    setError(null);
    setLiveResult(null);
    try {
      const res = await fetch('/api/developer/seed-safety-documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await res.json() as LiveResponse & { error?: string; detail?: string };
      if (!res.ok || data.error) {
        const msg = [data.error, data.detail].filter(Boolean).join(' — ') || `HTTP ${res.status}`;
        setError(msg);
        toast.error('Import failed: ' + msg);
        return;
      }
      setLiveResult(data);
      if (data.ok) {
        toast.success(`Import complete — ${data.summary.totalInserted} records inserted`);
      } else {
        toast.warning(`Import finished with ${data.summary.totalErrors} error(s) — transaction rolled back`);
      }
    } catch (e) {
      setError(String(e));
      toast.error('Import error: ' + String(e));
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
        <Database className="w-6 h-6 text-violet-400 mt-0.5 shrink-0" />
        <div>
          <h2 className="text-lg font-semibold text-white">Safety Document Seed</h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Imports SWMS drafts, safety plan drafts, and form templates into{' '}
            <code className="text-violet-300 text-xs">document_templates</code> /{' '}
            <code className="text-violet-300 text-xs">form_templates</code> for{' '}
            <code className="text-violet-300 text-xs">darylwilliams1581@gmail.com</code>.
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <span className="bg-slate-800 text-emerald-400 px-2 py-0.5 rounded">✓ swms_templates — NOT touched</span>
            <span className="bg-slate-800 text-emerald-400 px-2 py-0.5 rounded">✓ cost_guide_items — NOT touched</span>
            <span className="bg-slate-800 text-emerald-400 px-2 py-0.5 rounded">✓ Global Library — NOT touched</span>
            <span className="bg-slate-800 text-emerald-400 px-2 py-0.5 rounded">✓ Other companies — NOT touched</span>
          </div>
        </div>
      </div>

      {/* Step 1: Dry run */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-violet-600 text-white text-xs flex items-center justify-center font-bold">1</span>
            Dry Run — no database changes
          </h3>
          <button
            onClick={runDryRun}
            disabled={loading !== null}
            className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {loading === 'dry' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
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
              <div className="flex gap-2">
                <span className="text-slate-400 w-32 shrink-0">Existing docs</span>
                <span className="text-white">{dr.existingCounts.documentTemplates} document_templates, {dr.existingCounts.formTemplates} form_templates</span>
              </div>
            </div>

            {/* Source totals */}
            <div>
              <p className="text-xs text-slate-400 mb-2 font-medium uppercase tracking-wide">Source totals (must match expected)</p>
              <div className="flex flex-wrap gap-3">
                <Stat label="SWMS" value={dr.sourceTotals.swms} colour={dr.sourceTotals.swms === 40 ? 'text-emerald-400' : 'text-red-400'} />
                <Stat label="Safety Plans" value={dr.sourceTotals.safetyPlans} colour={dr.sourceTotals.safetyPlans === 4 ? 'text-emerald-400' : 'text-red-400'} />
                <Stat label="Forms" value={dr.sourceTotals.forms} colour={dr.sourceTotals.forms === 16 ? 'text-emerald-400' : 'text-red-400'} />
                <Stat label="Doc Templates Total" value={dr.sourceTotals.swms + dr.sourceTotals.safetyPlans} colour="text-violet-300" />
              </div>
              <p className="text-xs text-slate-500 mt-1">{dr.sourceTotals.note}</p>
            </div>

            {/* Would-insert / would-skip */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* SWMS */}
              <div className="bg-slate-800 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <ShieldCheck className="w-4 h-4 text-violet-400" />
                  <span className="text-xs font-semibold text-white">SWMS</span>
                </div>
                <div className="flex gap-3 mb-2">
                  <span className="text-emerald-400 text-sm font-bold">{dr.swms.wouldInsertCount}</span>
                  <span className="text-xs text-slate-400 self-end">would insert</span>
                  <span className="text-yellow-400 text-sm font-bold ml-2">{dr.swms.wouldSkipCount}</span>
                  <span className="text-xs text-slate-400 self-end">would skip</span>
                </div>
                <CollapsibleList label="Would insert" items={dr.swms.wouldInsert} variant="insert" />
                <CollapsibleList label="Would skip" items={dr.swms.wouldSkip} variant="skip" />
              </div>

              {/* Safety plans */}
              <div className="bg-slate-800 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-4 h-4 text-violet-400" />
                  <span className="text-xs font-semibold text-white">Safety Plans</span>
                </div>
                <div className="flex gap-3 mb-2">
                  <span className="text-emerald-400 text-sm font-bold">{dr.safetyPlans.wouldInsertCount}</span>
                  <span className="text-xs text-slate-400 self-end">would insert</span>
                  <span className="text-yellow-400 text-sm font-bold ml-2">{dr.safetyPlans.wouldSkipCount}</span>
                  <span className="text-xs text-slate-400 self-end">would skip</span>
                </div>
                <CollapsibleList label="Would insert" items={dr.safetyPlans.wouldInsert} variant="insert" />
                <CollapsibleList label="Would skip" items={dr.safetyPlans.wouldSkip} variant="skip" />
              </div>

              {/* Forms */}
              <div className="bg-slate-800 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <ClipboardList className="w-4 h-4 text-violet-400" />
                  <span className="text-xs font-semibold text-white">Form Templates</span>
                </div>
                <div className="flex gap-3 mb-2">
                  <span className="text-emerald-400 text-sm font-bold">{dr.forms.wouldInsertCount}</span>
                  <span className="text-xs text-slate-400 self-end">would insert</span>
                  <span className="text-yellow-400 text-sm font-bold ml-2">{dr.forms.wouldSkipCount}</span>
                  <span className="text-xs text-slate-400 self-end">would skip</span>
                </div>
                <CollapsibleList label="Would insert" items={dr.forms.wouldInsert} variant="insert" />
                <CollapsibleList label="Would skip" items={dr.forms.wouldSkip} variant="skip" />
              </div>
            </div>

            {/* Semantic duplicate map */}
            <div>
              <button
                onClick={() => setShowSemanticMap((v) => !v)}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200"
              >
                {showSemanticMap ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                Semantic duplicate mapping (OC replaces flat — {Object.keys(dr.semanticDuplicateMapping).length} pairs)
              </button>
              {showSemanticMap && (
                <div className="mt-2 bg-slate-800 rounded-lg p-3">
                  <table className="text-xs w-full">
                    <thead>
                      <tr className="text-slate-400">
                        <th className="text-left pb-1 font-medium">OC title (inserted)</th>
                        <th className="text-left pb-1 font-medium">Flat title (suppressed)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(dr.semanticDuplicateMapping).map(([oc, flat]) => (
                        <tr key={oc} className="border-t border-slate-700">
                          <td className="py-0.5 text-emerald-300 font-mono pr-4">{oc}</td>
                          <td className="py-0.5 text-slate-400 font-mono line-through">{flat}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Untouched tables */}
            <div className="bg-slate-800 rounded-lg p-3">
              <p className="text-xs font-semibold text-slate-300 mb-2">Untouched tables (confirmed)</p>
              <div className="grid grid-cols-2 gap-1">
                {Object.entries(dr.untouchedTables).map(([k, v]) => (
                  <div key={k} className="flex items-start gap-1.5 text-xs">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400 mt-0.5 shrink-0" />
                    <span className="text-slate-400"><span className="text-slate-200 font-mono">{k}</span> — {v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Step 2: Live import */}
      {dr && !lr && (
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-violet-600 text-white text-xs flex items-center justify-center font-bold">2</span>
            Live Import — writes to database inside a transaction
          </h3>

          <div className="bg-amber-950 border border-amber-700 rounded-lg p-3 flex items-start gap-2 text-sm text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">This will insert {dr.swms.wouldInsertCount + dr.safetyPlans.wouldInsertCount} document templates and {dr.forms.wouldInsertCount} form templates.</p>
              <p className="text-xs mt-0.5 text-amber-400">Any failure will roll back the entire import. Existing records are preserved (skip-if-exists).</p>
            </div>
          </div>

          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="w-4 h-4 rounded accent-violet-500"
            />
            <span className="text-sm text-slate-300">
              I have reviewed the dry-run results and confirm the target company and counts are correct
            </span>
          </label>

          {error && (
            <div className="flex items-start gap-2 bg-red-950 border border-red-800 rounded-lg p-3 text-sm text-red-300">
              <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <button
            onClick={runLiveImport}
            disabled={!confirmed || loading !== null}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
          >
            {loading === 'live' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Execute Import
          </button>
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
              {lr.ok ? 'Import complete' : `Import failed — ${lr.summary.totalErrors} error(s), transaction rolled back`}
            </h3>
          </div>

          {/* Summary stats */}
          <div className="flex flex-wrap gap-3">
            <Stat label="Inserted" value={lr.summary.totalInserted} colour="text-emerald-400" />
            <Stat label="Skipped" value={lr.summary.totalSkipped} colour="text-yellow-400" />
            <Stat label="Errors" value={lr.summary.totalErrors} colour={lr.summary.totalErrors > 0 ? 'text-red-400' : 'text-slate-400'} />
          </div>

          {/* Per-section results */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-slate-800 rounded-lg p-3">
              <p className="text-xs font-semibold text-white mb-2 flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-violet-400" />SWMS</p>
              <p className="text-xs text-slate-400">{lr.results.swmsDocuments.inserted} inserted, {lr.results.swmsDocuments.skipped} skipped</p>
              <CollapsibleList label="Inserted" items={lr.results.swmsDocuments.insertedItems.map(i => `#${i.id} ${i.title}`)} variant="insert" />
              <CollapsibleList label="Skipped" items={lr.results.swmsDocuments.skippedTitles} variant="skip" />
            </div>
            <div className="bg-slate-800 rounded-lg p-3">
              <p className="text-xs font-semibold text-white mb-2 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 text-violet-400" />Safety Plans</p>
              <p className="text-xs text-slate-400">{lr.results.safetyPlans.inserted} inserted, {lr.results.safetyPlans.skipped} skipped</p>
              <CollapsibleList label="Inserted" items={lr.results.safetyPlans.insertedItems.map(i => `#${i.id} ${i.title}`)} variant="insert" />
              <CollapsibleList label="Skipped" items={lr.results.safetyPlans.skippedTitles} variant="skip" />
            </div>
            <div className="bg-slate-800 rounded-lg p-3">
              <p className="text-xs font-semibold text-white mb-2 flex items-center gap-1.5"><ClipboardList className="w-3.5 h-3.5 text-violet-400" />Form Templates</p>
              <p className="text-xs text-slate-400">{lr.results.formTemplates.inserted} inserted, {lr.results.formTemplates.skipped} skipped</p>
              <CollapsibleList label="Inserted" items={lr.results.formTemplates.insertedItems.map(i => `#${i.id} ${i.title} (${i.fieldCount} fields)`)} variant="insert" />
              <CollapsibleList label="Skipped" items={lr.results.formTemplates.skippedTitles} variant="skip" />
            </div>
          </div>

          {/* Verification */}
          {lr.verification && (
            <div className="bg-slate-800 rounded-lg p-4 space-y-3">
              <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Post-import verification</p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Stat label="Doc templates (company)" value={lr.verification.documentTemplates.totalForCompany} colour="text-violet-300" />
                <Stat label="SWMS" value={lr.verification.documentTemplates.swmsCount} colour="text-violet-300" />
                <Stat label="Safety plans" value={lr.verification.documentTemplates.safetyPlanCount} colour="text-violet-300" />
                <Stat label="Form templates" value={lr.verification.formTemplates.totalForCompany} colour="text-violet-300" />
              </div>

              {/* Sample block counts */}
              <div className="space-y-1 text-xs">
                {lr.verification.documentTemplates.sampleSwmsFlat && (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                    <span className="text-slate-400">Flat SWMS sample: <span className="text-white">"{lr.verification.documentTemplates.sampleSwmsFlat.name}"</span> — ID #{lr.verification.documentTemplates.sampleSwmsFlat.id}, <span className="text-emerald-300">{lr.verification.documentTemplates.sampleSwmsFlat.blockCount} blocks</span></span>
                  </div>
                )}
                {lr.verification.documentTemplates.sampleSwmsOc && (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                    <span className="text-slate-400">OC SWMS sample: <span className="text-white">"{lr.verification.documentTemplates.sampleSwmsOc.name}"</span> — ID #{lr.verification.documentTemplates.sampleSwmsOc.id}, <span className="text-emerald-300">{lr.verification.documentTemplates.sampleSwmsOc.blockCount} blocks</span></span>
                  </div>
                )}
                {lr.verification.documentTemplates.samplePlan && (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                    <span className="text-slate-400">Safety plan sample: <span className="text-white">"{lr.verification.documentTemplates.samplePlan.name}"</span> — ID #{lr.verification.documentTemplates.samplePlan.id}, <span className="text-emerald-300">{lr.verification.documentTemplates.samplePlan.blockCount} blocks</span></span>
                  </div>
                )}
                {lr.verification.formTemplates.sampleForm && (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                    <span className="text-slate-400">Form sample: <span className="text-white">"{lr.verification.formTemplates.sampleForm.name}"</span> — ID #{lr.verification.formTemplates.sampleForm.id}, <span className="text-emerald-300">{lr.verification.formTemplates.sampleForm.fieldCount} fields</span>, is_active={String(lr.verification.formTemplates.sampleForm.isActive)}</span>
                  </div>
                )}
              </div>

              {/* Global library + swms_templates */}
              <div className="flex flex-wrap gap-3 text-xs">
                <div className={`flex items-center gap-1.5 ${lr.verification.globalLibraryUntouched ? 'text-emerald-400' : 'text-red-400'}`}>
                  {lr.verification.globalLibraryUntouched ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                  Global Library untouched (is_platform_master=0 for all inserted rows)
                </div>
                <div className="flex items-center gap-1.5 text-emerald-400">
                  <CheckCircle2 className="w-3 h-3" />
                  swms_templates — not touched by this endpoint
                </div>
              </div>

              {/* Draft mechanism note */}
              <div className="flex items-start gap-2 bg-slate-700 rounded-lg p-3 text-xs text-slate-300">
                <Info className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                <span>{lr.verification.formTemplates.draftMechanism}</span>
              </div>
            </div>
          )}

          {/* Errors */}
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

      {/* Next steps after successful import */}
      {lr?.ok && (
        <div className="bg-slate-900 border border-emerald-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-emerald-300 mb-3 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            Next steps — wait for Daryl to verify
          </h3>
          <ol className="space-y-2 text-sm text-slate-300 list-decimal list-inside">
            <li>Log in as <code className="text-violet-300 text-xs">darylwilliams1581@gmail.com</code></li>
            <li>Go to <strong>Safety → Document Templates</strong> — confirm {lr.verification.documentTemplates.swmsCount} SWMS + {lr.verification.documentTemplates.safetyPlanCount} safety plans appear as drafts</li>
            <li>Open one flat SWMS (e.g. "Working at Heights") — confirm Document Builder shows editable blocks, not raw JSON</li>
            <li>Open one OC SWMS (e.g. "Bricklaying") — confirm work-steps table, PPE badges, critical controls table are visible</li>
            <li>Open one safety plan — confirm heading + text blocks render correctly</li>
            <li>Go to <strong>Forms</strong> — confirm {lr.verification.formTemplates.totalForCompany} form templates appear with fields</li>
            <li>Once verified, report back — seed infrastructure will then be permanently removed</li>
          </ol>
        </div>
      )}

      {/* ── Delete seeded docs (red zone) ─────────────────────────────── */}
      <div className="bg-slate-900 border border-red-800 rounded-xl p-5 space-y-4">
        <div className="flex items-start gap-3">
          <Trash2 className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-red-300">Delete Seeded Documents</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Removes only the known seeded SWMS, safety plans, and form templates from your company.
              Does <strong className="text-white">not</strong> touch any other rows. Use this to wipe the old broken seed before re-running.
            </p>
          </div>
        </div>

        <button
          onClick={runDeleteDryRun}
          disabled={loading !== null}
          className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          {loading === 'deleteDry' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Dry Run — show what would be deleted
        </button>

        {deleteError && (
          <div className="flex items-start gap-2 bg-red-950 border border-red-800 rounded-lg p-3 text-sm text-red-300">
            <XCircle className="w-4 h-4 shrink-0 mt-0.5" />{deleteError}
          </div>
        )}

        {deleteDryResult && !deleteResult && (
          <div className="space-y-3">
            <div className="bg-slate-800 rounded-lg p-3 text-sm space-y-1">
              <div className="flex gap-2">
                <span className="text-slate-400 w-40 shrink-0">Company</span>
                <span className="text-white">{deleteDryResult.companyName} <span className="text-slate-500">(ID: {deleteDryResult.companyId})</span></span>
              </div>
              <div className="flex gap-2">
                <span className="text-slate-400 w-40 shrink-0">Doc templates found</span>
                <span className="text-red-300 font-bold">{deleteDryResult.wouldDelete.documentTemplates.count}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-slate-400 w-40 shrink-0">Form templates found</span>
                <span className="text-red-300 font-bold">{deleteDryResult.wouldDelete.formTemplates.count}</span>
              </div>
            </div>

            <CollapsibleList label="Would delete (docs)" items={deleteDryResult.wouldDelete.documentTemplates.names} variant="skip" />
            <CollapsibleList label="Would delete (forms)" items={deleteDryResult.wouldDelete.formTemplates.names} variant="skip" />
            {deleteDryResult.notFound.documentTemplates.length > 0 && (
              <CollapsibleList label="Not found in DB (docs)" items={deleteDryResult.notFound.documentTemplates} variant="neutral" />
            )}
            {deleteDryResult.notFound.formTemplates.length > 0 && (
              <CollapsibleList label="Not found in DB (forms)" items={deleteDryResult.notFound.formTemplates} variant="neutral" />
            )}

            <div className="bg-red-950 border border-red-800 rounded-lg p-3 flex items-start gap-2 text-sm text-red-300">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">This will permanently delete {deleteDryResult.wouldDelete.documentTemplates.count + deleteDryResult.wouldDelete.formTemplates.count} rows. This cannot be undone.</p>
                <p className="text-xs mt-0.5 text-red-400">After deleting, run the seed again from Step 1 above to get clean documents.</p>
              </div>
            </div>

            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={deleteConfirmed}
                onChange={(e) => setDeleteConfirmed(e.target.checked)}
                className="w-4 h-4 rounded accent-red-500"
              />
              <span className="text-sm text-slate-300">I confirm — delete these seeded documents permanently</span>
            </label>

            <button
              onClick={runDeleteLive}
              disabled={!deleteConfirmed || loading !== null}
              className="flex items-center gap-2 bg-red-700 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
            >
              {loading === 'deleteLive' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Delete Seeded Documents
            </button>
          </div>
        )}

        {deleteResult && (
          <div className="flex items-start gap-2 bg-emerald-950 border border-emerald-700 rounded-lg p-3 text-sm text-emerald-300">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">{deleteResult.message}</p>
              <p className="text-xs mt-1 text-emerald-400">Now run the dry run in Step 1 above &mdash; all 40 SWMS + 4 plans + 16 forms should show as &quot;would insert&quot;.</p>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
