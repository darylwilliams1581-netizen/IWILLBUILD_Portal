/**
 * DazzaAnatomyPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Owner-only Anatomy status panel embedded in the Dazza AI page.
 *
 * Reuses ALL existing Anatomy APIs — no new server endpoints.
 * Never exposes GITHUB_DAZZA_READ_TOKEN or any credential to the browser.
 *
 * APIs consumed (all requirePlatformOwner):
 *   GET  /api/dazza/anatomy/snapshots
 *   POST /api/dazza/anatomy/github/check-changes
 *   POST /api/dazza/anatomy/github/fetch
 *   POST /api/dazza/anatomy/snapshots/:id/activate
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  GitBranch, RefreshCw, CheckCircle2, AlertCircle, Clock,
  Loader2, ChevronDown, ChevronUp, ExternalLink, Zap,
  FileCode2, Database, Info, TrendingUp,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AnatomySnapshot {
  id: string;
  source_type: string;
  repo_owner: string | null;
  repo_name: string | null;
  branch: string | null;
  commit_sha: string | null;
  commit_date: string | null;
  snapshot_name: string | null;
  status: 'pending' | 'indexing' | 'ready' | 'failed' | 'deleted';
  is_active: number | boolean;
  total_files: number;
  indexed_files: number;
  excluded_files: number;
  quarantine_count: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

type FetchStage =
  | 'idle'
  | 'checking'
  | 'downloading'
  | 'scanning'
  | 'indexing'
  | 'ready'
  | 'failed';

interface ChangeCheckResult {
  hasChanges: boolean;
  latestSha: string;
  latestDate: string;
  latestMessage: string;
  knownSha: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function shortSha(sha: string | null | undefined): string {
  return sha ? sha.slice(0, 8) : '—';
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-AU', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso.slice(0, 16);
  }
}

function statusColor(status: string): string {
  switch (status) {
    case 'ready':    return 'text-emerald-700 bg-emerald-50 border-emerald-200';
    case 'indexing':
    case 'pending':  return 'text-amber-700 bg-amber-50 border-amber-200';
    case 'failed':   return 'text-red-700 bg-red-50 border-red-200';
    default:         return 'text-slate-600 bg-slate-50 border-slate-200';
  }
}

function stageLabel(stage: FetchStage): string {
  switch (stage) {
    case 'checking':    return 'Checking GitHub…';
    case 'downloading': return 'Downloading archive…';
    case 'scanning':    return 'Security scanning…';
    case 'indexing':    return 'Indexing files…';
    case 'ready':       return 'Ready for review';
    case 'failed':      return 'Failed';
    default:            return '';
  }
}

const STAGE_ORDER: FetchStage[] = ['checking', 'downloading', 'scanning', 'indexing', 'ready'];

// ── Component ─────────────────────────────────────────────────────────────────

export default function DazzaAnatomyPanel() {
  const [snapshots, setSnapshots] = useState<AnatomySnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active snapshot (is_active = 1)
  const activeSnapshot = snapshots.find((s) => s.is_active);
  // Most-recent ready-but-inactive snapshot
  const pendingSnapshot = snapshots.find((s) => !s.is_active && s.status === 'ready');

  // Change-check state
  const [changeCheck, setChangeCheck] = useState<ChangeCheckResult | null>(null);
  const [checkingChanges, setCheckingChanges] = useState(false);

  // Fetch-from-GitHub state
  const [fetchStage, setFetchStage] = useState<FetchStage>('idle');
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetchedSnapshotId, setFetchedSnapshotId] = useState<string | null>(null);

  // Activate state
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);

  // Expand/collapse detail
  const [expanded, setExpanded] = useState(false);

  // ── Load snapshots ──────────────────────────────────────────────────────────
  const loadSnapshots = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/dazza/anatomy/snapshots', { credentials: 'include' });
      if (!res.ok) {
        setError(res.status === 401 ? 'Not authenticated.' : res.status === 403 ? 'Owner access required.' : 'Failed to load snapshots.');
        return;
      }
      const data = await res.json() as { ok: boolean; snapshots: AnatomySnapshot[] };
      setSnapshots(data.snapshots ?? []);
    } catch {
      setError('Network error loading snapshots.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadSnapshots(); }, [loadSnapshots]);

  // ── Check for newer GitHub commits ─────────────────────────────────────────
  const checkChanges = useCallback(async () => {
    setCheckingChanges(true);
    setChangeCheck(null);
    try {
      const res = await fetch('/api/dazza/anatomy/github/check-changes', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch: 'main', knownSha: activeSnapshot?.commit_sha ?? '' }),
      });
      if (!res.ok) return;
      const data = await res.json() as { ok: boolean } & ChangeCheckResult;
      setChangeCheck(data);
    } catch {
      // silent — not critical
    } finally {
      setCheckingChanges(false);
    }
  }, [activeSnapshot?.commit_sha]);

  // Auto-check for changes when active snapshot is loaded
  useEffect(() => {
    if (activeSnapshot?.commit_sha) {
      void checkChanges();
    }
  }, [activeSnapshot?.commit_sha]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch from GitHub ───────────────────────────────────────────────────────
  const fetchFromGitHub = useCallback(async () => {
    setFetchStage('checking');
    setFetchError(null);
    setFetchedSnapshotId(null);

    try {
      // Stage progression is simulated client-side while the server processes.
      // The actual server call is a single POST that runs all stages synchronously.
      // We advance the UI through stages with delays to reflect server work.
      const stageTimer = (stage: FetchStage, delay: number) =>
        new Promise<void>((resolve) => setTimeout(() => { setFetchStage(stage); resolve(); }, delay));

      // Start the fetch request (long-running — up to ~60s for large repos)
      const fetchPromise = fetch('/api/dazza/anatomy/github/fetch', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: 'main' }),
      });

      // Advance UI stages while waiting
      await stageTimer('downloading', 1200);
      await stageTimer('scanning', 3000);
      await stageTimer('indexing', 5000);

      const res = await fetchPromise;
      const data = await res.json() as {
        ok: boolean;
        duplicate?: boolean;
        snapshotId?: string;
        status?: string;
        error?: string;
        correlationId?: string;
      };

      if (!res.ok || !data.ok) {
        setFetchStage('failed');
        setFetchError(data.error ?? `Server error (${res.status})`);
        return;
      }

      if (data.duplicate) {
        setFetchStage('ready');
        setFetchedSnapshotId(data.snapshotId ?? null);
        await loadSnapshots();
        return;
      }

      setFetchStage('ready');
      setFetchedSnapshotId(data.snapshotId ?? null);
      await loadSnapshots();
    } catch (e) {
      setFetchStage('failed');
      setFetchError(String(e).slice(0, 200));
    }
  }, [loadSnapshots]);

  // ── Activate snapshot ───────────────────────────────────────────────────────
  const activateSnapshot = useCallback(async (id: string) => {
    setActivating(true);
    setActivateError(null);
    try {
      const res = await fetch(`/api/dazza/anatomy/snapshots/${encodeURIComponent(id)}/activate`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setActivateError(data.error ?? 'Activation failed.');
        return;
      }
      // Reload snapshots to reflect new active state
      await loadSnapshots();
      setFetchStage('idle');
      setFetchedSnapshotId(null);
      setChangeCheck(null);
      // Re-check changes against newly active snapshot
      setTimeout(() => void checkChanges(), 500);
    } catch {
      setActivateError('Network error during activation.');
    } finally {
      setActivating(false);
    }
  }, [loadSnapshots, checkChanges]);

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-4 text-xs text-slate-400">
        <Loader2 size={13} className="animate-spin" />
        Loading Anatomy status…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl m-3">
        <AlertCircle size={13} className="inline mr-1.5" />
        {error}
      </div>
    );
  }

  // ── Snapshot to show for activation (newly fetched or existing pending) ─────
  const snapshotToActivate = fetchedSnapshotId
    ? snapshots.find((s) => s.id === fetchedSnapshotId)
    : pendingSnapshot;

  return (
    <div className="flex flex-col gap-0 text-xs">

      {/* ── Active snapshot card ── */}
      <div className="p-3 border-b border-slate-100">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Database size={11} className="text-slate-400" />
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Active Snapshot</span>
          </div>
          <button
            onClick={() => void loadSnapshots()}
            className="text-slate-400 hover:text-slate-700 transition-colors p-0.5 rounded"
            title="Refresh"
          >
            <RefreshCw size={11} />
          </button>
        </div>

        {!activeSnapshot ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex flex-col gap-2">
            <div className="flex items-center gap-1.5 text-amber-700 font-semibold">
              <AlertCircle size={12} />
              No active Anatomy snapshot
            </div>
            <p className="text-[10px] text-amber-600 leading-relaxed">
              Dazza cannot search source code without an active snapshot. Fetch the latest from GitHub to enable code analysis.
            </p>
            <div className="flex flex-col gap-1.5 mt-1">
              <FetchButton
                stage={fetchStage}
                onFetch={() => void fetchFromGitHub()}
              />
              <a
                href="/owner-console#anatomy"
                className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-800 transition-colors"
              >
                <ExternalLink size={10} />
                Open Anatomy Console
              </a>
            </div>
            {fetchError && (
              <div className="text-[10px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5 mt-1">
                {fetchError}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {/* Status badge row */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusColor(activeSnapshot.status)}`}>
                <CheckCircle2 size={10} />
                Active · {activeSnapshot.status}
              </span>
              {changeCheck?.hasChanges && (
                <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                  <TrendingUp size={10} />
                  New commits available
                </span>
              )}
            </div>

            {/* Key fields */}
            <div className="flex flex-col gap-1">
              <InfoRow label="Repo" value={activeSnapshot.repo_name ?? '—'} />
              <InfoRow label="Branch" value={activeSnapshot.branch ?? '—'} icon={<GitBranch size={9} />} />
              <InfoRow label="Commit" value={shortSha(activeSnapshot.commit_sha)} mono />
              <InfoRow label="Commit date" value={fmtDate(activeSnapshot.commit_date)} />
              <InfoRow label="Indexed files" value={`${activeSnapshot.indexed_files} / ${activeSnapshot.total_files}`} />
              {activeSnapshot.quarantine_count > 0 && (
                <InfoRow label="Quarantined" value={String(activeSnapshot.quarantine_count)} warn />
              )}
              <InfoRow label="Snapshot created" value={fmtDate(activeSnapshot.created_at)} />
            </div>

            {/* Expand for more detail */}
            <button
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-700 transition-colors mt-0.5"
            >
              {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
              {expanded ? 'Less detail' : 'More detail'}
            </button>

            <AnimatePresence>
              {expanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="overflow-hidden"
                >
                  <div className="flex flex-col gap-1 pt-1 border-t border-slate-100">
                    <InfoRow label="Snapshot ID" value={activeSnapshot.id.slice(0, 12) + '…'} mono />
                    <InfoRow label="Excluded files" value={String(activeSnapshot.excluded_files)} />
                    <InfoRow label="Source type" value={activeSnapshot.source_type} />
                    <InfoRow label="Last updated" value={fmtDate(activeSnapshot.updated_at)} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Change check */}
            <div className="flex items-center gap-1.5 mt-1">
              {checkingChanges ? (
                <span className="flex items-center gap-1 text-[10px] text-slate-400">
                  <Loader2 size={10} className="animate-spin" />
                  Checking for new commits…
                </span>
              ) : changeCheck ? (
                changeCheck.hasChanges ? (
                  <div className="flex flex-col gap-1.5 w-full">
                    <div className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                      <strong>New commit:</strong> {shortSha(changeCheck.latestSha)} · {fmtDate(changeCheck.latestDate)}
                      {changeCheck.latestMessage && (
                        <div className="mt-0.5 text-amber-600 truncate" title={changeCheck.latestMessage}>
                          {changeCheck.latestMessage.slice(0, 60)}
                        </div>
                      )}
                    </div>
                    <FetchButton stage={fetchStage} onFetch={() => void fetchFromGitHub()} label="Fetch latest" />
                  </div>
                ) : (
                  <span className="flex items-center gap-1 text-[10px] text-emerald-600">
                    <CheckCircle2 size={10} />
                    Snapshot is up to date
                  </span>
                )
              ) : (
                <button
                  onClick={() => void checkChanges()}
                  className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-700 transition-colors"
                >
                  <RefreshCw size={10} />
                  Check for new commits
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Fetch progress ── */}
      {fetchStage !== 'idle' && (
        <div className="p-3 border-b border-slate-100">
          <div className="flex items-center gap-1.5 mb-2">
            <FileCode2 size={11} className="text-violet-500" />
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Fetch Progress</span>
          </div>
          <FetchProgress stage={fetchStage} error={fetchError} />
        </div>
      )}

      {/* ── Snapshot ready for review / activation ── */}
      {snapshotToActivate && fetchStage !== 'idle' && (
        <div className="p-3 border-b border-slate-100">
          <div className="flex items-center gap-1.5 mb-2">
            <Zap size={11} className="text-violet-500" />
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Ready for Review</span>
          </div>
          <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 flex flex-col gap-2">
            <div className="flex flex-col gap-1">
              <InfoRow label="Commit" value={shortSha(snapshotToActivate.commit_sha)} mono />
              <InfoRow label="Indexed" value={`${snapshotToActivate.indexed_files} files`} />
              {snapshotToActivate.quarantine_count > 0 && (
                <InfoRow label="Quarantined" value={String(snapshotToActivate.quarantine_count)} warn />
              )}
            </div>
            <p className="text-[10px] text-violet-700 leading-relaxed">
              Review the snapshot details before activating. Dazza will use this snapshot for all code analysis once active.
            </p>
            <div className="flex flex-col gap-1.5">
              <button
                onClick={() => void activateSnapshot(snapshotToActivate.id)}
                disabled={activating}
                className="flex items-center justify-center gap-1.5 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-[11px] font-bold px-3 py-2 rounded-lg transition-colors"
              >
                {activating ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
                {activating ? 'Activating…' : 'Activate snapshot'}
              </button>
              <a
                href="/owner-console#anatomy"
                className="flex items-center justify-center gap-1 text-[10px] text-slate-500 hover:text-slate-800 transition-colors"
              >
                <ExternalLink size={10} />
                Review in Anatomy Console
              </a>
            </div>
            {activateError && (
              <div className="text-[10px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5">
                {activateError}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Pending snapshots (ready but not active, not the just-fetched one) ── */}
      {pendingSnapshot && !fetchedSnapshotId && (
        <div className="p-3 border-b border-slate-100">
          <div className="flex items-center gap-1.5 mb-2">
            <Clock size={11} className="text-amber-500" />
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Snapshot Ready</span>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex flex-col gap-2">
            <p className="text-[10px] text-amber-700">
              A snapshot is ready but not yet active. Review and activate it to enable code analysis.
            </p>
            <div className="flex flex-col gap-1">
              <InfoRow label="Commit" value={shortSha(pendingSnapshot.commit_sha)} mono />
              <InfoRow label="Indexed" value={`${pendingSnapshot.indexed_files} files`} />
              <InfoRow label="Created" value={fmtDate(pendingSnapshot.created_at)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <button
                onClick={() => void activateSnapshot(pendingSnapshot.id)}
                disabled={activating}
                className="flex items-center justify-center gap-1.5 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-[11px] font-bold px-3 py-2 rounded-lg transition-colors"
              >
                {activating ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
                {activating ? 'Activating…' : 'Activate snapshot'}
              </button>
              <a
                href="/owner-console#anatomy"
                className="flex items-center justify-center gap-1 text-[10px] text-slate-500 hover:text-slate-800 transition-colors"
              >
                <ExternalLink size={10} />
                Review in Anatomy Console
              </a>
            </div>
            {activateError && (
              <div className="text-[10px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5">
                {activateError}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── All snapshots list ── */}
      {snapshots.length > 0 && (
        <div className="p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Info size={11} className="text-slate-400" />
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              All Snapshots ({snapshots.length})
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            {snapshots.slice(0, 5).map((s) => (
              <div
                key={s.id}
                className={`flex items-center justify-between px-2 py-1.5 rounded-lg border text-[10px] ${
                  s.is_active
                    ? 'bg-emerald-50 border-emerald-200'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="font-mono text-slate-600 truncate">{shortSha(s.commit_sha)}</span>
                  <span className="text-slate-400 truncate">{fmtDate(s.created_at)}</span>
                </div>
                <span className={`shrink-0 ml-2 font-semibold px-1.5 py-0.5 rounded-full border text-[9px] ${statusColor(s.status)}`}>
                  {s.is_active ? 'active' : s.status}
                </span>
              </div>
            ))}
          </div>
          <a
            href="/owner-console#anatomy"
            className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-700 transition-colors mt-2"
          >
            <ExternalLink size={10} />
            Manage all snapshots
          </a>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function InfoRow({
  label, value, mono = false, icon, warn = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  icon?: React.ReactNode;
  warn?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-[10px]">
      <span className="text-slate-400 flex items-center gap-1 shrink-0">
        {icon}
        {label}
      </span>
      <span className={`font-semibold truncate max-w-[120px] text-right ${
        warn ? 'text-amber-600' : mono ? 'font-mono text-slate-600' : 'text-slate-700'
      }`} title={value}>
        {value}
      </span>
    </div>
  );
}

function FetchButton({
  stage, onFetch, label = 'Fetch latest from GitHub',
}: {
  stage: FetchStage;
  onFetch: () => void;
  label?: string;
}) {
  const busy = stage !== 'idle' && stage !== 'ready' && stage !== 'failed';
  return (
    <button
      onClick={onFetch}
      disabled={busy}
      className="flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-200 disabled:text-slate-400 text-white text-[11px] font-bold px-3 py-2 rounded-lg transition-colors w-full"
    >
      {busy
        ? <><Loader2 size={11} className="animate-spin" />{stageLabel(stage)}</>
        : <><GitBranch size={11} />{label}</>
      }
    </button>
  );
}

function FetchProgress({ stage, error }: { stage: FetchStage; error: string | null }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        {STAGE_ORDER.map((s) => {
          const idx = STAGE_ORDER.indexOf(s);
          const currentIdx = STAGE_ORDER.indexOf(stage as FetchStage);
          const done = currentIdx > idx;
          const active = stage === s;
          const failed = stage === 'failed';
          return (
            <div
              key={s}
              className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-semibold transition-all ${
                failed && active
                  ? 'bg-red-50 border-red-200 text-red-600'
                  : done
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : active
                  ? 'bg-violet-50 border-violet-200 text-violet-700'
                  : 'bg-slate-50 border-slate-200 text-slate-400'
              }`}
            >
              {done ? <CheckCircle2 size={9} /> : active && stage !== 'failed' ? <Loader2 size={9} className="animate-spin" /> : null}
              {s}
            </div>
          );
        })}
      </div>
      {stage === 'failed' && error && (
        <div className="text-[10px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5">
          {error}
        </div>
      )}
      {stage === 'ready' && (
        <div className="flex items-center gap-1 text-[10px] text-emerald-600">
          <CheckCircle2 size={10} />
          Snapshot ready — review and activate below
        </div>
      )}
    </div>
  );
}
