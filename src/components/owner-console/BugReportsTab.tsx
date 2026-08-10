/**
 * BugReportsTab — Owner Console tab for reviewing and resolving bug reports.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Bug, RefreshCw, Search, X, ChevronDown, ExternalLink,
  CheckCircle2, Clock, AlertCircle, Loader2, Image,
  User, Building2, Monitor, Calendar, Tag, MessageSquare,
  Circle, ArrowRight,
} from 'lucide-react';
import { BUG_CATEGORIES } from '@/components/BugReportModal';

// ── Types ─────────────────────────────────────────────────────────────────────

interface BugReport {
  id: string;
  submitted_by_name: string;
  submitted_by_email: string;
  company_name: string | null;
  category: string;
  description: string;
  page_url: string;
  user_agent: string;
  screenshot_path: string | null;
  screenshotUrl: string | null;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  resolution_note: string | null;
  resolved_by_name: string | null;
  resolved_at: string | null;
  created_at: string;
}

interface Counts {
  open: number;
  in_progress: number;
  resolved: number;
  closed: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
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

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  open:        { label: 'Open',        color: 'bg-red-100 text-red-700 border-red-200',      icon: <Circle size={10} className="fill-red-500 text-red-500" /> },
  in_progress: { label: 'In Progress', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: <Clock size={10} /> },
  resolved:    { label: 'Resolved',    color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: <CheckCircle2 size={10} /> },
  closed:      { label: 'Closed',      color: 'bg-slate-100 text-slate-500 border-slate-200', icon: <X size={10} /> },
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function BugReportsTab() {
  const [reports, setReports]     = useState<BugReport[]>([]);
  const [counts, setCounts]       = useState<Counts>({ open: 0, in_progress: 0, resolved: 0, closed: 0 });
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [filterStatus, setFilterStatus]     = useState('open');
  const [filterCategory, setFilterCategory] = useState('');
  const [search, setSearch]                 = useState('');

  // Detail drawer
  const [selected, setSelected]   = useState<BugReport | null>(null);
  const [resNote, setResNote]     = useState('');
  const [saving, setSaving]       = useState(false);
  const [saveMsg, setSaveMsg]     = useState('');

  const load = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true); else setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus)   params.set('status', filterStatus);
      if (filterCategory) params.set('category', filterCategory);
      if (search)         params.set('search', search);
      params.set('limit', '100');

      const res = await fetch(`/api/bug-reports?${params}`, { credentials: 'include' });
      const d = await res.json() as { reports?: BugReport[]; counts?: Counts; total?: number };
      setReports(d.reports ?? []);
      setCounts(d.counts ?? { open: 0, in_progress: 0, resolved: 0, closed: 0 });
      setTotal(d.total ?? 0);
    } catch { /* ignore */ }
    finally { setLoading(false); setRefreshing(false); }
  }, [filterStatus, filterCategory, search]);

  useEffect(() => { void load(); }, [load]);

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
      // Refresh list and update selected
      await load(true);
      if (selected?.id === id) {
        setSelected(prev => prev ? { ...prev, ...patch, status: (patch.status ?? prev.status) as BugReport['status'], resolution_note: patch.resolution_note ?? prev.resolution_note } : null);
      }
    } catch { setSaveMsg('Network error.'); }
    finally { setSaving(false); }
  }

  const totalOpen = counts.open + counts.in_progress;

  return (
    <div className="flex h-full gap-0 overflow-hidden -m-6">
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
                onChange={e => setSearch(e.target.value)}
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
                return (
                  <button
                    key={r.id}
                    onClick={() => { setSelected(r); setResNote(r.resolution_note ?? ''); setSaveMsg(''); }}
                    className={`w-full text-left px-5 py-3.5 hover:bg-slate-50 transition-colors ${isSelected ? 'bg-violet-50 border-l-2 border-l-primary' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${sc.color}`}>
                            {sc.icon}
                            {sc.label}
                          </span>
                          {r.category && (
                            <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">
                              {categoryLabel(r.category)}
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
      <div className={`flex flex-col bg-white transition-all duration-200 ${selected ? 'w-[420px] shrink-0' : 'w-0 overflow-hidden'}`}>
        {selected && (
          <>
            {/* Detail header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
              <h3 className="font-bold text-slate-800 text-sm">Bug Detail</h3>
              <button
                onClick={() => setSelected(null)}
                className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
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
                        {sc.icon}
                        {sc.label}
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

              {/* Resolution note */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Resolution Note</p>
                <textarea
                  value={resNote}
                  onChange={e => setResNote(e.target.value)}
                  placeholder="Add notes about the fix, workaround, or reason for closing…"
                  rows={3}
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
        )}

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
