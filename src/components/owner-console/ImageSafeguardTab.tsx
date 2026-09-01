/**
 * ImageSafeguardTab.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * CP12B2 — IWILLBUILD Image Safeguard Protocol panel for the Owner Console.
 *
 * Displays:
 *  - Scanner capability status (configured / not configured)
 *  - Date-range selector (start, end, "since last scan" shortcut)
 *  - Last successful scan cursor
 *  - Run Scan button (disabled when not configured, double-click protected)
 *  - Calm one-step confirmation before starting
 *  - Run status panel (images considered/scanned/skipped/with signal/failed)
 *  - Recent runs list
 *  - Platform-wide record counts by status category
 *  - Collapsed "How this works" explanation
 *  - Disclaimer about automated assessment limitations
 *
 * Honest behaviour:
 *  - Never claims a scan occurred when none did.
 *  - Never shows a fake progress bar.
 *  - Never changes safeguard records directly.
 *  - Disabled Run button has accessible aria-describedby explanation.
 *  - Language: "Privacy signal detected — human review recommended."
 *
 * CP12B3 — Added maxBatchSize display, finding preview thumbnails.
 * CP12B5-UI — Added CSV download controls (header + per-run row).
 */

import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import {
  Shield,
  RefreshCw,
  Play,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle2,
  Eye,
  Ban,
  HelpCircle,
  Clock,
  XCircle,
  Info,
  Calendar,
  Loader2,
  CheckSquare,
  Download,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SafeguardCounts {
  pending: number;
  clear: number;
  privacySignal: number;
  elevated: number;
  blocked: number;
  unavailable: number;
  failed: number;
}

interface ScanRunRecord {
  id: string;
  rangeStart: string;
  rangeEnd: string;
  usedCursor: boolean;
  runStatus: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  imagesConsidered: number;
  imagesScanned: number;
  imagesSkipped: number;
  imagesWithSignal: number;
  imagesFailed: number;
  detectorName: string | null;
  detectorVersion: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  errorCode: string | null;
}

interface SafeguardStatus {
  configured: boolean;
  provider: string | null;
  capability: string;
  lastSuccessfulScanAt: string | null;
  lastRun: ScanRunRecord | null;
  counts: SafeguardCounts;
  maxBatchSize?: number;
}

interface FindingRecord {
  id: string;
  scanRunId: string;
  assetId: string;
  companyId: number;
  result: 'privacy_signal' | 'failed' | 'clear' | 'unavailable';
  faceCount: number;
  detectorName: string | null;
  reviewed: boolean;
  reviewerNote: string | null;
  reviewedAt: string | null;
  scannedAt: string;
}

// ── Status row config ─────────────────────────────────────────────────────────

interface StatusRowConfig {
  key: keyof SafeguardCounts;
  label: string;
  icon: ReactNode;
  colour: string;
  bg: string;
}

const STATUS_ROWS: StatusRowConfig[] = [
  { key: 'pending',      label: 'Pending',              icon: <Clock size={14} />,        colour: 'text-slate-600',  bg: 'bg-slate-100' },
  { key: 'clear',        label: 'Clear',                icon: <CheckCircle2 size={14} />, colour: 'text-emerald-700',bg: 'bg-emerald-50' },
  { key: 'privacySignal',label: 'Privacy signal',       icon: <Eye size={14} />,          colour: 'text-amber-700',  bg: 'bg-amber-50' },
  { key: 'elevated',     label: 'Review recommended',   icon: <AlertCircle size={14} />,  colour: 'text-orange-700', bg: 'bg-orange-50' },
  { key: 'blocked',      label: 'Sharing restricted',   icon: <Ban size={14} />,          colour: 'text-red-700',    bg: 'bg-red-50' },
  { key: 'unavailable',  label: 'Not assessed',         icon: <HelpCircle size={14} />,   colour: 'text-slate-500',  bg: 'bg-slate-100' },
  { key: 'failed',       label: 'Scan failed',          icon: <XCircle size={14} />,      colour: 'text-slate-500',  bg: 'bg-slate-100' },
];

const HOW_IT_WORKS = [
  'New and pending images will be selected for assessment within the chosen date range.',
  'Images remain private and are never published to create scan links.',
  'A configured moderation worker returns risk indicators only — no image bytes leave the server.',
  'Clear images continue normally.',
  'Images with a privacy signal are flagged for authorised human review.',
  'Serious results may temporarily restrict external sharing according to existing rules.',
  'Images are not automatically deleted.',
  'External reporting is not performed solely because of an automated result.',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-AU', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

function toLocalDatetimeInput(iso: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch { return ''; }
}

function runStatusBadge(status: ScanRunRecord['runStatus']): ReactNode {
  const map: Record<string, { label: string; cls: string }> = {
    pending:   { label: 'Pending',    cls: 'bg-slate-100 text-slate-600' },
    running:   { label: 'Running…',   cls: 'bg-blue-100 text-blue-700' },
    completed: { label: 'Completed',  cls: 'bg-emerald-100 text-emerald-700' },
    failed:    { label: 'Failed',     cls: 'bg-red-100 text-red-700' },
    cancelled: { label: 'Cancelled',  cls: 'bg-slate-100 text-slate-500' },
  };
  const { label, cls } = map[status] ?? { label: status, cls: 'bg-slate-100 text-slate-600' };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>;
}

// ── FindingRow component ──────────────────────────────────────────────────────

interface FindingRowProps {
  finding: FindingRecord;
  onReviewed: () => void;
}

function FindingRow({ finding, onReviewed }: FindingRowProps) {
  const [note, setNote] = useState('');
  const [decision, setDecision] = useState<'acceptable' | 'policy_concern' | 'escalated' | ''>('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(finding.reviewed);
  const [previewUrl] = useState(
    `/api/owner-console/image-safeguard/findings/${finding.id}/preview`,
  );
  const [previewError, setPreviewError] = useState(false);

  const handleSave = async () => {
    if (!decision || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/owner-console/image-safeguard/findings/${finding.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, note: note.trim() || null }),
      });
      if (res.ok) {
        setSaved(true);
        onReviewed();
      }
    } catch { /* silent */ }
    finally { setSaving(false); }
  };

  return (
    <div className={`px-5 py-4 ${saved ? 'opacity-60' : ''}`}>
      <div className="flex gap-4">
        {/* Preview thumbnail */}
        <div className="shrink-0 w-20 h-20 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center">
          {previewError ? (
            <span className="text-xs text-slate-400 text-center px-1">Preview unavailable</span>
          ) : (
            <img
              src={previewUrl}
              alt="Finding preview"
              className="w-full h-full object-cover"
              onError={() => setPreviewError(true)}
              loading="lazy"
            />
          )}
        </div>

        {/* Finding details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 font-medium">
              <Eye size={11} />
              Privacy signal
            </span>
            {saved && (
              <span className="inline-flex items-center gap-1 text-xs bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5">
                <CheckSquare size={11} />
                Reviewed
              </span>
            )}
            <span className="text-xs text-slate-400 font-mono">{finding.id.slice(0, 8)}…</span>
          </div>

          <p className="text-xs text-slate-500 mb-2">
            Scanned: {fmtDate(finding.scannedAt)}
            {finding.faceCount > 0 && (
              <span className="ml-2 text-slate-400">· {finding.faceCount} face{finding.faceCount !== 1 ? 's' : ''} detected</span>
            )}
          </p>

          {!saved && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {(['acceptable', 'policy_concern', 'escalated'] as const).map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDecision(d)}
                    className={`text-xs rounded-lg px-3 py-1.5 border font-medium transition-colors ${
                      decision === d
                        ? 'bg-violet-600 text-white border-violet-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {d === 'acceptable' ? 'Acceptable' : d === 'policy_concern' ? 'Policy concern' : 'Escalated'}
                  </button>
                ))}
              </div>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Brief internal note (optional, max 500 chars)"
                maxLength={500}
                rows={2}
                className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={!decision || saving}
                className="inline-flex items-center gap-1.5 text-xs rounded-lg px-3 py-1.5 bg-violet-600 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-violet-700 transition-colors"
              >
                {saving ? <Loader2 size={11} className="animate-spin" /> : <CheckSquare size={11} />}
                Save review
              </button>
            </div>
          )}

          {saved && finding.reviewerNote && (
            <p className="text-xs text-slate-500 italic">Note: {finding.reviewerNote}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── CsvDownloadButton ─────────────────────────────────────────────────────────

/**
 * Renders a "Download CSV" / "Download latest CSV" button that fetches the
 * authenticated same-origin export endpoint and triggers a browser download.
 *
 * Rules:
 *  - Only rendered for completed runs (caller is responsible for the guard).
 *  - Duplicate clicks are blocked while a download is in flight.
 *  - Errors are surfaced inline; they do not propagate to the parent.
 *  - No CSV is generated in the browser; no R2 keys or image URLs are exposed.
 */

interface CsvDownloadButtonProps {
  /** UUID of the completed scan run to export. */
  runId: string;
  /** Visual variant: 'header' shows a slightly larger button; 'row' is compact. */
  variant?: 'header' | 'row';
  /** Optional accessible label suffix (e.g. "for run abc123…"). */
  ariaLabel?: string;
}

function CsvDownloadButton({ runId, variant = 'row', ariaLabel }: CsvDownloadButtonProps) {
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  const handleDownload = async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setState('loading');
    setErrorMsg(null);

    try {
      const res = await fetch(
        `/api/owner-console/image-safeguard/runs/${runId}/export.csv`,
        { credentials: 'include' },
      );

      if (!res.ok) {
        let msg = `Export failed (HTTP ${res.status})`;
        try {
          const body = (await res.json()) as { error?: string; message?: string };
          if (body.message ?? body.error) msg = body.message ?? body.error ?? msg;
        } catch { /* ignore parse error — use the status-based message */ }
        setErrorMsg(msg);
        setState('error');
        return;
      }

      // Stream the response into a Blob and trigger a browser download.
      // The filename is taken from Content-Disposition when present; otherwise
      // we fall back to a safe generated name.
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const filenameMatch = /filename="?([^";\r\n]+)"?/i.exec(disposition);
      const filename = filenameMatch?.[1] ?? `safeguard-run-${runId.slice(0, 8)}.csv`;

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);

      setState('idle');
    } catch {
      setErrorMsg('Network error — could not reach the server.');
      setState('error');
    } finally {
      inFlightRef.current = false;
    }
  };

  const isHeader = variant === 'header';
  const label = ariaLabel ?? `Download CSV for run ${runId.slice(0, 8)}…`;

  return (
    <div className={isHeader ? 'flex flex-col items-end gap-1' : 'flex flex-col items-start gap-1'}>
      <button
        type="button"
        onClick={() => void handleDownload()}
        disabled={state === 'loading'}
        aria-label={label}
        aria-busy={state === 'loading'}
        aria-disabled={state === 'loading'}
        data-testid={isHeader ? 'csv-download-header' : `csv-download-run-${runId}`}
        className={
          isHeader
            ? 'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold bg-violet-600 text-white hover:bg-violet-700 active:bg-violet-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors'
            : 'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors'
        }
      >
        {state === 'loading'
          ? <Loader2 size={isHeader ? 14 : 12} className="animate-spin" aria-hidden="true" />
          : <Download size={isHeader ? 14 : 12} aria-hidden="true" />}
        {isHeader ? 'Download latest CSV' : 'Download CSV'}
      </button>

      {state === 'error' && errorMsg && (
        <p
          role="alert"
          className="text-xs text-red-600 flex items-center gap-1"
          data-testid={isHeader ? 'csv-error-header' : `csv-error-run-${runId}`}
        >
          <AlertCircle size={11} aria-hidden="true" />
          {errorMsg}
        </p>
      )}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ImageSafeguardTab() {
  const [status, setStatus] = useState<SafeguardStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [recentRuns, setRecentRuns] = useState<ScanRunRecord[]>([]);

  // Date range state
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const [sinceInput, setSinceInput] = useState(toLocalDatetimeInput(sevenDaysAgo.toISOString()));
  const [untilInput, setUntilInput] = useState(toLocalDatetimeInput(now.toISOString()));
  const [useCursor, setUseCursor] = useState(false);

  // Scan state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [lastScanResult, setLastScanResult] = useState<{ runId: string; rangeStart: string; rangeEnd: string } | null>(null);
  const scanningRef = useRef(false);

  // Live scan progress (polled while scanning === true)
  const [liveProgress, setLiveProgress] = useState<{
    runStatus: string;
    imagesConsidered: number;
    imagesScanned: number;
    imagesSkipped: number;
    imagesWithSignal: number;
    imagesFailed: number;
    errorCode: string | null;
  } | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // UI state
  const [howOpen, setHowOpen] = useState(false);
  const [runsOpen, setRunsOpen] = useState(false);
  const [findingsOpen, setFindingsOpen] = useState(false);

  // Findings state (privacy_signal items for review)
  const [findings, setFindings] = useState<FindingRecord[]>([]);
  const [findingsLoading, setFindingsLoading] = useState(false);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchStatus = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    setScanError(null);
    try {
      const res = await fetch('/api/owner-console/image-safeguard/status', { credentials: 'include' });
      if (res.ok) {
        const data = (await res.json()) as SafeguardStatus;
        setStatus(data);
        // Pre-fill since from cursor if available
        if (data.lastSuccessfulScanAt && !useCursor) {
          // Don't auto-override user's input — just update the cursor display
        }
      } else {
        setStatus(null);
      }
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [useCursor]);

  const fetchRuns = useCallback(async () => {
    try {
      const res = await fetch('/api/owner-console/image-safeguard/runs?limit=5', { credentials: 'include' });
      if (res.ok) {
        const data = (await res.json()) as { runs: ScanRunRecord[] };
        setRecentRuns(data.runs ?? []);
      }
    } catch { /* silent */ }
  }, []);

  const fetchFindings = useCallback(async () => {
    setFindingsLoading(true);
    try {
      const res = await fetch('/api/owner-console/image-safeguard/findings?result=privacy_signal&limit=20', { credentials: 'include' });
      if (res.ok) {
        const data = (await res.json()) as { findings: FindingRecord[] };
        setFindings(data.findings ?? []);
      }
    } catch { /* silent */ }
    finally { setFindingsLoading(false); }
  }, []);

  useEffect(() => {
    void fetchStatus(false);
    void fetchRuns();
    void fetchFindings();
  }, [fetchStatus, fetchRuns, fetchFindings]);

  // Poll every 3 s while any run is pending or running — stops automatically
  // once all visible runs reach a terminal state (completed/failed/cancelled).
  useEffect(() => {
    const hasActiveRun = recentRuns.some(
      r => r.runStatus === 'pending' || r.runStatus === 'running',
    );
    if (!hasActiveRun) return;
    const id = setInterval(() => {
      void fetchRuns();
      void fetchStatus(true);
    }, 3000);
    return () => clearInterval(id);
  }, [recentRuns, fetchRuns, fetchStatus]);

  // ── Live progress polling ──────────────────────────────────────────────────
  // Starts when a scan is initiated (lastScanResult set), stops when the run
  // reaches a terminal state or scanning flag clears.
  useEffect(() => {
    if (!lastScanResult?.runId) {
      setLiveProgress(null);
      return;
    }
    const runId = lastScanResult.runId;

    const poll = async () => {
      try {
        const res = await fetch(
          `/api/owner-console/image-safeguard/runs/${runId}/progress`,
          { credentials: 'include' },
        );
        if (!res.ok) return;
        const data = await res.json() as {
          runStatus: string;
          imagesConsidered: number;
          imagesScanned: number;
          imagesSkipped: number;
          imagesWithSignal: number;
          imagesFailed: number;
          errorCode: string | null;
        };
        setLiveProgress(data);
        // Stop polling + clear scanning flag once terminal
        if (data.runStatus === 'completed' || data.runStatus === 'failed' || data.runStatus === 'cancelled') {
          if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current);
            progressIntervalRef.current = null;
          }
          setScanning(false);
          scanningRef.current = false;
          // Refresh the run list one final time so the completed row appears
          void fetchRuns();
          void fetchStatus(true);
        }
      } catch { /* silent — progress display is best-effort */ }
    };

    void poll(); // immediate first fetch
    progressIntervalRef.current = setInterval(() => void poll(), 2000);

    // Safety timeout — if the run is still active after 5 min, unlock the button
    const safetyTimeout = setTimeout(() => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      setScanning(false);
      scanningRef.current = false;
      void fetchRuns();
    }, 5 * 60 * 1000);

    return () => {
      clearTimeout(safetyTimeout);
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    };
  }, [lastScanResult?.runId]);

  const handleRefresh = () => {
    void fetchStatus(true);
    void fetchRuns();
  };

  // ── Scan flow ──────────────────────────────────────────────────────────────

  const handleRunClick = () => {
    if (scanningRef.current) return;
    setScanError(null);
    setConfirmOpen(true);
  };

  const handleConfirmScan = async () => {
    if (scanningRef.current) return;
    scanningRef.current = true;
    setScanning(true);
    setConfirmOpen(false);
    setScanError(null);
    setLastScanResult(null);
    setLiveProgress(null);

    try {
      const body: { since?: string; until?: string; useCursor?: boolean } = {};
      if (useCursor) {
        body.useCursor = true;
      } else {
        if (sinceInput) body.since = new Date(sinceInput).toISOString();
        if (untilInput) body.until = new Date(untilInput).toISOString();
      }

      const res = await fetch('/api/owner-console/image-safeguard/scan', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        error?: string; message?: string;
        runId?: string; rangeStart?: string; rangeEnd?: string;
      };

      if (!res.ok) {
        setScanError(data.message ?? data.error ?? 'Scan request failed.');
        setScanning(false);
        scanningRef.current = false;
      } else if (data.runId) {
        setLastScanResult({ runId: data.runId, rangeStart: data.rangeStart ?? '', rangeEnd: data.rangeEnd ?? '' });
        // Keep scanning=true — the progress polling effect will flip it false
        // once the run reaches a terminal state (completed/failed/cancelled).
        // fetchRuns/fetchStatus will also update the run list in parallel.
        void fetchRuns();
        void fetchStatus(true);
      }
    } catch {
      setScanError('Network error — could not reach the server.');
      setScanning(false);
      scanningRef.current = false;
    }
    // NOTE: no finally block — scanning stays true until progress polling terminates it.
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const totalRecords = status
    ? Object.values(status.counts).reduce((a, b) => a + b, 0)
    : 0;

  const canScan = Boolean(status?.configured) && !scanning;

  // The most recent completed run with findings — used for the header-level CSV download.
  const latestCompletedRun = recentRuns.find(
    r => r.runStatus === 'completed' && r.imagesWithSignal > 0,
  ) ?? null;

  return (
    <div className="max-w-3xl space-y-5">

      {/* ── Main panel ── */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">

        {/* Header */}
        <div className="flex items-start gap-3 p-5 border-b border-slate-100">
          <div className="w-10 h-10 rounded-lg bg-violet-100 flex items-center justify-center shrink-0 mt-0.5">
            <Shield size={18} className="text-violet-700" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-bold text-base text-slate-900">IWILLBUILD Image Safeguard Protocol</h2>
                <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                  Flags job photos that may contain faces so a platform owner can review unusual volume.
                  Face detection is a privacy signal only — not identity recognition, child detection,
                  or a finding of misconduct.
                </p>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                  Ordinary photo capture and upload are never interrupted. Safeguard checks apply
                  when images are externally shared and when a platform owner initiates a scan.
                </p>
              </div>
              {/* CSV download area — always rendered once status has loaded */}
              {!loading && (
                <div className="shrink-0 flex flex-col items-end gap-1.5">
                  {latestCompletedRun ? (
                    <CsvDownloadButton
                      runId={latestCompletedRun.id}
                      variant="header"
                      ariaLabel={`Download latest CSV (run ${latestCompletedRun.id.slice(0, 8)}…)`}
                    />
                  ) : (
                    <button
                      type="button"
                      disabled
                      aria-disabled="true"
                      data-testid="csv-download-placeholder"
                      className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold bg-slate-100 text-slate-400 cursor-not-allowed"
                    >
                      <Download size={14} aria-hidden="true" />
                      Download CSV — available after a scan completes
                    </button>
                  )}
                  <p
                    data-testid="csv-helper-text"
                    className="text-xs text-slate-400 text-right max-w-xs leading-relaxed"
                  >
                    Completed CSV reports download through your browser. Flagged images appear under Findings for review.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Scanner status banner */}
        <div className="px-5 py-4 bg-slate-50 border-b border-slate-100">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <RefreshCw size={14} className="animate-spin" />Loading status…
            </div>
          ) : status === null ? (
            <div className="flex items-center gap-2 text-sm text-red-600">
              <AlertCircle size={14} />Could not load safeguard status. Try refreshing.
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${status.configured ? 'bg-emerald-500' : 'bg-amber-400'}`} />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800">
                  Scanner:{' '}
                  <span className={status.configured ? 'text-emerald-700' : 'text-amber-700'}>
                    {status.configured ? `Configured (${status.provider ?? 'unknown'})` : 'Not configured'}
                  </span>
                </p>
                {!status.configured && (
                  <p id="scan-disabled-reason" data-testid="scan-not-configured-message" className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                    Image scanning is not active yet. Image Safeguard acknowledgements and manual review controls remain available,
                    but no automated image assessment has been performed.
                    A private authenticated classifier service must pass the synthetic-image test before scanning can be enabled.
                  </p>
                )}
                <p className="text-xs text-slate-400 mt-1">
                  Last successful scan: {fmtDate(status.lastSuccessfulScanAt)}
                </p>
                {status.maxBatchSize !== undefined && (
                  <p className="text-xs text-slate-400 mt-0.5">
                    Max batch size: <strong>{status.maxBatchSize}</strong> images per run
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Date range selector */}
        <div className="px-5 py-4 border-b border-slate-100">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Scan date range</p>
          <div className="flex flex-col gap-3">
            {/* Use cursor shortcut */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={useCursor}
                onChange={e => setUseCursor(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-violet-600"
              />
              <span className="text-sm text-slate-700">
                Scan since last successful scan
                {status?.lastSuccessfulScanAt && (
                  <span className="text-slate-400 ml-1">({fmtDate(status.lastSuccessfulScanAt)})</span>
                )}
              </span>
            </label>

            {!useCursor && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Start date/time</label>
                  <input
                    type="datetime-local"
                    value={sinceInput}
                    onChange={e => setSinceInput(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">End date/time</label>
                  <input
                    type="datetime-local"
                    value={untilInput}
                    onChange={e => setUntilInput(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Last run summary */}
        {!loading && status?.lastRun && (
          <div className="px-5 py-4 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Last run</p>
            <div className="rounded-lg bg-slate-50 px-4 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-700">Status</span>
                {runStatusBadge(status.lastRun.runStatus)}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-700">Range</span>
                <span className="text-xs text-slate-500">{fmtDate(status.lastRun.rangeStart)} → {fmtDate(status.lastRun.rangeEnd)}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                {[
                  { label: 'Considered', val: status.lastRun.imagesConsidered },
                  { label: 'Scanned',    val: status.lastRun.imagesScanned },
                  { label: 'Skipped',    val: status.lastRun.imagesSkipped },
                  { label: 'Signal',     val: status.lastRun.imagesWithSignal },
                  { label: 'Failed',     val: status.lastRun.imagesFailed },
                ].map(({ label, val }) => (
                  <div key={label} className="text-center">
                    <p className="text-lg font-bold text-slate-800 tabular-nums">{val.toLocaleString()}</p>
                    <p className="text-xs text-slate-500">{label}</p>
                  </div>
                ))}
              </div>
              {status.lastRun.errorCode && (
                <p className="text-xs text-red-600 mt-1">Error: {status.lastRun.errorCode}</p>
              )}
            </div>
          </div>
        )}

        {/* Record counts */}
        {!loading && status && (
          <div className="px-5 py-4 border-b border-slate-100">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Platform record counts</p>
              <p className="text-xs text-slate-400">{totalRecords.toLocaleString()} total</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {STATUS_ROWS.map(row => (
                <div key={row.key} className="flex items-center justify-between rounded-lg px-3 py-2 bg-slate-50">
                  <div className="flex items-center gap-2">
                    <span className={`w-6 h-6 rounded flex items-center justify-center ${row.bg} ${row.colour}`}>{row.icon}</span>
                    <span className={`text-sm ${row.colour}`}>{row.label}</span>
                  </div>
                  <span className={`text-sm font-semibold tabular-nums ${row.colour}`}>
                    {(status.counts[row.key] ?? 0).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Scan error */}
        {scanError && (
          <div className="mx-5 mt-4 flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            <AlertCircle size={15} className="shrink-0 mt-0.5" />{scanError}
          </div>
        )}

        {/* Last scan initiated confirmation */}
        {lastScanResult && !scanError && (
          <div className="mx-5 mt-4 flex items-start gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
            <CheckSquare size={15} className="shrink-0 mt-0.5" />
            Scan initiated (run ID: <code className="font-mono text-xs">{lastScanResult.runId.slice(0, 8)}…</code>).
            Results will appear in the run history below.
          </div>
        )}

        {/* Controls */}
        <div className="px-5 py-4 flex flex-wrap items-center gap-3">
          {/* Confirmation dialog */}
          {confirmOpen ? (
            <div className="w-full rounded-lg bg-amber-50 border border-amber-200 px-4 py-4">
              <p className="text-sm font-semibold text-amber-800 mb-1">Confirm scan</p>
              <p className="text-xs text-amber-700 mb-3 leading-relaxed">
                This will assess job photos in the selected date range.
                {useCursor
                  ? ` Starting from last successful scan (${fmtDate(status?.lastSuccessfulScanAt)}).`
                  : ` Range: ${sinceInput ? fmtDate(new Date(sinceInput).toISOString()) : '7 days ago'} → ${untilInput ? fmtDate(new Date(untilInput).toISOString()) : 'now'}.`}
                {' '}Results are indicators for human review only.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleConfirmScan()}
                  className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold bg-violet-600 text-white hover:bg-violet-700 transition-colors"
                >
                  <Play size={13} />Confirm and start
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmOpen(false)}
                  className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={handleRunClick}
                disabled={!canScan}
                aria-disabled={!canScan}
                aria-describedby={!status?.configured ? 'scan-disabled-reason' : undefined}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold bg-violet-600 text-white hover:bg-violet-700 active:bg-violet-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {scanning ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                {scanning ? 'Scan running…' : 'Run Image Safeguard Scan'}
              </button>

              {/* Live scan counter — shown while scanning, updates every 2 s */}
              {scanning && liveProgress && (
                <div className="flex items-center gap-3 rounded-lg bg-violet-50 border border-violet-200 px-4 py-2.5 text-sm">
                  <Loader2 size={13} className="animate-spin text-violet-500 shrink-0" />
                  <div className="flex items-center gap-3 tabular-nums text-violet-800 font-medium flex-wrap">
                    <span>
                      <span className="font-bold">{liveProgress.imagesConsidered}</span>
                      <span className="text-violet-500 font-normal"> found</span>
                    </span>
                    <span className="text-violet-300">·</span>
                    <span>
                      <span className="font-bold">{liveProgress.imagesScanned}</span>
                      <span className="text-violet-500 font-normal"> scanned</span>
                    </span>
                    {liveProgress.imagesWithSignal > 0 && (
                      <>
                        <span className="text-violet-300">·</span>
                        <span>
                          <span className="font-bold text-amber-600">{liveProgress.imagesWithSignal}</span>
                          <span className="text-amber-500 font-normal"> signal</span>
                        </span>
                      </>
                    )}
                    {liveProgress.imagesFailed > 0 && (
                      <>
                        <span className="text-violet-300">·</span>
                        <span>
                          <span className="font-bold text-red-500">{liveProgress.imagesFailed}</span>
                          <span className="text-red-400 font-normal"> failed</span>
                        </span>
                      </>
                    )}
                    <span className="text-xs text-violet-400 font-normal">
                      ({liveProgress.runStatus})
                    </span>
                  </div>
                </div>
              )}

              {/* Waiting for first progress tick */}
              {scanning && !liveProgress && (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 size={13} className="animate-spin" />
                  <span>Starting scan…</span>
                </div>
              )}

              <button
                type="button"
                onClick={handleRefresh}
                disabled={loading || refreshing}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                Refresh
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Recent runs (collapsible) ── */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setRunsOpen(v => !v)}
          className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition-colors"
          aria-expanded={runsOpen}
        >
          <div className="flex items-center gap-2">
            <Calendar size={15} className="text-slate-400" />
            <span className="text-sm font-semibold text-slate-700">Recent scan runs</span>
            {recentRuns.length > 0 && (
              <span className="text-xs text-slate-400">({recentRuns.length})</span>
            )}
          </div>
          {runsOpen ? <ChevronUp size={15} className="text-slate-400" /> : <ChevronDown size={15} className="text-slate-400" />}
        </button>

        {runsOpen && (
          <div className="border-t border-slate-100">
            {recentRuns.length === 0 ? (
              <p className="px-5 py-4 text-sm text-slate-500">No scan runs yet.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {recentRuns.map(run => (
                  <div key={run.id} className="px-5 py-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {runStatusBadge(run.runStatus)}
                        <span className="text-xs text-slate-400 font-mono">{run.id.slice(0, 8)}…</span>
                      </div>
                      <span className="text-xs text-slate-400">{fmtDate(run.createdAt)}</span>
                    </div>
                    <p className="text-xs text-slate-500 mb-2">
                      {fmtDate(run.rangeStart)} → {fmtDate(run.rangeEnd)}
                      {run.usedCursor && <span className="ml-1 text-violet-600">(cursor)</span>}
                    </p>
                    <div className="flex flex-wrap gap-3 text-xs text-slate-600">
                      <span>Considered: <strong>{run.imagesConsidered}</strong></span>
                      <span>Scanned: <strong>{run.imagesScanned}</strong></span>
                      <span>Signal: <strong className={run.imagesWithSignal > 0 ? 'text-amber-700' : ''}>{run.imagesWithSignal}</strong></span>
                      <span>Skipped: <strong>{run.imagesSkipped}</strong></span>
                      <span>Failed: <strong>{run.imagesFailed}</strong></span>
                    </div>
                    {run.errorCode && (
                      <p className="text-xs text-red-600 mt-1">Error: {run.errorCode}</p>
                    )}
                    {run.runStatus === 'completed' && run.imagesWithSignal > 0 && (
                      <div className="mt-3">
                        <CsvDownloadButton
                          runId={run.id}
                          variant="row"
                          ariaLabel={`Download CSV for run ${run.id.slice(0, 8)}…`}
                        />
                      </div>
                    )}
                    {run.runStatus === 'completed' && run.imagesWithSignal === 0 && (
                      <p className="mt-2 text-xs text-slate-400">No findings — CSV not available for this run.</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Findings for review (privacy_signal) ── */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setFindingsOpen(v => !v)}
          className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition-colors"
          aria-expanded={findingsOpen}
        >
          <div className="flex items-center gap-2">
            <Eye size={15} className="text-amber-500" />
            <span className="text-sm font-semibold text-slate-700">Findings for review</span>
            {findings.length > 0 && (
              <span className="text-xs bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 font-medium">{findings.length}</span>
            )}
          </div>
          {findingsOpen ? <ChevronUp size={15} className="text-slate-400" /> : <ChevronDown size={15} className="text-slate-400" />}
        </button>

        {findingsOpen && (
          <div className="border-t border-slate-100">
            {/* Disclaimer */}
            <div className="px-5 py-3 bg-amber-50 border-b border-amber-100 flex items-start gap-2">
              <AlertCircle size={14} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 leading-relaxed">
                A privacy signal means human review is recommended — it is not a legal conclusion
                or proof of inappropriate content. No automated action has been taken.
              </p>
            </div>

            {findingsLoading ? (
              <div className="px-5 py-6 flex items-center gap-2 text-sm text-slate-500">
                <Loader2 size={14} className="animate-spin" />
                Loading findings…
              </div>
            ) : findings.length === 0 ? (
              <p className="px-5 py-4 text-sm text-slate-500">No findings requiring review.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {findings.map(finding => (
                  <FindingRow key={finding.id} finding={finding} onReviewed={() => void fetchFindings()} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── How this works (collapsible) ── */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setHowOpen(v => !v)}
          className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition-colors"
          aria-expanded={howOpen}
        >
          <div className="flex items-center gap-2">
            <Info size={15} className="text-slate-400" />
            <span className="text-sm font-semibold text-slate-700">How this works</span>
          </div>
          {howOpen ? <ChevronUp size={15} className="text-slate-400" /> : <ChevronDown size={15} className="text-slate-400" />}
        </button>

        {howOpen && (
          <div className="px-5 pb-5 border-t border-slate-100">
            <ol className="mt-4 space-y-2 list-none">
              {HOW_IT_WORKS.map((step, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-slate-600">
                  <span className="w-5 h-5 rounded-full bg-violet-100 text-violet-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
            <div className="mt-5 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 flex items-start gap-2">
              <AlertCircle size={14} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 leading-relaxed">
                Automated assessment can make mistakes. Safeguard results
                support—not replace—appropriate human judgment and legal processes.
              </p>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
