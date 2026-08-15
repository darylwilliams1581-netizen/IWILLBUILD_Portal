/**
 * BugReportsTab — Owner Console tab for reviewing and resolving bug reports.
 * Includes diagnostic timeline and Dazza Review panel (platform-owner only).
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Bug, RefreshCw, Search, X, ChevronDown, ExternalLink,
  CheckCircle2, Clock, AlertCircle, Loader2, Image,
  User, Building2, Monitor, Calendar, Tag, MessageSquare,
  Circle, ArrowRight, Activity, Download, ChevronRight,
  Smartphone, Globe, WifiOff, Package, FileText,
  Clipboard, ClipboardCheck,
} from 'lucide-react';
import { BUG_CATEGORIES } from '@/components/BugReportModal';
import { usePermissions } from '@/lib/usePermissions';
import {
  buildReference,
  buildSummaryMd,
  buildSanitisedDiagnostics,
  parseDiagEvents,
  type BugReportRow,
} from '@/lib/bugReportBundleClient';
import DazzaReviewPanel from './DazzaReviewPanel';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parse a MySQL DATETIME string safely as UTC.
 *
 * MySQL returns bare strings like "2026-08-15 00:54:00" with no timezone
 * suffix. Without a suffix, new Date() treats the value as LOCAL time on
 * some engines, producing timestamps that are hours off.
 * Appending 'Z' forces UTC interpretation on all engines.
 */
function parseMysqlDatetime(dateStr: string): Date {
  // Already has a timezone suffix — use as-is
  if (dateStr.includes('T') && (dateStr.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(dateStr))) {
    return new Date(dateStr);
  }
  // Replace the space separator with T and append Z to force UTC
  const iso = dateStr.replace(' ', 'T');
  const withZ = iso.endsWith('Z') ? iso : iso + 'Z';
  return new Date(withZ);
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - parseMysqlDatetime(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function fmtDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return parseMysqlDatetime(dateStr).toLocaleString('en-AU', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function categoryLabel(value: string): string {
  return BUG_CATEGORIES.find(c => c.value === value)?.label ?? value.replace(/_/g, ' ');
}

function platformIcon(platform: string | null) {
  if (!platform) return <Globe size={11} />;
  if (platform === 'ios' || platform === 'android' || platform === 'native') return <Smartphone size={11} />;
  return <Globe size={11} />;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  open:        { label: 'Open',        color: 'bg-red-100 text-red-700 border-red-200',             icon: <Circle size={10} className="fill-red-500 text-red-500" /> },
  in_progress: { label: 'In Progress', color: 'bg-amber-100 text-amber-700 border-amber-200',       icon: <Clock size={10} /> },
  resolved:    { label: 'Resolved',    color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: <CheckCircle2 size={10} /> },
  closed:      { label: 'Closed',      color: 'bg-slate-100 text-slate-500 border-slate-200',       icon: <X size={10} /> },
};

const DIAG_TYPE_COLORS: Record<string, string> = {
  route_change:        'bg-blue-100 text-blue-700',
  action:              'bg-violet-100 text-violet-700',
  js_error:            'bg-red-100 text-red-700',
  unhandled_rejection: 'bg-red-100 text-red-700',
  api_request:         'bg-slate-100 text-slate-600',
  network_change:      'bg-amber-100 text-amber-700',
  permission_change:   'bg-orange-100 text-orange-700',
  camera_state:        'bg-cyan-100 text-cyan-700',
  gps_state:           'bg-green-100 text-green-700',
  driver_session:      'bg-teal-100 text-teal-700',
  map_state:           'bg-indigo-100 text-indigo-700',
  app_state:           'bg-slate-100 text-slate-600',
  feature_flag:        'bg-purple-100 text-purple-700',
  error_boundary:      'bg-red-100 text-red-700',
};

interface Counts { open: number; in_progress: number; resolved: number; closed: number; }

function makeEvidenceSnapshot(r: BugReportRow): string {
  return [r.diagnostic_events ?? '', r.screenshot_path ?? '', r.resolution_note ?? ''].join('|');
}

// ── Selectable statuses ───────────────────────────────────────────────────────

const SELECTABLE_STATUSES = new Set(['open', 'in_progress']);

// ── Sanitise route for prompt (strip query strings + tokens) ─────────────────

function sanitiseRouteForPrompt(raw: string | null): string {
  if (!raw) return '—';
  let s = raw.split('?')[0];
  s = s.replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id');
  s = s.replace(/\/\d+/g, '/:id');
  return s || '—';
}

// ── Dazza review extraction ───────────────────────────────────────────────────

interface DazzaLatest {
  confidence: number | null;
  diagnosis: string | null;
  recommendation: string | null;
}

function extractDazzaLatest(report: BugReportRow): DazzaLatest {
  // ai_analysis field may contain the latest Dazza review JSON
  if (!report.ai_analysis) return { confidence: null, diagnosis: null, recommendation: null };
  try {
    const parsed = JSON.parse(report.ai_analysis) as Record<string, unknown>;
    return {
      confidence:     typeof parsed.confidence === 'number' ? parsed.confidence : null,
      diagnosis:      typeof parsed.likely_cause === 'string' ? parsed.likely_cause
                    : typeof parsed.what_found === 'string'   ? parsed.what_found
                    : null,
      recommendation: typeof parsed.recommended_fix === 'string' ? parsed.recommended_fix : null,
    };
  } catch {
    return { confidence: null, diagnosis: null, recommendation: null };
  }
}

// ── Prompt generator (deterministic, no AI, no DB, no network) ───────────────

function buildRepairPrompt(cases: BugReportRow[]): string {
  const caseBlocks = cases.map(r => {
    const ref = buildReference(r);
    const diagEvents = parseDiagEvents(r.diagnostic_events);
    const dazza = extractDazzaLatest(r);
    const route = sanitiseRouteForPrompt(r.current_route ?? r.page_url ?? null);

    return [
      `### ${ref}`,
      '',
      `- Status: ${r.status}`,
      `- Category: ${r.category ? categoryLabel(r.category) : '—'}`,
      `- Platform/version: ${r.platform ?? 'web'}${r.app_version ? ` · v${r.app_version}` : ''}`,
      `- Route: ${route}`,
      `- Description: ${r.description.trim()}`,
      `- Diagnostics: ${diagEvents.length} event(s) captured`,
      `- Screenshot: ${r.screenshot_path ? 'Yes' : 'No'}`,
      `- Dazza confidence: ${dazza.confidence !== null ? `${dazza.confidence}%` : 'Not yet reviewed'}`,
      `- Dazza diagnosis: ${dazza.diagnosis ?? 'Not yet reviewed'}`,
      `- Dazza recommendation: ${dazza.recommendation ?? 'Not yet reviewed'}`,
      '',
      '---',
    ].join('\n');
  });

  return [
    '# IWILLBUILD Bug Repair Session',
    '',
    'Work through the selected bug cases below.',
    '',
    '## Mandatory workflow',
    '',
    'For each case:',
    '',
    '1. **Start**',
    '   - Read the complete bug report, diagnostics, screenshots, route and Dazza Review.',
    '   - Change the case to **In Progress** through the existing authenticated Bug Report API.',
    '   - Do not update bug tables with raw SQL or temporary database scripts.',
    '',
    '2. **Diagnose**',
    '   - Inspect the actual relevant source files before editing.',
    '   - Confirm the root cause.',
    '   - Treat Dazza\'s file and function suggestions as unverified until those paths are confirmed in the repository.',
    '   - Do not invent missing files merely because Dazza suggested them.',
    '',
    '3. **Fix**',
    '   - Make the smallest safe change that resolves the root cause.',
    '   - Preserve unrelated functionality.',
    '   - Do not publish or deploy.',
    '',
    '4. **Verify**',
    '   - Run the full TypeScript check separately.',
    '   - Run the production client and SSR/server builds.',
    '   - Perform targeted preview runtime tests for the affected workflow.',
    '   - Test nearby behaviour that could regress.',
    '',
    '5. **Record**',
    '   - Save a Resolution Note through the existing authenticated Bug Report API.',
    '   - Include:',
    '     - Confirmed root cause',
    '     - Files changed',
    '     - Fix applied',
    '     - Build results',
    '     - Runtime tests',
    '     - Remaining risks',
    '',
    '6. **Status**',
    '   - Mark **Resolved** only after the preview workflow passes.',
    '   - If runtime confirmation needs Daryl, Codex, TestFlight, a secret, email/SMS delivery or a physical device, leave it **In Progress** and write exactly what remains to be tested.',
    '   - Never mark a case Closed.',
    '   - Codex or Daryl will independently retest and close it.',
    '',
    '7. **Report**',
    '   - Return one concise result per case:',
    '',
    '   `✅ BUG-YYYY-XXXXX — root cause → fix → tests passed → Resolved`',
    '',
    '   or:',
    '',
    '   `🟠 BUG-YYYY-XXXXX — fix prepared → waiting for [specific runtime verification] → In Progress`',
    '',
    '## Technical rules',
    '',
    '- Use `getSecret(\'NAME\')`, not `process.env.NAME`, where required by the Airo runtime.',
    '- Interpret bare MySQL `DATETIME` strings as UTC before converting to local time.',
    '- Convert ISO timestamps to `YYYY-MM-DD HH:MM:SS` before inserting into MySQL `DATETIME`.',
    '- Confirm the actual return shape of `db.execute()` before reading rows.',
    '- This MySQL version does not support `ADD COLUMN IF NOT EXISTS`; inspect `INFORMATION_SCHEMA` first, then use plain `ADD COLUMN`.',
    '- BetterAuth\'s table is `user`, singular.',
    '- New routes require both a handler and registration in `src/server/entry.ts`.',
    '- Use parameterised database operations or the existing API.',
    '- Never construct raw SQL from bug descriptions or resolution notes.',
    '- Never expose secrets, SQL, stack traces or credentials.',
    '- Do not publish.',
    '',
    '## Bug Report updates',
    '',
    'Reuse the existing authenticated endpoints currently used by Owner Console to:',
    '',
    '- Change status: `PATCH /api/bug-reports/:id` with `{ status: "in_progress" }` or `{ status: "resolved" }`',
    '- Save resolution notes: `PATCH /api/bug-reports/:id` with `{ resolution_note: "..." }`',
    '',
    'Do not create or run `scripts/resolve-bugs.ts`.',
    'Do not update `bug_reports` using raw SQL.',
    'Do not derive the internal database ID by reversing the visible five-character case reference.',
    '',
    '## Selected cases',
    '',
    caseBlocks.join('\n'),
  ].join('\n');
}

// ── Fallback modal (clipboard permission denied) ──────────────────────────────

function FallbackModal({ text, onClose }: { text: string; onClose: () => void }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [copied, setCopied] = useState(false);

  function handleManualCopy() {
    if (textareaRef.current) {
      textareaRef.current.select();
      document.execCommand('copy');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            <Clipboard size={15} className="text-violet-600" />
            <h3 className="font-bold text-slate-800 text-sm">Copy Airo Repair Prompt</h3>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
        <p className="px-5 pt-3 pb-1 text-xs text-slate-500 shrink-0">
          Clipboard access was denied. Select all and copy manually, or use the button below.
        </p>
        <div className="flex-1 overflow-hidden px-5 pb-2">
          <textarea
            ref={textareaRef}
            readOnly
            value={text}
            className="w-full h-full min-h-[300px] font-mono text-[11px] text-slate-700 border border-slate-200 rounded-xl p-3 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
            onClick={() => textareaRef.current?.select()}
          />
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 shrink-0">
          <button
            onClick={onClose}
            className="text-xs text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg transition-colors"
          >
            Close
          </button>
          <button
            onClick={handleManualCopy}
            className="flex items-center gap-1.5 text-xs font-semibold bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            {copied ? <ClipboardCheck size={13} /> : <Clipboard size={13} />}
            {copied ? 'Copied!' : 'Copy to clipboard'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BugReportsTab() {
  const { isPlatformOwner } = usePermissions();

  const [reports, setReports]       = useState<BugReportRow[]>([]);
  const [counts, setCounts]         = useState<Counts>({ open: 0, in_progress: 0, resolved: 0, closed: 0 });
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [filterStatus, setFilterStatus]     = useState('open');
  const [filterCategory, setFilterCategory] = useState('');
  const [search, setSearch]                 = useState('');

  // Detail drawer
  const [selected, setSelected]         = useState<BugReportRow | null>(null);
  const [resNote, setResNote]           = useState('');
  const [saving, setSaving]             = useState(false);
  const [saveMsg, setSaveMsg]           = useState('');
  const [diagExpanded, setDiagExpanded] = useState(false);

  // Export state
  const [exporting, setExporting]       = useState(false);
  const [exportMsg, setExportMsg]       = useState('');
  const [copyMdMsg, setCopyMdMsg]       = useState('');
  const [copyDiagMsg, setCopyDiagMsg]   = useState('');

  // ── Selection + Copy Airo Prompt ──────────────────────────────────────────
  const [selectedIds, setSelectedIds]       = useState<Set<string>>(new Set());
  const [copyPromptMsg, setCopyPromptMsg]   = useState('');   // '' | 'copied' | 'failed'
  const [fallbackText, setFallbackText]     = useState<string | null>(null);
  const copyToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true); else setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus)   params.set('status', filterStatus);
      if (filterCategory) params.set('category', filterCategory);
      if (search)         params.set('search', search);
      params.set('limit', '100');
      const res = await fetch(`/api/bug-reports?${params}`, { credentials: 'include' });
      const d = await res.json() as { reports?: BugReportRow[]; counts?: Counts; total?: number };
      setReports(d.reports ?? []);
      setCounts(d.counts ?? { open: 0, in_progress: 0, resolved: 0, closed: 0 });
      setTotal(d.total ?? 0);
    } catch { /* ignore */ }
    finally { setLoading(false); setRefreshing(false); }
  }, [filterStatus, filterCategory, search]);

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [load]);

  // Clear selection when filters change (hidden reports must not stay selected)
  useEffect(() => { setSelectedIds(new Set()); }, [filterStatus, filterCategory, search]);

  // Selectable reports = only open / in_progress in the current visible list
  const selectableReports = reports.filter(r => SELECTABLE_STATUSES.has(r.status));

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectVisible() {
    setSelectedIds(new Set(selectableReports.map(r => r.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function handleCopyPrompt() {
    const chosen = reports.filter(r => selectedIds.has(r.id));
    if (chosen.length === 0) return;
    const text = buildRepairPrompt(chosen);

    if (copyToastTimer.current) clearTimeout(copyToastTimer.current);

    navigator.clipboard.writeText(text).then(() => {
      setCopyPromptMsg('copied');
      copyToastTimer.current = setTimeout(() => setCopyPromptMsg(''), 4000);
    }).catch(() => {
      // Clipboard permission denied — open fallback modal
      setFallbackText(text);
    });
  }

  const selectedCount = selectedIds.size;

  async function updateReport(id: string, patch: { status?: string; resolution_note?: string }) {
    setSaving(true); setSaveMsg('');
    try {
      const res = await fetch(`/api/bug-reports/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(patch),
      });
      const d = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !d.ok) { setSaveMsg(d.error ?? 'Failed to update.'); return; }
      setSaveMsg('Saved');
      setTimeout(() => setSaveMsg(''), 2000);
      await load(true);
      if (selected?.id === id) {
        setSelected(prev => prev ? {
          ...prev,
          ...patch,
          status: (patch.status ?? prev.status) as BugReportRow['status'],
          resolution_note: patch.resolution_note ?? prev.resolution_note,
        } : null);
      }
    } catch { setSaveMsg('Network error.'); }
    finally { setSaving(false); }
  }

  async function handleExportBundle(report: BugReportRow) {
    setExporting(true); setExportMsg('');
    try {
      const res = await fetch(`/api/bug-reports/${report.id}/export-bundle`, { credentials: 'include' });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setExportMsg(d.error ?? 'Export failed.');
        return;
      }
      const blob = await res.blob();
      const ref = buildReference(report);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${ref}-support-bundle.zip`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportMsg('Downloaded');
      setTimeout(() => setExportMsg(''), 3000);
    } catch { setExportMsg('Network error.'); }
    finally { setExporting(false); }
  }

  function handleCopyMarkdown(report: BugReportRow) {
    const events = parseDiagEvents(report.diagnostic_events);
    const md = buildSummaryMd(report, events);
    navigator.clipboard.writeText(md).then(() => {
      setCopyMdMsg('Copied!'); setTimeout(() => setCopyMdMsg(''), 2000);
    }).catch(() => { setCopyMdMsg('Failed'); setTimeout(() => setCopyMdMsg(''), 2000); });
  }

  function handleDownloadDiag(report: BugReportRow) {
    const events = parseDiagEvents(report.diagnostic_events);
    const sanitised = buildSanitisedDiagnostics(events, report.created_at);
    const ref = buildReference(report);
    const blob = new Blob([JSON.stringify(sanitised, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${ref}-diagnostics.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setCopyDiagMsg('Downloaded'); setTimeout(() => setCopyDiagMsg(''), 2000);
  }

  const totalOpen = counts.open + counts.in_progress;

  return (
    <div className="flex h-full gap-0 overflow-hidden">
      {/* ── Left panel: list ── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden border-r border-slate-200">
        {/* Toolbar */}
        <div className="px-5 py-4 border-b border-slate-100 flex flex-col gap-3 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bug size={16} className="text-red-500" />
              <h2 className="font-bold text-slate-800 text-sm">Bug Reports</h2>
              {totalOpen > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                  {totalOpen}
                </span>
              )}
              {total > 0 && <span className="text-[11px] text-slate-400">{total} total</span>}
            </div>
            <button
              onClick={() => void load(true)}
              disabled={refreshing}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>

          {/* Status filter pills */}
          <div className="flex gap-1.5 flex-wrap">
            {[
              { value: '',            label: `All (${counts.open + counts.in_progress + counts.resolved + counts.closed})` },
              { value: 'open',        label: `Open (${counts.open})` },
              { value: 'in_progress', label: `In Progress (${counts.in_progress})` },
              { value: 'resolved',    label: `Resolved (${counts.resolved})` },
              { value: 'closed',      label: `Closed (${counts.closed})` },
            ].map(s => (
              <button
                key={s.value}
                onClick={() => setFilterStatus(s.value)}
                className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${
                  filterStatus === s.value
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Copy Airo Prompt toolbar row (platform-owner only) */}
          {isPlatformOwner && (
            <div className="flex items-center gap-2 flex-wrap">
              {/* Select visible / Clear */}
              <button
                onClick={selectVisible}
                disabled={selectableReports.length === 0}
                className="text-[11px] text-slate-500 hover:text-slate-700 underline underline-offset-2 disabled:opacity-40 disabled:no-underline transition-colors"
              >
                Select visible
              </button>
              {selectedCount > 0 && (
                <button
                  onClick={clearSelection}
                  className="text-[11px] text-slate-400 hover:text-slate-600 underline underline-offset-2 transition-colors"
                >
                  Clear
                </button>
              )}

              {/* Copy Airo Prompt button */}
              <button
                onClick={handleCopyPrompt}
                disabled={selectedCount === 0}
                className={`ml-auto flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                  selectedCount > 0
                    ? 'bg-violet-600 hover:bg-violet-700 text-white border-violet-600'
                    : 'bg-white text-slate-300 border-slate-200 cursor-not-allowed'
                }`}
                title={selectedCount === 0 ? 'Select open or in-progress cases first' : `Copy repair prompt for ${selectedCount} case${selectedCount !== 1 ? 's' : ''}`}
              >
                {copyPromptMsg === 'copied'
                  ? <ClipboardCheck size={12} />
                  : <Clipboard size={12} />
                }
                {selectedCount > 0
                  ? `Copy Airo Prompt (${selectedCount})`
                  : 'Copy Airo Prompt'
                }
              </button>
            </div>
          )}

          {/* Search + category */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void load(); }}
                placeholder="Search reports…"
                className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X size={12} />
                </button>
              )}
            </div>
            <div className="relative">
              <select
                value={filterCategory}
                onChange={e => setFilterCategory(e.target.value)}
                className="appearance-none text-xs border border-slate-200 rounded-lg pl-3 pr-7 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-white text-slate-600"
              >
                <option value="">All categories</option>
                {BUG_CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
              <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20 gap-2 text-slate-400">
              <Loader2 size={18} className="animate-spin" />
              <span className="text-sm">Loading…</span>
            </div>
          ) : reports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <Bug size={32} className="mb-3 opacity-30" />
              <p className="text-sm font-medium">No bug reports found</p>
              <p className="text-xs mt-1 opacity-70">
                {filterStatus || filterCategory || search ? 'Try adjusting your filters.' : 'No reports have been submitted yet.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {reports.map(r => {
                const sc = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.open;
                const isSelected = selected?.id === r.id;
                const isChecked = selectedIds.has(r.id);
                const isSelectable = SELECTABLE_STATUSES.has(r.status);                const diagEvents = parseDiagEvents(r.diagnostic_events);
                return (
                  <div
                    key={r.id}
                    className={`flex items-stretch border-b border-slate-100 last:border-0 ${isSelected ? 'bg-violet-50 border-l-2 border-l-primary' : ''}`}
                  >
                    {/* Checkbox column (platform-owner only, selectable statuses only) */}
                    {isPlatformOwner && (
                      <div className="flex items-start pt-4 pl-3 pr-1 shrink-0">
                        {isSelectable ? (
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleSelect(r.id)}
                            onClick={e => e.stopPropagation()}
                            className="w-3.5 h-3.5 rounded border-slate-300 accent-violet-600 cursor-pointer"
                            aria-label={`Select ${buildReference(r)}`}
                          />
                        ) : (
                          <span className="w-3.5 h-3.5 inline-block" aria-hidden="true" />
                        )}
                      </div>
                    )}
                    <button
                      onClick={() => {
                        setSelected(r);
                        setResNote(r.resolution_note ?? '');
                        setSaveMsg('');
                        setDiagExpanded(false);
                        setExportMsg('');
                        setCopyMdMsg('');
                        setCopyDiagMsg('');
                      }}
                      className="flex-1 text-left px-4 py-3.5 hover:bg-slate-50 transition-colors min-w-0"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${sc.color}`}>
                              {sc.icon}{sc.label}
                            </span>
                            {r.category && (
                              <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">
                                {categoryLabel(r.category)}
                              </span>
                            )}
                            {r.platform && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-400">
                                {platformIcon(r.platform)}{r.platform}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-700 font-medium line-clamp-2 leading-relaxed">
                            {r.description}
                          </p>
                          <div className="flex items-center gap-2 mt-1.5 text-[11px] text-slate-400">
                            <span>{r.submitted_by_name || r.submitted_by_email}</span>
                            {r.company_name && <><span>·</span><span>{r.company_name}</span></>}
                            <span>·</span>
                            <span>{timeAgo(r.created_at)}</span>
                            {r.screenshot_path && <><span>·</span><Image size={10} /></>}
                            {diagEvents.length > 0 && <><span>·</span><Activity size={10} /></>}
                          </div>
                        </div>
                        <ArrowRight size={13} className="text-slate-300 shrink-0 mt-1" />
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Right panel: detail drawer ── */}
      <div className={`flex flex-col bg-white transition-all duration-200 ${selected ? 'w-[480px] shrink-0' : 'w-0 overflow-hidden'}`}>
        {selected && (() => {
          const diagEvents = parseDiagEvents(selected.diagnostic_events);
          const ref = buildReference(selected);
          return (
            <>
              {/* Detail header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">{ref}</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">{fmtDate(selected.created_at)}</p>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">

                {/* ── Export actions (platform-owner only) ── */}
                {isPlatformOwner && (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Export</p>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => void handleExportBundle(selected)}
                        disabled={exporting}
                        className="flex items-center gap-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
                        title="Download ZIP with summary.md, report.json, timeline.jsonl and screenshot"
                      >
                        {exporting ? <Loader2 size={12} className="animate-spin" /> : <Package size={12} />}
                        Export support bundle
                      </button>
                      <button
                        onClick={() => handleCopyMarkdown(selected)}
                        className="flex items-center gap-1.5 text-xs font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-3 py-2 rounded-lg transition-colors"
                        title="Copy summary.md to clipboard"
                      >
                        <FileText size={12} />
                        {copyMdMsg || 'Copy Markdown'}
                      </button>
                      <button
                        onClick={() => handleDownloadDiag(selected)}
                        disabled={diagEvents.length === 0}
                        className="flex items-center gap-1.5 text-xs font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-3 py-2 rounded-lg transition-colors disabled:opacity-40"
                        title="Download raw diagnostic events as JSON"
                      >
                        <Download size={12} />
                        {copyDiagMsg || 'Download diagnostics'}
                      </button>
                    </div>
                    {exportMsg && (
                      <p className={`text-xs font-semibold ${exportMsg === 'Downloaded' ? 'text-emerald-600' : 'text-red-500'}`}>
                        {exportMsg}
                      </p>
                    )}
                    {selected.exported_at && (
                      <p className="text-[11px] text-slate-400">
                        Last exported by <strong>{selected.exported_by || 'owner'}</strong> on {fmtDate(selected.exported_at)}
                      </p>
                    )}
                  </div>
                )}

                {/* Status + actions */}
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {(['open', 'in_progress', 'resolved', 'closed'] as const).map(s => {
                      const sc = STATUS_CONFIG[s];
                      return (
                        <button
                          key={s}
                          onClick={() => void updateReport(selected.id, { status: s })}
                          disabled={saving || selected.status === s}
                          className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
                            selected.status === s
                              ? sc.color + ' cursor-default'
                              : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          {sc.icon}{sc.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Meta */}
                <div className="bg-slate-50 rounded-xl p-4 flex flex-col gap-2.5">
                  <div className="flex items-start gap-2.5">
                    <User size={13} className="text-slate-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-slate-700">{selected.submitted_by_name || '—'}</p>
                      <p className="text-[11px] text-slate-400">{selected.submitted_by_email}</p>
                    </div>
                  </div>
                  {selected.company_name && (
                    <div className="flex items-center gap-2.5">
                      <Building2 size={13} className="text-slate-400 shrink-0" />
                      <p className="text-xs text-slate-600">{selected.company_name}</p>
                    </div>
                  )}
                  {selected.category && (
                    <div className="flex items-center gap-2.5">
                      <Tag size={13} className="text-slate-400 shrink-0" />
                      <p className="text-xs text-slate-600">{categoryLabel(selected.category)}</p>
                    </div>
                  )}
                  <div className="flex items-center gap-2.5">
                    <Calendar size={13} className="text-slate-400 shrink-0" />
                    <p className="text-xs text-slate-600">{fmtDate(selected.created_at)}</p>
                  </div>
                  {(selected.platform || selected.app_version) && (
                    <div className="flex items-center gap-2.5">
                      {platformIcon(selected.platform)}
                      <p className="text-xs text-slate-600">
                        {selected.platform ?? 'web'}
                        {selected.app_version ? ` · v${selected.app_version}` : ''}
                      </p>
                    </div>
                  )}
                  {selected.current_route && (
                    <div className="flex items-center gap-2.5">
                      <AlertCircle size={13} className="text-slate-400 shrink-0" />
                      <p className="text-xs text-slate-500 font-mono">{selected.current_route}</p>
                    </div>
                  )}
                  {selected.page_url && (
                    <div className="flex items-start gap-2.5">
                      <ExternalLink size={13} className="text-slate-400 shrink-0 mt-0.5" />
                      <a
                        href={selected.page_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline break-all"
                      >
                        {selected.page_url}
                      </a>
                    </div>
                  )}
                  {selected.user_agent && (
                    <div className="flex items-start gap-2.5">
                      <Monitor size={13} className="text-slate-400 shrink-0 mt-0.5" />
                      <p className="text-[11px] text-slate-400 break-all leading-relaxed">{selected.user_agent}</p>
                    </div>
                  )}
                </div>

                {/* Description */}
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Description</p>
                  <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{selected.description}</p>
                  </div>
                </div>

                {/* Screenshot */}
                {selected.screenshotUrl && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Screenshot</p>
                    <a href={selected.screenshotUrl} target="_blank" rel="noopener noreferrer">
                      <img
                        src={selected.screenshotUrl}
                        alt="Bug screenshot"
                        className="w-full rounded-xl border border-slate-200 hover:opacity-90 transition-opacity cursor-zoom-in"
                      />
                    </a>
                  </div>
                )}

                {/* ── Diagnostic timeline (platform-owner only) ── */}
                {isPlatformOwner && (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setDiagExpanded(v => !v)}
                      className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Activity size={13} className="text-slate-500" />
                        <span className="text-xs font-semibold text-slate-700">
                          Diagnostic timeline — 60 seconds before report
                        </span>
                        <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full">
                          {diagEvents.length} events
                        </span>
                      </div>
                      <ChevronRight size={13} className={`text-slate-400 transition-transform ${diagExpanded ? 'rotate-90' : ''}`} />
                    </button>
                    {diagExpanded && (
                      <div className="border-t border-slate-100 max-h-72 overflow-y-auto">
                        {diagEvents.length === 0 ? (
                          <div className="flex items-center gap-2 px-4 py-4 text-slate-400">
                            <WifiOff size={13} />
                            <p className="text-xs italic">No diagnostic events captured for this report.</p>
                          </div>
                        ) : (
                          <div className="divide-y divide-slate-50">
                            {[...diagEvents].sort((a, b) => a.ts - b.ts).map((ev, i) => {
                              const reportTs = parseMysqlDatetime(selected.created_at).getTime();
                              const secsAgo = Math.round((reportTs - ev.ts) / 1000);
                              const typeColor = DIAG_TYPE_COLORS[ev.type] ?? 'bg-slate-100 text-slate-600';
                              return (
                                <div key={i} className="flex items-start gap-2.5 px-4 py-2 hover:bg-slate-50">
                                  <span className="text-[10px] text-slate-400 font-mono shrink-0 w-10 text-right mt-0.5">
                                    -{secsAgo}s
                                  </span>
                                  <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${typeColor}`}>
                                    {ev.type.replace(/_/g, ' ')}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[11px] text-slate-700 break-all leading-relaxed">{ev.msg}</p>
                                    {ev.route && (
                                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">{ev.route}</p>
                                    )}
                                    {ev.status !== undefined && (
                                      <span className={`text-[10px] font-semibold ${ev.status >= 400 ? 'text-red-500' : 'text-emerald-600'}`}>
                                        {ev.status}{ev.duration !== undefined ? ` · ${ev.duration}ms` : ''}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Dazza Review (platform-owner only) ── */}
                {/* key={selected.id} forces a full remount on every case switch,
                    resetting ensureCalled ref and all state so the new report's
                    review loads immediately instead of showing the previous one. */}
                {isPlatformOwner && (
                  <DazzaReviewPanel
                    key={selected.id}
                    report={selected}
                    evidenceSnapshot={makeEvidenceSnapshot(selected)}
                  />
                )}

                {/* Resolution note */}
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Resolution Note</p>
                  <textarea
                    value={resNote}
                    onChange={e => setResNote(e.target.value)}
                    placeholder="Add notes about the fix, workaround, or reason for closing…"
                    rows={3}
                    maxLength={2000}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary placeholder:text-slate-300"
                  />
                  <div className="flex items-center justify-between mt-2">
                    <div>
                      {saveMsg && (
                        <span className={`text-xs font-semibold ${saveMsg === 'Saved' ? 'text-emerald-600' : 'text-red-500'}`}>
                          {saveMsg}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => void updateReport(selected.id, { resolution_note: resNote })}
                      disabled={saving}
                      className="flex items-center gap-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {saving ? <Loader2 size={11} className="animate-spin" /> : <MessageSquare size={11} />}
                      Save note
                    </button>
                  </div>
                </div>

                {/* Resolved info */}
                {selected.resolved_at && (
                  <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                    <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                    <p className="text-xs text-emerald-700">
                      Resolved by <strong>{selected.resolved_by_name ?? 'owner'}</strong> on {fmtDate(selected.resolved_at)}
                    </p>
                  </div>
                )}
              </div>
            </>
          );
        })()}

        {/* Empty state */}
        {!selected && (
          <div className="flex flex-col items-center justify-center h-full text-slate-300 p-8">
            <Bug size={36} className="mb-3 opacity-40" />
            <p className="text-sm text-center">Select a report to review</p>
          </div>
        )}
      </div>

      {/* ── Copy Airo Prompt success toast ── */}
      {copyPromptMsg === 'copied' && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-emerald-600 text-white text-xs font-semibold px-4 py-2.5 rounded-full shadow-lg animate-in slide-in-from-bottom-2 duration-200">
          <ClipboardCheck size={13} />
          Airo repair prompt copied — {selectedCount} case{selectedCount !== 1 ? 's' : ''} included
        </div>
      )}

      {/* ── Clipboard fallback modal ── */}
      {fallbackText !== null && (
        <FallbackModal
          text={fallbackText}
          onClose={() => setFallbackText(null)}
        />
      )}
    </div>
  );
}
