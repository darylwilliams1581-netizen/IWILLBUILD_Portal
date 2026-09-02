/**
 * AnatomyTab.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Owner Console → Dazza → Anatomy
 * Platform-owner only. Full anatomy index management UI.
 */

import { useState, useEffect, useRef } from 'react';
import {
  GitBranch, RefreshCw, Download, Upload, CheckCircle, XCircle,
  AlertTriangle, Trash2, Eye, Search, ChevronDown, ChevronUp,
  Loader2, Shield, FileCode, Database, Zap, Info,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Snapshot {
  id: string;
  source_type: 'github' | 'zip';
  repo_owner: string | null;
  repo_name: string | null;
  branch: string | null;
  commit_sha: string | null;
  commit_date: string | null;
  snapshot_name: string | null;
  source_desc: string | null;
  app_version: string | null;
  build_number: string | null;
  git_ref: string | null;
  status: 'pending' | 'indexing' | 'ready' | 'failed' | 'deleted';
  is_active: number;
  total_files: number;
  indexed_files: number;
  excluded_files: number;
  quarantine_count: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

interface ConnectionResult {
  connected: boolean;
  repoFullName: string | null;
  branch: string | null;
  commitSha: string | null;
  commitDate: string | null;
  commitMessage: string | null;
  error: string | null;
}

interface SearchResult {
  rel_path: string;
  start_line: number;
  end_line: number;
  chunk_type: string;
  symbol_name: string;
  snippet: string;
  relevance: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusBadge(status: Snapshot['status'], isActive: number) {
  if (isActive) return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">ACTIVE</span>;
  const map: Record<string, string> = {
    ready:    'bg-blue-50 text-blue-700 border-blue-200',
    indexing: 'bg-amber-50 text-amber-700 border-amber-200',
    pending:  'bg-slate-50 text-slate-500 border-slate-200',
    failed:   'bg-red-50 text-red-700 border-red-200',
    deleted:  'bg-slate-50 text-slate-400 border-slate-200',
  };
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${map[status] ?? map.pending}`}>{status.toUpperCase()}</span>;
}

function connStatusBadge(result: ConnectionResult | null, loading: boolean) {
  if (loading) return <span className="flex items-center gap-1 text-xs text-slate-400"><Loader2 size={12} className="animate-spin" /> Testing…</span>;
  if (!result) return null;
  if (result.connected) return <span className="flex items-center gap-1 text-xs text-emerald-600 font-semibold"><CheckCircle size={12} /> Connected</span>;
  return <span className="flex items-center gap-1 text-xs text-red-600 font-semibold"><XCircle size={12} /> {result.error?.slice(0, 60) ?? 'Failed'}</span>;
}

function shortSha(sha: string | null) {
  return sha ? sha.slice(0, 8) : '—';
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  try { return new Date(d).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' }); }
  catch { return d; }
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AnatomyTab() {
  // ── Connection state ──────────────────────────────────────────────────────
  const [connResult, setConnResult] = useState<ConnectionResult | null>(null);
  const [connLoading, setConnLoading] = useState(false);
  const [connBranch, setConnBranch] = useState('main');

  // ── Snapshots ─────────────────────────────────────────────────────────────
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [snapsLoading, setSnapsLoading] = useState(true);
  const [expandedSnap, setExpandedSnap] = useState<string | null>(null);
  const [snapDetail, setSnapDetail] = useState<Record<string, unknown> | null>(null);
  const [snapDetailLoading, setSnapDetailLoading] = useState(false);

  // ── GitHub fetch ──────────────────────────────────────────────────────────
  const [fetchRef, setFetchRef] = useState('main');
  const [fetchLoading, setFetchLoading] = useState(false);
  const [fetchResult, setFetchResult] = useState<Record<string, unknown> | null>(null);
  const [fetchError, setFetchError] = useState('');

  // ── Check for changes ─────────────────────────────────────────────────────
  const [checkResult, setCheckResult] = useState<Record<string, unknown> | null>(null);
  const [checkLoading, setCheckLoading] = useState(false);

  // ── ZIP upload ────────────────────────────────────────────────────────────
  const [zipName, setZipName] = useState('');
  const [zipDesc, setZipDesc] = useState('');
  const [zipVersion, setZipVersion] = useState('');
  const [zipBuild, setZipBuild] = useState('');
  const [zipGitRef, setZipGitRef] = useState('');
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [zipLoading, setZipLoading] = useState(false);
  const [zipResult, setZipResult] = useState<Record<string, unknown> | null>(null);
  const [zipError, setZipError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Delete confirmation ───────────────────────────────────────────────────
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // ── Search ────────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchSnap, setSearchSnap] = useState<Record<string, unknown> | null>(null);

  // ── Load snapshots ────────────────────────────────────────────────────────
  async function loadSnapshots() {
    setSnapsLoading(true);
    try {
      const r = await fetch('/api/dazza/anatomy/snapshots', { credentials: 'include' });
      const d = await r.json() as { snapshots?: Snapshot[] };
      setSnapshots(d.snapshots ?? []);
    } catch { /* silent */ }
    finally { setSnapsLoading(false); }
  }

  useEffect(() => { void loadSnapshots(); }, []);

  // ── Test connection ───────────────────────────────────────────────────────
  async function testConnection() {
    setConnLoading(true);
    setConnResult(null);
    try {
      const r = await fetch('/api/dazza/anatomy/github/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ branch: connBranch }),
      });
      const d = await r.json() as ConnectionResult;
      setConnResult(d);
    } catch (e) {
      setConnResult({ connected: false, repoFullName: null, branch: null, commitSha: null, commitDate: null, commitMessage: null, error: String(e) });
    }
    setConnLoading(false);
  }

  // ── Check for changes ─────────────────────────────────────────────────────
  async function checkForChanges() {
    setCheckLoading(true);
    setCheckResult(null);
    const activeSnap = snapshots.find(s => s.is_active);
    try {
      const r = await fetch('/api/dazza/anatomy/github/check-changes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ branch: connBranch, knownSha: activeSnap?.commit_sha ?? '' }),
      });
      const d = await r.json() as Record<string, unknown>;
      setCheckResult(d);
    } catch (e) {
      setCheckResult({ ok: false, error: String(e) });
    }
    setCheckLoading(false);
  }

  // ── GitHub fetch ──────────────────────────────────────────────────────────
  async function fetchFromGitHub() {
    setFetchLoading(true);
    setFetchResult(null);
    setFetchError('');
    try {
      const r = await fetch('/api/dazza/anatomy/github/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ref: fetchRef }),
      });
      const d = await r.json() as Record<string, unknown>;
      if (d.ok) {
        setFetchResult(d);
        await loadSnapshots();
      } else {
        setFetchError(String(d.error ?? 'Fetch failed'));
      }
    } catch (e) {
      setFetchError(String(e));
    }
    setFetchLoading(false);
  }

  // ── ZIP upload ────────────────────────────────────────────────────────────
  async function uploadZip() {
    if (!zipFile) { setZipError('Select a ZIP file first.'); return; }
    setZipLoading(true);
    setZipResult(null);
    setZipError('');
    try {
      const form = new FormData();
      form.append('archive', zipFile);
      form.append('snapshot_name', zipName || zipFile.name);
      form.append('source_desc', zipDesc);
      form.append('app_version', zipVersion);
      form.append('build_number', zipBuild);
      form.append('git_ref', zipGitRef);

      const r = await fetch('/api/dazza/anatomy/upload-zip', {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      const d = await r.json() as Record<string, unknown>;
      if (d.ok) {
        setZipResult(d);
        await loadSnapshots();
      } else {
        setZipError(String(d.error ?? 'Upload failed'));
      }
    } catch (e) {
      setZipError(String(e));
    }
    setZipLoading(false);
  }

  // ── Activate snapshot ─────────────────────────────────────────────────────
  async function activateSnapshot(id: string) {
    await fetch(`/api/dazza/anatomy/snapshots/${id}/activate`, {
      method: 'POST', credentials: 'include',
    });
    await loadSnapshots();
  }

  // ── Delete snapshot ───────────────────────────────────────────────────────
  async function deleteSnapshot(id: string) {
    setDeleteLoading(true);
    try {
      await fetch(`/api/dazza/anatomy/snapshots/${id}/delete`, {
        method: 'POST', credentials: 'include',
      });
      setDeleteConfirm(null);
      await loadSnapshots();
    } finally { setDeleteLoading(false); }
  }

  // ── Load snapshot detail ──────────────────────────────────────────────────
  async function loadSnapDetail(id: string) {
    if (expandedSnap === id) { setExpandedSnap(null); return; }
    setExpandedSnap(id);
    setSnapDetailLoading(true);
    try {
      const r = await fetch(`/api/dazza/anatomy/snapshots/${id}`, { credentials: 'include' });
      const d = await r.json() as Record<string, unknown>;
      setSnapDetail(d);
    } finally { setSnapDetailLoading(false); }
  }

  // ── Search ────────────────────────────────────────────────────────────────
  async function runSearch() {
    if (searchQuery.trim().length < 2) { setSearchError('Enter at least 2 characters.'); return; }
    setSearchLoading(true);
    setSearchResults([]);
    setSearchError('');
    setSearchSnap(null);
    try {
      const r = await fetch('/api/dazza/anatomy/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ query: searchQuery, limit: 15 }),
      });
      const d = await r.json() as { results?: SearchResult[]; snapshot?: Record<string, unknown>; error?: string };
      if (d.error) { setSearchError(d.error); }
      else {
        setSearchResults(d.results ?? []);
        setSearchSnap(d.snapshot ?? null);
      }
    } catch (e) { setSearchError(String(e)); }
    setSearchLoading(false);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const activeSnap = snapshots.find(s => s.is_active);

  return (
    <div className="flex flex-col gap-6 max-w-5xl">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <FileCode size={18} className="text-primary" />
            Dazza Anatomy Index
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Versioned, read-only source code index for Dazza investigations.
            Dazza reads → Daryl approves → Airo edits.
          </p>
        </div>
        <button
          onClick={loadSnapshots}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg px-3 py-1.5 transition-colors"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* Active snapshot banner */}
      {activeSnap && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-3">
          <CheckCircle size={16} className="text-emerald-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-emerald-800">Active snapshot</div>
            <div className="text-xs text-emerald-700 truncate">
              {activeSnap.snapshot_name ?? activeSnap.id} ·{' '}
              {activeSnap.source_type === 'github'
                ? `GitHub ${shortSha(activeSnap.commit_sha)}`
                : `ZIP upload`} ·{' '}
              {activeSnap.indexed_files} files indexed
            </div>
          </div>
        </div>
      )}
      {!activeSnap && !snapsLoading && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2 text-xs text-amber-700">
          <AlertTriangle size={14} className="shrink-0" />
          No active snapshot. Fetch from GitHub or upload a ZIP, then activate a snapshot to enable Dazza anatomy tools.
        </div>
      )}

      {/* ── GitHub Connection ─────────────────────────────────────────────── */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50">
          <GitBranch size={14} className="text-primary" />
          <span className="text-sm font-semibold text-slate-800">GitHub Connection</span>
          <span className="ml-auto">{connStatusBadge(connResult, connLoading)}</span>
        </div>
        <div className="p-4 flex flex-col gap-3">
          <div className="text-xs text-slate-500">
            Repository: <span className="font-mono font-semibold text-slate-700">darylwilliams1581-netizen/IWIllBUIlD_Portal</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500 shrink-0">Branch / ref:</label>
            <input
              value={connBranch}
              onChange={e => setConnBranch(e.target.value)}
              className="border border-slate-200 rounded-lg px-2 py-1 text-xs font-mono w-40 focus:outline-none focus:ring-1 focus:ring-primary/40"
              placeholder="main"
            />
            <button
              onClick={testConnection}
              disabled={connLoading}
              className="flex items-center gap-1.5 text-xs bg-primary text-white px-3 py-1.5 rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
            >
              {connLoading ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
              Test Connection
            </button>
            <button
              onClick={checkForChanges}
              disabled={checkLoading}
              className="flex items-center gap-1.5 text-xs border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              {checkLoading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
              Check for Changes
            </button>
          </div>

          {connResult?.connected && (
            <div className="bg-slate-50 rounded-lg p-2.5 text-xs text-slate-600 space-y-0.5">
              <div><span className="font-semibold">Repo:</span> {connResult.repoFullName}</div>
              <div><span className="font-semibold">Branch:</span> {connResult.branch}</div>
              <div><span className="font-semibold">Latest SHA:</span> <span className="font-mono">{shortSha(connResult.commitSha)}</span></div>
              <div><span className="font-semibold">Commit date:</span> {fmtDate(connResult.commitDate)}</div>
              {connResult.commitMessage && <div><span className="font-semibold">Message:</span> {connResult.commitMessage}</div>}
            </div>
          )}
          {connResult && !connResult.connected && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 text-xs text-red-700">
              {connResult.error}
            </div>
          )}

          {checkResult && (
            <div className={`rounded-lg p-2.5 text-xs border ${checkResult.hasChanges ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
              {checkResult.hasChanges
                ? <>New commit available: <span className="font-mono font-semibold">{shortSha(checkResult.latestSha as string)}</span> — {checkResult.commitMessage as string}</>
                : 'No changes — active snapshot is up to date.'}
            </div>
          )}
        </div>
      </section>

      {/* ── Fetch from GitHub ─────────────────────────────────────────────── */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50">
          <Download size={14} className="text-primary" />
          <span className="text-sm font-semibold text-slate-800">Fetch from GitHub</span>
        </div>
        <div className="p-4 flex flex-col gap-3">
          <div className="text-xs text-slate-500">
            Resolves a branch, tag, or commit SHA to an exact SHA, downloads the archive, runs security scanning, and indexes the source code.
            The new snapshot remains <strong>inactive</strong> until you activate it.
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500 shrink-0">Branch / tag / SHA:</label>
            <input
              value={fetchRef}
              onChange={e => setFetchRef(e.target.value)}
              className="border border-slate-200 rounded-lg px-2 py-1 text-xs font-mono w-48 focus:outline-none focus:ring-1 focus:ring-primary/40"
              placeholder="main"
            />
            <button
              onClick={fetchFromGitHub}
              disabled={fetchLoading}
              className="flex items-center gap-1.5 text-xs bg-primary text-white px-3 py-1.5 rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
            >
              {fetchLoading ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
              {fetchLoading ? 'Fetching & indexing…' : 'Fetch Latest'}
            </button>
          </div>

          {fetchLoading && (
            <div className="text-xs text-slate-500 flex items-center gap-1.5">
              <Loader2 size={11} className="animate-spin" />
              Downloading archive, running security scan, indexing… this may take 30–90 seconds.
            </div>
          )}

          {fetchResult && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-800 space-y-1">
              {fetchResult.duplicate
                ? <div className="font-semibold">Duplicate — snapshot for SHA {shortSha(fetchResult.commitSha as string)} already exists ({String(fetchResult.status)}).</div>
                : <>
                    <div className="font-semibold">Snapshot created — inactive until activated.</div>
                    <div>SHA: <span className="font-mono">{shortSha(fetchResult.commitSha as string)}</span> · {fmtDate(fetchResult.commitDate as string)}</div>
                    <div>Files: {String(fetchResult.indexedFiles)} indexed · {String(fetchResult.excludedFiles)} excluded · {String(fetchResult.quarantined)} quarantined</div>
                    {(fetchResult.errors as string[])?.length > 0 && (
                      <div className="text-amber-700">Warnings: {(fetchResult.errors as string[]).slice(0, 3).join('; ')}</div>
                    )}
                  </>
              }
            </div>
          )}
          {fetchError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 text-xs text-red-700">{fetchError}</div>
          )}
        </div>
      </section>

      {/* ── Manual ZIP Upload ─────────────────────────────────────────────── */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50">
          <Upload size={14} className="text-primary" />
          <span className="text-sm font-semibold text-slate-800">Manual ZIP Upload</span>
          <span className="ml-2 text-[10px] text-slate-400">For Airo workspace exports, local patches, or code not yet pushed to GitHub</span>
        </div>
        <div className="p-4 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-semibold text-slate-400 mb-0.5">Snapshot name</label>
              <input value={zipName} onChange={e => setZipName(e.target.value)} placeholder="e.g. Airo export 2026-08-15" className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-400 mb-0.5">Source description</label>
              <input value={zipDesc} onChange={e => setZipDesc(e.target.value)} placeholder="e.g. Airo workspace export" className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-400 mb-0.5">App version</label>
              <input value={zipVersion} onChange={e => setZipVersion(e.target.value)} placeholder="e.g. 12.0.0" className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-400 mb-0.5">Build number</label>
              <input value={zipBuild} onChange={e => setZipBuild(e.target.value)} placeholder="e.g. 1234" className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40" />
            </div>
            <div className="col-span-2">
              <label className="block text-[10px] font-semibold text-slate-400 mb-0.5">Git commit / reference (if known)</label>
              <input value={zipGitRef} onChange={e => setZipGitRef(e.target.value)} placeholder="e.g. abc1234 or feature/my-branch" className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary/40" />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 text-xs border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <Upload size={11} />
              {zipFile ? zipFile.name : 'Select ZIP file'}
            </button>
            <input ref={fileInputRef} type="file" accept=".zip" className="hidden" onChange={e => setZipFile(e.target.files?.[0] ?? null)} />
            <button
              onClick={uploadZip}
              disabled={zipLoading || !zipFile}
              className="flex items-center gap-1.5 text-xs bg-primary text-white px-3 py-1.5 rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
            >
              {zipLoading ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
              {zipLoading ? 'Uploading & indexing…' : 'Upload & Index'}
            </button>
          </div>

          {zipResult && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-800 space-y-1">
              <div className="font-semibold">Snapshot created — inactive until activated.</div>
              <div>Files: {String(zipResult.indexedFiles)} indexed · {String(zipResult.excludedFiles)} excluded · {String(zipResult.quarantined)} quarantined</div>
            </div>
          )}
          {zipError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 text-xs text-red-700">{zipError}</div>
          )}
        </div>
      </section>

      {/* ── Snapshot List ─────────────────────────────────────────────────── */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50">
          <Database size={14} className="text-primary" />
          <span className="text-sm font-semibold text-slate-800">Snapshots</span>
          <span className="ml-2 text-[10px] text-slate-400">{snapshots.length} total</span>
        </div>

        {snapsLoading && (
          <div className="flex items-center justify-center py-8 text-slate-400 text-xs gap-2">
            <Loader2 size={14} className="animate-spin" /> Loading snapshots…
          </div>
        )}

        {!snapsLoading && snapshots.length === 0 && (
          <div className="py-8 text-center text-xs text-slate-400">No snapshots yet. Fetch from GitHub or upload a ZIP.</div>
        )}

        {!snapsLoading && snapshots.map(snap => (
          <div key={snap.id} className={`border-b border-slate-100 last:border-0 ${snap.is_active ? 'bg-emerald-50/30' : ''}`}>
            <div className="flex items-center gap-3 px-4 py-3">
              {/* Source icon */}
              <div className="shrink-0">
                {snap.source_type === 'github'
                  ? <GitBranch size={14} className="text-slate-400" />
                  : <Upload size={14} className="text-slate-400" />}
              </div>

              {/* Main info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-slate-800 truncate">
                    {snap.snapshot_name ?? snap.id}
                  </span>
                  {statusBadge(snap.status, snap.is_active)}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                  {snap.source_type === 'github' && snap.commit_sha && (
                    <span className="font-mono">{shortSha(snap.commit_sha)}</span>
                  )}
                  {snap.branch && <span>{snap.branch}</span>}
                  {snap.app_version && <span>v{snap.app_version}</span>}
                  <span>{fmtDate(snap.created_at)}</span>
                  {snap.status === 'ready' && (
                    <span>{snap.indexed_files} files</span>
                  )}
                  {snap.quarantine_count > 0 && (
                    <span className="text-amber-600 flex items-center gap-0.5">
                      <Shield size={9} /> {snap.quarantine_count} quarantined
                    </span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5 shrink-0">
                {snap.status === 'ready' && !snap.is_active && (
                  <button
                    onClick={() => activateSnapshot(snap.id)}
                    className="text-[10px] font-semibold text-emerald-700 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 px-2 py-1 rounded-lg transition-colors"
                  >
                    Activate
                  </button>
                )}
                <button
                  onClick={() => loadSnapDetail(snap.id)}
                  className="text-[10px] text-slate-500 border border-slate-200 hover:bg-slate-50 px-2 py-1 rounded-lg transition-colors flex items-center gap-1"
                >
                  <Eye size={10} />
                  {expandedSnap === snap.id ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                </button>
                {!snap.is_active && snap.status !== 'deleted' && (
                  <button
                    onClick={() => setDeleteConfirm(snap.id)}
                    className="text-[10px] text-red-500 border border-red-100 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors"
                  >
                    <Trash2 size={10} />
                  </button>
                )}
              </div>
            </div>

            {/* Delete confirmation */}
            {deleteConfirm === snap.id && (
              <div className="mx-4 mb-3 bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-3">
                <AlertTriangle size={14} className="text-red-600 shrink-0" />
                <span className="text-xs text-red-700 flex-1">Delete this snapshot? This cannot be undone.</span>
                <button
                  onClick={() => deleteSnapshot(snap.id)}
                  disabled={deleteLoading}
                  className="text-[10px] font-bold text-white bg-red-600 hover:bg-red-700 px-3 py-1 rounded-lg transition-colors disabled:opacity-50"
                >
                  {deleteLoading ? 'Deleting…' : 'Delete'}
                </button>
                <button onClick={() => setDeleteConfirm(null)} className="text-[10px] text-slate-500 border border-slate-200 px-2 py-1 rounded-lg hover:bg-slate-50">Cancel</button>
              </div>
            )}

            {/* Expanded detail */}
            {expandedSnap === snap.id && (
              <div className="mx-4 mb-3 bg-slate-50 border border-slate-200 rounded-lg p-3">
                {snapDetailLoading && <div className="text-xs text-slate-400 flex items-center gap-1.5"><Loader2 size={11} className="animate-spin" /> Loading…</div>}
                {!snapDetailLoading && snapDetail && (
                  <div className="flex flex-col gap-2">
                    {/* Snapshot metadata */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px]">
                      {snap.source_type === 'github' && <>
                        <div><span className="text-slate-400">Repo:</span> <span className="font-mono text-slate-700">{snap.repo_owner}/{snap.repo_name}</span></div>
                        <div><span className="text-slate-400">Branch:</span> <span className="font-mono text-slate-700">{snap.branch}</span></div>
                        <div><span className="text-slate-400">Commit SHA:</span> <span className="font-mono text-slate-700">{snap.commit_sha}</span></div>
                        <div><span className="text-slate-400">Commit date:</span> <span className="text-slate-700">{fmtDate(snap.commit_date)}</span></div>
                      </>}
                      {snap.source_type === 'zip' && <>
                        {snap.source_desc && <div className="col-span-2"><span className="text-slate-400">Source:</span> <span className="text-slate-700">{snap.source_desc}</span></div>}
                        {snap.app_version && <div><span className="text-slate-400">Version:</span> <span className="text-slate-700">{snap.app_version}</span></div>}
                        {snap.build_number && <div><span className="text-slate-400">Build:</span> <span className="text-slate-700">{snap.build_number}</span></div>}
                        {snap.git_ref && <div><span className="text-slate-400">Git ref:</span> <span className="font-mono text-slate-700">{snap.git_ref}</span></div>}
                      </>}
                      <div><span className="text-slate-400">Total files:</span> <span className="text-slate-700">{snap.total_files}</span></div>
                      <div><span className="text-slate-400">Indexed:</span> <span className="text-slate-700">{snap.indexed_files}</span></div>
                      <div><span className="text-slate-400">Excluded:</span> <span className="text-slate-700">{snap.excluded_files}</span></div>
                      <div><span className="text-slate-400">Quarantined:</span> <span className="text-slate-700">{snap.quarantine_count}</span></div>
                    </div>

                    {/* File list preview */}
                    {Array.isArray((snapDetail as Record<string, unknown>).files) && (
                      <div>
                        <div className="text-[10px] font-semibold text-slate-500 mb-1">
                          Files ({((snapDetail as Record<string, unknown>).files as unknown[]).length} shown)
                        </div>
                        <div className="max-h-40 overflow-y-auto bg-white border border-slate-200 rounded-lg p-2 space-y-0.5">
                          {((snapDetail as Record<string, unknown>).files as Array<Record<string, unknown>>).slice(0, 100).map((f, i) => (
                            <div key={i} className="text-[10px] font-mono text-slate-600 flex items-center gap-2">
                              <span className="text-slate-400 w-12 shrink-0 text-right">{String(f.line_count)}L</span>
                              <span className="truncate">{String(f.rel_path)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Quarantine list */}
                    {Array.isArray((snapDetail as Record<string, unknown>).quarantine) && ((snapDetail as Record<string, unknown>).quarantine as unknown[]).length > 0 && (
                      <div>
                        <div className="text-[10px] font-semibold text-amber-600 mb-1 flex items-center gap-1">
                          <Shield size={10} /> Quarantined files (paths only — content not stored)
                        </div>
                        <div className="max-h-24 overflow-y-auto bg-amber-50 border border-amber-200 rounded-lg p-2 space-y-0.5">
                          {((snapDetail as Record<string, unknown>).quarantine as Array<Record<string, unknown>>).map((q, i) => (
                            <div key={i} className="text-[10px] font-mono text-amber-700">
                              {String(q.rel_path)} — {String(q.pattern_matched)}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </section>

      {/* ── Test Anatomy Search ───────────────────────────────────────────── */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50">
          <Search size={14} className="text-primary" />
          <span className="text-sm font-semibold text-slate-800">Test Anatomy Search</span>
          <span className="ml-2 text-[10px] text-slate-400">Searches the active snapshot</span>
        </div>
        <div className="p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && runSearch()}
              placeholder="e.g. getActiveSnapshotId, /api/jobs, CREATE TABLE"
              className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
            <button
              onClick={runSearch}
              disabled={searchLoading}
              className="flex items-center gap-1.5 text-xs bg-primary text-white px-3 py-1.5 rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
            >
              {searchLoading ? <Loader2 size={11} className="animate-spin" /> : <Search size={11} />}
              Search
            </button>
          </div>

          {searchSnap && (
            <div className="text-[10px] text-slate-400 flex items-center gap-1.5">
              <Info size={10} />
              Searching: {String(searchSnap.snapshot_name ?? searchSnap.id)} ·{' '}
              {searchSnap.source_type === 'github' ? `SHA ${shortSha(searchSnap.commit_sha as string)}` : 'ZIP upload'}
            </div>
          )}

          {searchError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 text-xs text-red-700">{searchError}</div>
          )}

          {searchResults.length > 0 && (
            <div className="flex flex-col gap-2">
              {searchResults.map((r, i) => (
                <div key={i} className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-mono font-semibold text-primary truncate">{r.rel_path}</span>
                    <span className="text-[10px] text-slate-400 shrink-0">L{r.start_line}–{r.end_line}</span>
                    {r.symbol_name && <span className="text-[10px] text-slate-400 shrink-0 truncate max-w-32">{r.symbol_name}</span>}
                  </div>
                  <pre className="text-[10px] text-slate-600 whitespace-pre-wrap font-mono leading-relaxed overflow-hidden max-h-24">{r.snippet}</pre>
                </div>
              ))}
            </div>
          )}

          {!searchLoading && searchResults.length === 0 && searchQuery && !searchError && (
            <div className="text-xs text-slate-400 text-center py-2">No results found.</div>
          )}
        </div>
      </section>

      {/* Security note */}
      <div className="flex items-start gap-2 text-[10px] text-slate-400 bg-slate-50 border border-slate-200 rounded-lg p-3">
        <Shield size={11} className="shrink-0 mt-0.5 text-slate-400" />
        <span>
          All archives are scanned for ZIP-slip, path traversal, decompression bombs, secret patterns, and binary content before indexing.
          Quarantined files are recorded by path only — their content is never stored.
          Excluded paths include <code className="font-mono">node_modules</code>, <code className="font-mono">.git</code>, build directories, and all binary/credential file types.
        </span>
      </div>
    </div>
  );
}
