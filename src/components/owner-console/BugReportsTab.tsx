/**
 * BugReportsTab — Owner Console tab for reviewing and resolving bug reports.
 * Includes diagnostic timeline (platform-owner only) and support bundle export.
 */
import { useState, useCallback, useEffect } from 'react';
import {
  Bug, RefreshCw, Search, X, ChevronDown, ExternalLink,
  CheckCircle2, Clock, AlertCircle, Loader2, Image,
  User, Building2, Monitor, Calendar, Tag, MessageSquare,
  Circle, ArrowRight, Activity, Copy, Download, ChevronRight,
  Smartphone, Globe, WifiOff, Package, FileText,
  Bot, Zap, Wrench, Send, ShieldCheck, Rocket, KeyRound,
} from 'lucide-react';
import { BUG_CATEGORIES } from '@/components/BugReportModal';
import { usePermissions } from '@/lib/usePermissions';
import type { DiagEvent } from '@/lib/diagnosticBuffer';
import {
  buildReference,
  buildSummaryMd,
  buildSanitisedDiagnostics,
  parseDiagEvents,
  type BugReportRow,
} from '@/lib/bugReportBundleClient';

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function fmtDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-AU', {
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
  open:        { label: 'Open',        color: 'bg-red-100 text-red-700 border-red-200',           icon: <Circle size={10} className="fill-red-500 text-red-500" /> },
  in_progress: { label: 'In Progress', color: 'bg-amber-100 text-amber-700 border-amber-200',     icon: <Clock size={10} /> },
  resolved:    { label: 'Resolved',    color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: <CheckCircle2 size={10} /> },
  closed:      { label: 'Closed',      color: 'bg-slate-100 text-slate-500 border-slate-200',     icon: <X size={10} /> },
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

// ── Component ─────────────────────────────────────────────────────────────────

export default function BugReportsTab() {
  const { isPlatformOwner } = usePermissions();

  const [reports, setReports]     = useState<BugReportRow[]>([]);
  const [counts, setCounts]       = useState<Counts>({ open: 0, in_progress: 0, resolved: 0, closed: 0 });
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [filterStatus, setFilterStatus]     = useState('open');
  const [filterCategory, setFilterCategory] = useState('');
  const [search, setSearch]                 = useState('');

  // Detail drawer
  const [selected, setSelected]   = useState<BugReportRow | null>(null);
  const [resNote, setResNote]     = useState('');
  const [saving, setSaving]       = useState(false);
  const [saveMsg, setSaveMsg]     = useState('');
  const [diagExpanded, setDiagExpanded] = useState(false);

  // Export state
  const [exporting, setExporting]   = useState(false);
  const [exportMsg, setExportMsg]   = useState('');
  const [copyMdMsg, setCopyMdMsg]   = useState('');
  const [copyDiagMsg, setCopyDiagMsg] = useState('');

  // ── Dazza AI loop state ────────────────────────────────────────────────────
  const [aiAnalysing, setAiAnalysing]       = useState(false);
  const [aiResult, setAiResult]             = useState<{
    analysis: string;
    suggestedFix: string;
    suggestedPrompt: string;
    smsSent: boolean;
    smsConfigured: boolean;
  } | null>(null);
  const [aiError, setAiError]               = useState('');
  const [smsCode, setSmsCode]               = useState('');
  const [smsAuthing, setSmsAuthing]         = useState(false);
  const [publishToken, setPublishToken]     = useState('');
  const [smsAuthError, setSmsAuthError]     = useState('');
  const [publishing, setPublishing]         = useState(false);
  const [publishResult, setPublishResult]   = useState<{ ok: boolean; message: string } | null>(null);
  const [promptCopied, setPromptCopied]     = useState(false);

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

  // Load on mount
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload when filters change
  useEffect(() => { void load(); }, [load]); // load is memoised on filterStatus/filterCategory/search

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

  // ── Export bundle ──────────────────────────────────────────────────────────
  async function handleExportBundle(report: BugReportRow) {
    setExporting(true); setExportMsg('');
    try {
      const res = await fetch(`/api/bug-reports/${report.id}/export-bundle`, {
        credentials: 'include',
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setExportMsg(d.error ?? 'Export failed.');
        return;
      }
      const blob = await res.blob();
      const ref = buildReference(report);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${ref}-support-bundle.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportMsg('Downloaded');
      setTimeout(() => setExportMsg(''), 3000);
    } catch {
      setExportMsg('Network error.');
    } finally {
      setExporting(false);
    }
  }

  // ── Copy Markdown summary ──────────────────────────────────────────────────
  function handleCopyMarkdown(report: BugReportRow) {
    const events = parseDiagEvents(report.diagnostic_events);
    const md = buildSummaryMd(report, events);
    navigator.clipboard.writeText(md).then(() => {
      setCopyMdMsg('Copied!');
      setTimeout(() => setCopyMdMsg(''), 2000);
    }).catch(() => {
      setCopyMdMsg('Failed');
      setTimeout(() => setCopyMdMsg(''), 2000);
    });
  }

  // ── Download diagnostics JSON (sanitised — same rules as timeline.jsonl) ─────
  function handleDownloadDiag(report: BugReportRow) {
    const events = parseDiagEvents(report.diagnostic_events);
    const sanitised = buildSanitisedDiagnostics(events, report.created_at);
    const ref = buildReference(report);
    const blob = new Blob([JSON.stringify(sanitised, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${ref}-diagnostics.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setCopyDiagMsg('Downloaded');
    setTimeout(() => setCopyDiagMsg(''), 2000);
  }

  const totalOpen = counts.open + counts.in_progress;

  // ── Dazza AI handlers ──────────────────────────────────────────────────────

  function resetAiState() {
    setAiResult(null);
    setAiError('');
    setSmsCode('');
    setPublishToken('');
    setSmsAuthError('');
    setPublishResult(null);
    setPromptCopied(false);
  }

  async function handleRunAnalysis(report: BugReportRow) {
    setAiAnalysing(true);
    setAiError('');
    setAiResult(null);
    setPublishToken('');
    setSmsCode('');
    setSmsAuthError('');
    setPublishResult(null);
    try {
      const res = await fetch(`/api/bug-reports/${report.id}/analyse`, {
        method: 'POST',
        credentials: 'include',
      });
      const d = await res.json() as {
        ok?: boolean;
        analysis?: string;
        suggestedFix?: string;
        suggestedPrompt?: string;
        smsSent?: boolean;
        smsConfigured?: boolean;
        error?: string;
      };
      if (!res.ok || !d.ok) {
        setAiError(d.error ?? 'Analysis failed.');
        return;
      }
      setAiResult({
        analysis: d.analysis ?? '',
        suggestedFix: d.suggestedFix ?? '',
        suggestedPrompt: d.suggestedPrompt ?? '',
        smsSent: d.smsSent ?? false,
        smsConfigured: d.smsConfigured ?? false,
      });
      // Reload to pick up stored AI fields
      await load(true);
    } catch {
      setAiError('Network error. Try again.');
    } finally {
      setAiAnalysing(false);
    }
  }

  async function handleSmsAuthorise(report: BugReportRow) {
    if (!smsCode.trim()) { setSmsAuthError('Enter the 6-digit code from your SMS.'); return; }
    setSmsAuthing(true);
    setSmsAuthError('');
    try {
      const res = await fetch(`/api/bug-reports/${report.id}/sms-authorise`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code: smsCode.trim() }),
      });
      const d = await res.json() as { ok?: boolean; publishToken?: string; error?: string };
      if (!res.ok || !d.ok) {
        setSmsAuthError(d.error ?? 'Invalid code.');
        return;
      }
      setPublishToken(d.publishToken ?? '');
    } catch {
      setSmsAuthError('Network error.');
    } finally {
      setSmsAuthing(false);
    }
  }

  async function handlePublishFix(report: BugReportRow) {
    if (!publishToken) return;
    setPublishing(true);
    setPublishResult(null);
    try {
      const res = await fetch(`/api/bug-reports/${report.id}/publish-fix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ publishToken }),
      });
      const d = await res.json() as { ok?: boolean; message?: string; publishTriggered?: boolean; error?: string };
      setPublishResult({
        ok: d.ok ?? false,
        message: d.message ?? d.error ?? 'Unknown result.',
      });
      if (d.ok) {
        await load(true);
        setPublishToken('');
      }
    } catch {
      setPublishResult({ ok: false, message: 'Network error.' });
    } finally {
      setPublishing(false);
    }
  }

  function handleCopyPrompt(prompt: string) {
    navigator.clipboard.writeText(prompt).then(() => {
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 2000);
    }).catch(() => {});
  }

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

          {/* Search + category */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={e => { setSearch(e.target.value); }}
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
                const diagEvents = parseDiagEvents(r.diagnostic_events);
                return (
                  <button
                    key={r.id}
                    onClick={() => { setSelected(r); setResNote(r.resolution_note ?? ''); setSaveMsg(''); setDiagExpanded(false); setExportMsg(''); setCopyMdMsg(''); setCopyDiagMsg(''); resetAiState(); }}
                    className={`w-full text-left px-5 py-3.5 hover:bg-slate-50 transition-colors ${isSelected ? 'bg-violet-50 border-l-2 border-l-primary' : ''}`}
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
                      {/* Export support bundle */}
                      <button
                        onClick={() => void handleExportBundle(selected)}
                        disabled={exporting}
                        className="flex items-center gap-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
                        title="Download ZIP with summary.md, report.json, timeline.jsonl and screenshot"
                      >
                        {exporting
                          ? <Loader2 size={12} className="animate-spin" />
                          : <Package size={12} />
                        }
                        Export support bundle
                      </button>

                      {/* Copy Markdown summary */}
                      <button
                        onClick={() => handleCopyMarkdown(selected)}
                        className="flex items-center gap-1.5 text-xs font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-3 py-2 rounded-lg transition-colors"
                        title="Copy summary.md to clipboard"
                      >
                        <FileText size={12} />
                        {copyMdMsg || 'Copy Markdown'}
                      </button>

                      {/* Download diagnostics JSON */}
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

                    {/* Export feedback */}
                    {exportMsg && (
                      <p className={`text-xs font-semibold ${exportMsg === 'Downloaded' ? 'text-emerald-600' : 'text-red-500'}`}>
                        {exportMsg}
                      </p>
                    )}

                    {/* Export audit info */}
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
                      <>
                        {/* Timeline */}
                        <div className="border-t border-slate-100 max-h-72 overflow-y-auto">
                          {diagEvents.length === 0 ? (
                            <div className="flex items-center gap-2 px-4 py-4 text-slate-400">
                              <WifiOff size={13} />
                              <p className="text-xs italic">No diagnostic events captured for this report.</p>
                            </div>
                          ) : (
                            <div className="divide-y divide-slate-50">
                              {[...diagEvents].sort((a, b) => a.ts - b.ts).map((ev, i) => {
                                const reportTs = new Date(selected.created_at).getTime();
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
                      </>
                    )}
                  </div>
                )}

                {/* ── Dazza AI Loop ─────────────────────────────────────────── */}
                <div className="border border-violet-200 rounded-2xl overflow-hidden bg-gradient-to-br from-violet-50/60 to-slate-50">
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-violet-600 to-indigo-600">
                    <div className="flex items-center gap-2">
                      <Bot size={14} className="text-white" />
                      <span className="text-xs font-bold text-white tracking-wide">Dazza AI Loop</span>
                    </div>
                    {selected.ai_analysed_at && !aiResult && (
                      <span className="text-[10px] text-violet-200">
                        Last analysed {timeAgo(selected.ai_analysed_at)}
                      </span>
                    )}
                  </div>

                  <div className="p-4 flex flex-col gap-3">
                    {/* Stored AI result (from DB) */}
                    {!aiResult && selected.ai_analysis && (
                      <div className="flex flex-col gap-2">
                        <div className="bg-white border border-violet-100 rounded-xl p-3">
                          <p className="text-[10px] font-bold text-violet-600 uppercase tracking-wider mb-1 flex items-center gap-1">
                            <Zap size={10} /> Diagnosis
                          </p>
                          <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                            {selected.ai_analysis}
                          </p>
                        </div>
                        {selected.ai_suggested_fix && (
                          <div className="bg-white border border-emerald-100 rounded-xl p-3">
                            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-1 flex items-center gap-1">
                              <Wrench size={10} /> Suggested Fix
                            </p>
                            <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                              {selected.ai_suggested_fix}
                            </p>
                          </div>
                        )}
                        {selected.ai_suggested_prompt && (
                          <div className="bg-white border border-amber-100 rounded-xl p-3">
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider flex items-center gap-1">
                                <Send size={10} /> Airo Prompt
                              </p>
                              <button
                                onClick={() => handleCopyPrompt(selected.ai_suggested_prompt!)}
                                className="text-[10px] text-amber-600 hover:text-amber-700 font-semibold flex items-center gap-1"
                              >
                                <Copy size={9} />
                                {promptCopied ? 'Copied!' : 'Copy'}
                              </button>
                            </div>
                            <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap font-mono bg-amber-50 rounded-lg p-2">
                              {selected.ai_suggested_prompt}
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Live AI result (just analysed) */}
                    {aiResult && (
                      <div className="flex flex-col gap-2">
                        <div className="bg-white border border-violet-100 rounded-xl p-3">
                          <p className="text-[10px] font-bold text-violet-600 uppercase tracking-wider mb-1 flex items-center gap-1">
                            <Zap size={10} /> Diagnosis
                          </p>
                          <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">{aiResult.analysis}</p>
                        </div>
                        {aiResult.suggestedFix && (
                          <div className="bg-white border border-emerald-100 rounded-xl p-3">
                            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-1 flex items-center gap-1">
                              <Wrench size={10} /> Suggested Fix
                            </p>
                            <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">{aiResult.suggestedFix}</p>
                          </div>
                        )}
                        {aiResult.suggestedPrompt && (
                          <div className="bg-white border border-amber-100 rounded-xl p-3">
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider flex items-center gap-1">
                                <Send size={10} /> Airo Prompt
                              </p>
                              <button
                                onClick={() => handleCopyPrompt(aiResult.suggestedPrompt)}
                                className="text-[10px] text-amber-600 hover:text-amber-700 font-semibold flex items-center gap-1"
                              >
                                <Copy size={9} />
                                {promptCopied ? 'Copied!' : 'Copy'}
                              </button>
                            </div>
                            <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap font-mono bg-amber-50 rounded-lg p-2">
                              {aiResult.suggestedPrompt}
                            </p>
                          </div>
                        )}
                        {/* SMS status */}
                        {aiResult.smsConfigured && (
                          <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold ${aiResult.smsSent ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                            {aiResult.smsSent
                              ? <><CheckCircle2 size={12} /> SMS auth code sent to your phone</>
                              : <><AlertCircle size={12} /> SMS send failed — enter code manually below</>
                            }
                          </div>
                        )}
                        {!aiResult.smsConfigured && (
                          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-500">
                            <AlertCircle size={12} /> SMS not configured — check Twilio secrets to enable SMS auth
                          </div>
                        )}
                      </div>
                    )}

                    {aiError && (
                      <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-600 font-semibold">
                        <AlertCircle size={12} /> {aiError}
                      </div>
                    )}

                    {/* Run Analysis button */}
                    {!aiResult && (
                      <button
                        onClick={() => void handleRunAnalysis(selected)}
                        disabled={aiAnalysing}
                        className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white text-xs font-bold transition-all disabled:opacity-60 shadow-sm"
                      >
                        {aiAnalysing
                          ? <><Loader2 size={12} className="animate-spin" /> Dazza is analysing…</>
                          : <><Bot size={12} /> {selected.ai_analysis ? 'Re-analyse with Dazza' : 'Analyse with Dazza AI'}</>
                        }
                      </button>
                    )}

                    {/* Re-analyse button (after result shown) */}
                    {aiResult && (
                      <button
                        onClick={() => void handleRunAnalysis(selected)}
                        disabled={aiAnalysing}
                        className="flex items-center justify-center gap-2 w-full py-2 rounded-xl border border-violet-200 text-violet-600 hover:bg-violet-50 text-xs font-semibold transition-colors disabled:opacity-60"
                      >
                        {aiAnalysing ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                        Re-analyse
                      </button>
                    )}

                    {/* SMS Authorisation + Publish */}
                    {(aiResult || selected.ai_analysis) && !publishToken && !publishResult && (
                      <div className="border-t border-violet-100 pt-3 flex flex-col gap-2">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                          <KeyRound size={10} /> SMS Authorisation to Publish
                        </p>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength={6}
                            value={smsCode}
                            onChange={e => { setSmsCode(e.target.value.replace(/\D/g, '')); setSmsAuthError(''); }}
                            placeholder="6-digit code"
                            className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400 placeholder:text-slate-300 text-center tracking-widest font-mono"
                          />
                          <button
                            onClick={() => void handleSmsAuthorise(selected)}
                            disabled={smsAuthing || smsCode.length !== 6}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-colors disabled:opacity-50"
                          >
                            {smsAuthing ? <Loader2 size={11} className="animate-spin" /> : <ShieldCheck size={11} />}
                            Verify
                          </button>
                        </div>
                        {smsAuthError && (
                          <p className="text-xs text-red-500 font-semibold">{smsAuthError}</p>
                        )}
                      </div>
                    )}

                    {/* Publish Fix button — unlocked after SMS auth */}
                    {publishToken && !publishResult && (
                      <div className="border-t border-violet-100 pt-3 flex flex-col gap-2">
                        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 text-xs text-emerald-700 font-semibold">
                          <ShieldCheck size={12} /> SMS verified — publish authorised
                        </div>
                        <button
                          onClick={() => void handlePublishFix(selected)}
                          disabled={publishing}
                          className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white text-sm font-bold transition-all disabled:opacity-60 shadow-md"
                        >
                          {publishing
                            ? <><Loader2 size={13} className="animate-spin" /> Publishing…</>
                            : <><Rocket size={13} /> Publish Fix to Production</>
                          }
                        </button>
                      </div>
                    )}

                    {/* Publish result */}
                    {publishResult && (
                      <div className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold border ${publishResult.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                        {publishResult.ok ? <Rocket size={12} className="shrink-0 mt-0.5" /> : <AlertCircle size={12} className="shrink-0 mt-0.5" />}
                        <span>{publishResult.message}</span>
                      </div>
                    )}
                  </div>
                </div>

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
    </div>
  );
}
