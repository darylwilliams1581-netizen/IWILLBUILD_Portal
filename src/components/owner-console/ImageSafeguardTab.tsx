/**
 * ImageSafeguardTab.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * CP12B1 — IWILLBUILD Image Safeguard Protocol panel for the Owner Console.
 *
 * Displays:
 *  - Scanner capability status (configured / not configured)
 *  - Platform-wide record counts by status category
 *  - Run Scan button (disabled when not configured, with accessible explanation)
 *  - Refresh Status button
 *  - Collapsed "How this works" explanation
 *  - Disclaimer about automated assessment limitations
 *
 * Honest behaviour:
 *  - Never claims a scan occurred when none did.
 *  - Never shows a fake progress bar.
 *  - Never changes safeguard records.
 *  - Disabled Run button has an accessible aria-describedby explanation.
 */

import { useState, useEffect, useCallback, type ReactNode } from 'react';
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

interface SafeguardStatus {
  configured: boolean;
  provider: string | null;
  capability: string;
  lastRunAt: string | null;
  counts: SafeguardCounts;
}

// ── Status row config ─────────────────────────────────────────────────────────

interface StatusRowConfig {
  key: keyof SafeguardCounts;
  label: string;
  icon: ReactNode;
  colour: string;   // Tailwind text colour
  bg: string;       // Tailwind bg colour for the icon badge
}

const STATUS_ROWS: StatusRowConfig[] = [
  {
    key: 'pending',
    label: 'Pending',
    icon: <Clock size={14} />,
    colour: 'text-slate-600',
    bg: 'bg-slate-100',
  },
  {
    key: 'clear',
    label: 'Clear',
    icon: <CheckCircle2 size={14} />,
    colour: 'text-emerald-700',
    bg: 'bg-emerald-50',
  },
  {
    key: 'privacySignal',
    label: 'Privacy signal',
    icon: <Eye size={14} />,
    colour: 'text-amber-700',
    bg: 'bg-amber-50',
  },
  {
    key: 'elevated',
    label: 'Review recommended',
    icon: <AlertCircle size={14} />,
    colour: 'text-orange-700',
    bg: 'bg-orange-50',
  },
  {
    key: 'blocked',
    label: 'Sharing restricted',
    icon: <Ban size={14} />,
    colour: 'text-red-700',
    bg: 'bg-red-50',
  },
  {
    key: 'unavailable',
    label: 'Not assessed',
    icon: <HelpCircle size={14} />,
    colour: 'text-slate-500',
    bg: 'bg-slate-100',
  },
  {
    key: 'failed',
    label: 'Scan failed',
    icon: <XCircle size={14} />,
    colour: 'text-slate-500',
    bg: 'bg-slate-100',
  },
];

// ── How this works steps ──────────────────────────────────────────────────────

const HOW_IT_WORKS = [
  'New and pending images will be selected for assessment.',
  'Images will remain private and will not be published to create scan links.',
  'A configured moderation service will return risk indicators.',
  'Clear images continue normally.',
  'Uncertain images may be marked for authorised review.',
  'Serious results may temporarily restrict external sharing.',
  'Images are not automatically deleted.',
  'External reporting is not performed solely because of an automated result.',
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function ImageSafeguardTab() {
  const [status, setStatus] = useState<SafeguardStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [howOpen, setHowOpen] = useState(false);

  const fetchStatus = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    setScanError(null);
    try {
      const res = await fetch('/api/owner-console/image-safeguard/status', {
        credentials: 'include',
      });
      if (res.ok) {
        const data = (await res.json()) as SafeguardStatus;
        setStatus(data);
      } else {
        setStatus(null);
      }
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus(false);
  }, [fetchStatus]);

  const handleRefresh = () => void fetchStatus(true);

  const handleRunScan = async () => {
    // Run button is only enabled when configured=true.
    // This path is unreachable in CP12B1 (configured is always false).
    setScanError(null);
    try {
      const res = await fetch('/api/owner-console/image-safeguard/scan', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        setScanError(data.message ?? data.error ?? 'Scan request failed.');
      }
    } catch {
      setScanError('Network error — could not reach the server.');
    }
  };

  const totalRecords = status
    ? Object.values(status.counts).reduce((a, b) => a + b, 0)
    : 0;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl space-y-6">

      {/* ── Main panel ── */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">

        {/* Header */}
        <div className="flex items-start gap-3 p-5 border-b border-slate-100">
          <div className="w-10 h-10 rounded-lg bg-violet-100 flex items-center justify-center shrink-0 mt-0.5">
            <Shield size={18} className="text-violet-700" />
          </div>
          <div className="min-w-0">
            <h2 className="font-bold text-base text-slate-900">
              IWILLBUILD Image Safeguard Protocol
            </h2>
            <p className="text-sm text-slate-600 mt-1 leading-relaxed">
              The Image Safeguard Protocol helps identify images that may contain
              inappropriate material or potential privacy concerns before they are
              shared outside IWILLBUILD. Automated results are indicators only and
              may require review by an authorised IWILLBUILD Support Team member.
            </p>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              Ordinary photo capture and upload are not interrupted. Safeguard
              checks are applied when images are externally shared and when an
              authorised platform owner initiates a scan.
            </p>
          </div>
        </div>

        {/* Scanner status banner */}
        <div className="px-5 py-4 bg-slate-50 border-b border-slate-100">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <RefreshCw size={14} className="animate-spin" />
              Loading status…
            </div>
          ) : status === null ? (
            <div className="flex items-center gap-2 text-sm text-red-600">
              <AlertCircle size={14} />
              Could not load safeguard status. Try refreshing.
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${status.configured ? 'bg-emerald-500' : 'bg-amber-400'}`} />
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  Scanner status:{' '}
                  <span className={status.configured ? 'text-emerald-700' : 'text-amber-700'}>
                    {status.configured ? 'Configured' : 'Not configured'}
                  </span>
                </p>
                {!status.configured && (
                  <p
                    id="scan-disabled-reason"
                    className="text-xs text-slate-500 mt-0.5"
                  >
                    Image scanning is not configured yet. The sharing acknowledgment
                    remains active, but no automated image assessment has been
                    performed.
                  </p>
                )}
                <p className="text-xs text-slate-400 mt-1">
                  Last scan: {status.lastRunAt ? new Date(status.lastRunAt).toLocaleString('en-AU') : 'Never'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Record counts */}
        {!loading && status && (
          <div className="px-5 py-4 border-b border-slate-100">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Record counts
              </p>
              <p className="text-xs text-slate-400">{totalRecords.toLocaleString()} total</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {STATUS_ROWS.map((row) => (
                <div
                  key={row.key}
                  className="flex items-center justify-between rounded-lg px-3 py-2 bg-slate-50"
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-6 h-6 rounded flex items-center justify-center ${row.bg} ${row.colour}`}>
                      {row.icon}
                    </span>
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
            <AlertCircle size={15} className="shrink-0 mt-0.5" />
            {scanError}
          </div>
        )}

        {/* Controls */}
        <div className="px-5 py-4 flex flex-wrap items-center gap-3">
          {/* Run Scan — disabled when not configured */}
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => void handleRunScan()}
              disabled={!status?.configured || loading}
              aria-disabled={!status?.configured || loading}
              aria-describedby={!status?.configured ? 'scan-disabled-reason' : undefined}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold
                bg-violet-600 text-white
                hover:bg-violet-700 active:bg-violet-800
                disabled:opacity-40 disabled:cursor-not-allowed
                transition-colors"
            >
              <Play size={14} />
              Run Image Safeguard Scan
            </button>
          </div>

          {/* Refresh Status */}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading || refreshing}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium
              border border-slate-200 bg-white text-slate-700
              hover:bg-slate-50 active:bg-slate-100
              disabled:opacity-40 disabled:cursor-not-allowed
              transition-colors"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            Refresh Status
          </button>
        </div>
      </div>

      {/* ── How this works (collapsible) ── */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setHowOpen((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition-colors"
          aria-expanded={howOpen}
        >
          <div className="flex items-center gap-2">
            <Info size={15} className="text-slate-400" />
            <span className="text-sm font-semibold text-slate-700">How this works</span>
          </div>
          {howOpen ? (
            <ChevronUp size={15} className="text-slate-400" />
          ) : (
            <ChevronDown size={15} className="text-slate-400" />
          )}
        </button>

        {howOpen && (
          <div className="px-5 pb-5 border-t border-slate-100">
            <ol className="mt-4 space-y-2 list-none">
              {HOW_IT_WORKS.map((step, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-slate-600">
                  <span className="w-5 h-5 rounded-full bg-violet-100 text-violet-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>

            {/* Disclaimer */}
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
