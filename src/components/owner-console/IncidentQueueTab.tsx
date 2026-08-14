/**
 * IncidentQueueTab.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Dazza V3 — Incident queue for the Owner Console.
 * Shows all platform incidents with severity, status, and investigation panel.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle, AlertCircle, Info, CheckCircle2, RefreshCw,
  Loader2, ChevronRight, Bot, Zap, Wrench, Send, Copy,
  Clock, Users, Globe, Shield, Activity, Search, X,
} from 'lucide-react';
import CommunicationPanel from './CommunicationPanel';

interface Incident {
  id: string;
  title: string;
  incident_type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'open' | 'investigating' | 'resolved';
  affected_route: string | null;
  affected_company_id: number | null;
  affected_user_count: number;
  first_seen_at: string;
  last_seen_at: string;
  event_count: number;
  likely_cause: string | null;
  confidence: string | null;
  data_loss_risk: boolean;
  immediate_workaround: string | null;
  customer_recovered: boolean;
  notification_sent: boolean;
  has_repair_prompt: boolean;
  repair_prompt?: string | null;
  investigation_report?: string | null;
}

interface SeverityCounts {
  critical?: number;
  high?: number;
  medium?: number;
  low?: number;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
    critical: { bg: 'bg-red-100 border-red-300', text: 'text-red-700', icon: <AlertTriangle size={10} /> },
    high:     { bg: 'bg-orange-100 border-orange-300', text: 'text-orange-700', icon: <AlertCircle size={10} /> },
    medium:   { bg: 'bg-amber-100 border-amber-300', text: 'text-amber-700', icon: <Info size={10} /> },
    low:      { bg: 'bg-slate-100 border-slate-300', text: 'text-slate-600', icon: <Info size={10} /> },
  };
  const s = map[severity] ?? map.low;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wide ${s.bg} ${s.text}`}>
      {s.icon} {severity}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    open: 'bg-red-50 text-red-600 border-red-200',
    investigating: 'bg-violet-50 text-violet-600 border-violet-200',
    resolved: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold ${map[status] ?? 'bg-slate-50 text-slate-500 border-slate-200'}`}>
      {status}
    </span>
  );
}

export default function IncidentQueueTab() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [severityCounts, setSeverityCounts] = useState<SeverityCounts>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Incident | null>(null);
  const [severityFilter, setSeverityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('open');
  const [search, setSearch] = useState('');

  // Investigation state
  const [investigating, setInvestigating] = useState(false);
  const [investigationTokens, setInvestigationTokens] = useState('');
  const [investigationDone, setInvestigationDone] = useState(false);
  const [toolsRunning, setToolsRunning] = useState<string[]>([]);
  const [promptCopied, setPromptCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ severity: severityFilter, status: statusFilter, limit: '100' });
      const res = await fetch(`/api/dazza/v3/incidents?${params}`, { credentials: 'include' });
      const d = await res.json() as { incidents?: Incident[]; severityCounts?: SeverityCounts };
      setIncidents(d.incidents ?? []);
      setSeverityCounts(d.severityCounts ?? {});
    } catch { /* ignore */ }
    setLoading(false);
  }, [severityFilter, statusFilter]);

  useEffect(() => { void load(); }, [load]);

  const filtered = incidents.filter(i =>
    !search || i.title.toLowerCase().includes(search.toLowerCase()) ||
    (i.affected_route ?? '').toLowerCase().includes(search.toLowerCase())
  );

  async function handleInvestigate(incident: Incident) {
    setInvestigating(true);
    setInvestigationTokens('');
    setInvestigationDone(false);
    setToolsRunning([]);

    try {
      const res = await fetch(`/api/dazza/v3/incidents/${incident.id}/investigate`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!res.ok || !res.body) {
        setInvestigationTokens('Investigation failed — check server logs.');
        setInvestigating(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const ev = JSON.parse(line.slice(6)) as {
              type: string; content?: string; name?: string; status?: string;
              repairPromptExtracted?: boolean;
            };
            if (ev.type === 'token') {
              setInvestigationTokens(prev => prev + (ev.content ?? ''));
            } else if (ev.type === 'tool_call') {
              if (ev.status === 'running') setToolsRunning(prev => [...prev, ev.name ?? '']);
              else setToolsRunning(prev => prev.filter(t => t !== ev.name));
            } else if (ev.type === 'done') {
              setInvestigationDone(true);
              await load();
            } else if (ev.type === 'error') {
              setInvestigationTokens(prev => prev + `\n\n⚠️ Error: ${ev.content ?? 'unknown'}`);
            }
          } catch { /* ignore */ }
        }
      }
    } catch (e) {
      setInvestigationTokens(`Network error: ${String(e)}`);
    }

    setInvestigating(false);
  }

  function handleCopyPrompt(prompt: string) {
    navigator.clipboard.writeText(prompt).then(() => {
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 2000);
    }).catch(() => {});
  }

  return (
    <div className="flex h-full gap-4">
      {/* Left: incident list */}
      <div className="w-80 flex-shrink-0 flex flex-col gap-3">
        {/* Severity summary */}
        <div className="grid grid-cols-4 gap-1.5">
          {(['critical', 'high', 'medium', 'low'] as const).map(sev => {
            const count = severityCounts[sev] ?? 0;
            const colors: Record<string, string> = {
              critical: 'bg-red-50 border-red-200 text-red-700',
              high: 'bg-orange-50 border-orange-200 text-orange-700',
              medium: 'bg-amber-50 border-amber-200 text-amber-700',
              low: 'bg-slate-50 border-slate-200 text-slate-600',
            };
            return (
              <button
                key={sev}
                onClick={() => setSeverityFilter(sev === severityFilter ? 'all' : sev)}
                className={`flex flex-col items-center py-2 rounded-xl border text-xs font-bold transition-all ${colors[sev]} ${severityFilter === sev ? 'ring-2 ring-offset-1 ring-current' : 'opacity-70 hover:opacity-100'}`}
              >
                <span className="text-lg font-black">{count}</span>
                <span className="text-[9px] uppercase tracking-wide">{sev}</span>
              </button>
            );
          })}
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search incidents…"
              className="w-full pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-300"
            />
            {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2"><X size={11} className="text-slate-400" /></button>}
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="text-xs border border-slate-200 rounded-xl px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-300"
          >
            <option value="open">Open</option>
            <option value="investigating">Investigating</option>
            <option value="resolved">Resolved</option>
            <option value="all">All</option>
          </select>
          <button onClick={() => void load()} className="p-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-500">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto flex flex-col gap-1.5 min-h-0">
          {loading && <div className="flex items-center justify-center py-8 text-slate-400"><Loader2 size={16} className="animate-spin" /></div>}
          {!loading && filtered.length === 0 && (
            <div className="text-center py-8 text-slate-400 text-xs">No incidents found</div>
          )}
          {filtered.map(inc => (
            <button
              key={inc.id}
              onClick={() => { setSelected(inc); setInvestigationTokens(''); setInvestigationDone(false); }}
              className={`text-left p-3 rounded-xl border transition-all ${selected?.id === inc.id ? 'border-violet-300 bg-violet-50' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <SeverityBadge severity={inc.severity} />
                <StatusBadge status={inc.status} />
              </div>
              <p className="text-xs font-semibold text-slate-800 leading-snug mb-1 line-clamp-2">{inc.title}</p>
              <div className="flex items-center gap-2 text-[10px] text-slate-500">
                <span className="flex items-center gap-0.5"><Clock size={9} /> {timeAgo(inc.last_seen_at)}</span>
                <span className="flex items-center gap-0.5"><Activity size={9} /> {inc.event_count}×</span>
                {inc.data_loss_risk && <span className="text-red-500 font-bold">DATA RISK</span>}
              </div>
              {inc.affected_route && (
                <p className="text-[10px] text-slate-400 mt-0.5 truncate">{inc.affected_route}</p>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Right: detail panel */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        {!selected && (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
            <Shield size={32} className="opacity-30" />
            <p className="text-sm">Select an incident to investigate</p>
          </div>
        )}

        {selected && (
          <div className="flex flex-col gap-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <SeverityBadge severity={selected.severity} />
                  <StatusBadge status={selected.status} />
                  {selected.data_loss_risk && (
                    <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">DATA LOSS RISK</span>
                  )}
                </div>
                <h2 className="text-base font-bold text-slate-800">{selected.title}</h2>
                <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                  <span className="flex items-center gap-1"><Clock size={11} /> First: {timeAgo(selected.first_seen_at)}</span>
                  <span className="flex items-center gap-1"><Activity size={11} /> {selected.event_count} events</span>
                  <span className="flex items-center gap-1"><Users size={11} /> {selected.affected_user_count} user{selected.affected_user_count !== 1 ? 's' : ''}</span>
                  {selected.affected_route && <span className="flex items-center gap-1"><Globe size={11} /> {selected.affected_route}</span>}
                </div>
              </div>
              <button
                onClick={() => void handleInvestigate(selected)}
                disabled={investigating}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white text-xs font-bold transition-all disabled:opacity-60 shadow-sm whitespace-nowrap"
              >
                {investigating ? <><Loader2 size={12} className="animate-spin" /> Investigating…</> : <><Bot size={12} /> Investigate</>}
              </button>
            </div>

            {/* Quick facts */}
            {(selected.likely_cause || selected.immediate_workaround) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {selected.likely_cause && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                    <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1 flex items-center gap-1"><Zap size={10} /> Likely Cause</p>
                    <p className="text-xs text-slate-700">{selected.likely_cause}</p>
                    {selected.confidence && <p className="text-[10px] text-slate-400 mt-1">Confidence: {selected.confidence}</p>}
                  </div>
                )}
                {selected.immediate_workaround && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                    <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-1 flex items-center gap-1"><Wrench size={10} /> Workaround</p>
                    <p className="text-xs text-slate-700">{selected.immediate_workaround}</p>
                  </div>
                )}
              </div>
            )}

            {/* Running tools indicator */}
            {toolsRunning.length > 0 && (
              <div className="flex items-center gap-2 bg-violet-50 border border-violet-200 rounded-xl px-3 py-2 text-xs text-violet-600">
                <Loader2 size={11} className="animate-spin" />
                Running: {toolsRunning.join(', ')}
              </div>
            )}

            {/* Investigation report */}
            {(investigationTokens || selected.investigation_report) && (
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600">
                  <div className="flex items-center gap-2">
                    <Bot size={13} className="text-white" />
                    <span className="text-xs font-bold text-white">Dazza Investigation Report</span>
                  </div>
                  {investigating && <Loader2 size={12} className="text-violet-200 animate-spin" />}
                  {investigationDone && <CheckCircle2 size={12} className="text-emerald-300" />}
                </div>
                <div className="p-4">
                  <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">
                    {investigationTokens || selected.investigation_report}
                  </pre>
                </div>
              </div>
            )}

            {/* Repair prompt */}
            {selected.has_repair_prompt && selected.repair_prompt && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 bg-amber-100 border-b border-amber-200">
                  <div className="flex items-center gap-2">
                    <Send size={12} className="text-amber-600" />
                    <span className="text-xs font-bold text-amber-700">Airo Repair Prompt</span>
                  </div>
                  <button
                    onClick={() => handleCopyPrompt(selected.repair_prompt!)}
                    className="flex items-center gap-1 text-[10px] text-amber-600 hover:text-amber-700 font-semibold"
                  >
                    <Copy size={10} /> {promptCopied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <div className="p-4">
                  <pre className="text-xs text-slate-700 whitespace-pre-wrap font-mono leading-relaxed bg-white rounded-xl p-3 border border-amber-100">
                    {selected.repair_prompt}
                  </pre>
                </div>
              </div>
            )}

            {/* No investigation yet */}
            {!investigationTokens && !selected.investigation_report && !investigating && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center">
                <Bot size={20} className="text-slate-300 mx-auto mb-2" />
                <p className="text-xs text-slate-500">Click "Investigate" to run a deep AI analysis of this incident.</p>
                <p className="text-[10px] text-slate-400 mt-1">Dazza will use all available tools to gather evidence and produce a full report with an Airo repair prompt.</p>
              </div>
            )}

            {/* Communication panel */}
            <div className="border-t border-slate-200 pt-4">
              <CommunicationPanel
                incidentId={selected.id}
                incidentTitle={selected.title}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
