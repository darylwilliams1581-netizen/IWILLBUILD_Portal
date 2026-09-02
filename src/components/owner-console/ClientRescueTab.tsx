/**
 * ClientRescueTab.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Dazza V3 — Client Rescue queue for the Owner Console.
 * Shows users who need help, with call wording and status actions.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Phone, CheckCircle2, AlertCircle, Clock, RefreshCw, Loader2,
  User, MessageSquare, ArrowRight, Copy, Check, X,
  UserCheck, AlertTriangle,
} from 'lucide-react';

interface RescueEntry {
  id: string;
  incident_id: string | null;
  user_id: string | null;
  user_name: string;
  user_email: string;
  user_phone: string;
  attempted_action: string;
  failure_description: string;
  recovered: boolean;
  last_successful_action: string | null;
  likely_cause: string | null;
  safe_workaround: string | null;
  suggested_call_wording: string | null;
  rescue_status: string;
  called_at: string | null;
  resolved_at: string | null;
  created_at: string;
  incident_title: string | null;
  incident_severity: string | null;
  affected_route: string | null;
}

interface StatusCounts {
  needs_call?: number;
  called?: number;
  resolved?: number;
  escalated?: number;
  follow_up?: number;
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

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  needs_call: { label: 'Needs Call', color: 'bg-red-100 text-red-700 border-red-300' },
  called:     { label: 'Called', color: 'bg-blue-100 text-blue-700 border-blue-300' },
  resolved:   { label: 'Resolved', color: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
  escalated:  { label: 'Escalated', color: 'bg-orange-100 text-orange-700 border-orange-300' },
  follow_up:  { label: 'Follow Up', color: 'bg-amber-100 text-amber-700 border-amber-300' },
};

export default function ClientRescueTab() {
  const [entries, setEntries] = useState<RescueEntry[]>([]);
  const [statusCounts, setStatusCounts] = useState<StatusCounts>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<RescueEntry | null>(null);
  const [statusFilter, setStatusFilter] = useState('needs_call');
  const [updating, setUpdating] = useState<string | null>(null);
  const [copiedWording, setCopiedWording] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/dazza/v3/client-rescue?status=${statusFilter}&limit=100`, { credentials: 'include' });
      const d = await res.json() as { rescueEntries?: RescueEntry[]; statusCounts?: StatusCounts };
      setEntries(d.rescueEntries ?? []);
      setStatusCounts(d.statusCounts ?? {});
    } catch { /* ignore */ }
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { void load(); }, [load]);

  async function updateStatus(id: string, status: string, note?: string) {
    setUpdating(id);
    try {
      await fetch(`/api/dazza/v3/client-rescue/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status, note }),
      });
      await load();
      if (selected?.id === id) {
        setSelected(prev => prev ? { ...prev, rescue_status: status } : null);
      }
    } catch { /* ignore */ }
    setUpdating(null);
  }

  function copyWording(wording: string) {
    navigator.clipboard.writeText(wording).then(() => {
      setCopiedWording(true);
      setTimeout(() => setCopiedWording(false), 2000);
    }).catch(() => {});
  }

  const totalNeedsCall = (statusCounts.needs_call ?? 0) + (statusCounts.follow_up ?? 0);

  return (
    <div className="flex h-full gap-4">
      {/* Left: rescue list */}
      <div className="w-80 flex-shrink-0 flex flex-col gap-3">
        {/* Status summary */}
        <div className="grid grid-cols-3 gap-1.5">
          {(['needs_call', 'called', 'resolved'] as const).map(s => {
            const count = statusCounts[s] ?? 0;
            const info = STATUS_LABELS[s];
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s === statusFilter ? 'all' : s)}
                className={`flex flex-col items-center py-2 rounded-xl border text-xs font-bold transition-all ${info.color} ${statusFilter === s ? 'ring-2 ring-offset-1 ring-current' : 'opacity-70 hover:opacity-100'}`}
              >
                <span className="text-lg font-black">{count}</span>
                <span className="text-[9px] uppercase tracking-wide">{info.label}</span>
              </button>
            );
          })}
        </div>

        {totalNeedsCall > 0 && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700 font-semibold">
            <AlertTriangle size={12} /> {totalNeedsCall} client{totalNeedsCall !== 1 ? 's' : ''} need{totalNeedsCall === 1 ? 's' : ''} a call
          </div>
        )}

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="flex-1 text-xs border border-slate-200 rounded-xl px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-300"
          >
            <option value="needs_call">Needs Call</option>
            <option value="called">Called</option>
            <option value="follow_up">Follow Up</option>
            <option value="escalated">Escalated</option>
            <option value="resolved">Resolved</option>
            <option value="all">All</option>
          </select>
          <button onClick={() => void load()} className="p-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-500">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto flex flex-col gap-1.5 min-h-0">
          {loading && <div className="flex items-center justify-center py-8 text-slate-400"><Loader2 size={16} className="animate-spin" /></div>}
          {!loading && entries.length === 0 && (
            <div className="text-center py-8 text-slate-400 text-xs">No rescue entries</div>
          )}
          {entries.map(entry => {
            const statusInfo = STATUS_LABELS[entry.rescue_status] ?? STATUS_LABELS.needs_call;
            return (
              <button
                key={entry.id}
                onClick={() => setSelected(entry)}
                className={`text-left p-3 rounded-xl border transition-all ${selected?.id === entry.id ? 'border-violet-300 bg-violet-50' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <User size={11} className="text-slate-400" />
                    <span className="text-xs font-semibold text-slate-800">{entry.user_name}</span>
                  </div>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${statusInfo.color}`}>
                    {statusInfo.label}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 mb-1 line-clamp-1">{entry.attempted_action || entry.failure_description.slice(0, 60)}</p>
                <div className="flex items-center gap-2 text-[10px] text-slate-400">
                  <Clock size={9} /> {timeAgo(entry.created_at)}
                  {entry.recovered && <span className="text-emerald-500 font-semibold">Recovered</span>}
                  {!entry.recovered && <span className="text-red-500 font-semibold">Not recovered</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: detail panel */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        {!selected && (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
            <Phone size={32} className="opacity-30" />
            <p className="text-sm">Select a client to see rescue details</p>
          </div>
        )}

        {selected && (
          <div className="flex flex-col gap-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${(STATUS_LABELS[selected.rescue_status] ?? STATUS_LABELS.needs_call).color}`}>
                    {(STATUS_LABELS[selected.rescue_status] ?? STATUS_LABELS.needs_call).label}
                  </span>
                  {selected.incident_severity && (
                    <span className="text-[10px] font-bold text-slate-500">
                      Incident: {selected.incident_severity.toUpperCase()}
                    </span>
                  )}
                </div>
                <h2 className="text-base font-bold text-slate-800">{selected.user_name}</h2>
                <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                  {selected.user_email && <span>{selected.user_email}</span>}
                  {selected.user_phone && (
                    <a href={`tel:${selected.user_phone}`} className="flex items-center gap-1 text-violet-600 font-semibold hover:underline">
                      <Phone size={11} /> {selected.user_phone}
                    </a>
                  )}
                </div>
              </div>
              {/* Action buttons */}
              <div className="flex gap-2">
                {selected.rescue_status === 'needs_call' && (
                  <button
                    onClick={() => void updateStatus(selected.id, 'called')}
                    disabled={updating === selected.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors disabled:opacity-60"
                  >
                    {updating === selected.id ? <Loader2 size={11} className="animate-spin" /> : <Phone size={11} />}
                    Mark Called
                  </button>
                )}
                {(selected.rescue_status === 'called' || selected.rescue_status === 'follow_up') && (
                  <button
                    onClick={() => void updateStatus(selected.id, 'resolved', 'Resolved via call')}
                    disabled={updating === selected.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors disabled:opacity-60"
                  >
                    {updating === selected.id ? <Loader2 size={11} className="animate-spin" /> : <UserCheck size={11} />}
                    Resolved
                  </button>
                )}
              </div>
            </div>

            {/* What happened */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">What they tried</p>
                <p className="text-xs text-slate-700">{selected.attempted_action || 'Not recorded'}</p>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider mb-1">What failed</p>
                <p className="text-xs text-slate-700">{selected.failure_description}</p>
              </div>
              {selected.last_successful_action && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                  <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-1">Last successful action</p>
                  <p className="text-xs text-slate-700">{selected.last_successful_action}</p>
                </div>
              )}
              {selected.likely_cause && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1">Likely cause</p>
                  <p className="text-xs text-slate-700">{selected.likely_cause}</p>
                </div>
              )}
            </div>

            {/* Safe workaround */}
            {selected.safe_workaround && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <ArrowRight size={10} /> Safe workaround to tell them
                </p>
                <p className="text-xs text-slate-700">{selected.safe_workaround}</p>
              </div>
            )}

            {/* Suggested call wording */}
            {selected.suggested_call_wording && (
              <div className="bg-white border border-violet-200 rounded-2xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600">
                  <div className="flex items-center gap-2">
                    <MessageSquare size={13} className="text-white" />
                    <span className="text-xs font-bold text-white">Suggested call wording</span>
                  </div>
                  <button
                    onClick={() => copyWording(selected.suggested_call_wording!)}
                    className="flex items-center gap-1 text-[10px] text-violet-200 hover:text-white font-semibold"
                  >
                    {copiedWording ? <><Check size={10} /> Copied</> : <><Copy size={10} /> Copy</>}
                  </button>
                </div>
                <div className="p-4">
                  <p className="text-sm text-slate-700 leading-relaxed italic">
                    "{selected.suggested_call_wording}"
                  </p>
                </div>
              </div>
            )}

            {/* Default call wording if none stored */}
            {!selected.suggested_call_wording && (
              <div className="bg-white border border-violet-200 rounded-2xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600">
                  <div className="flex items-center gap-2">
                    <MessageSquare size={13} className="text-white" />
                    <span className="text-xs font-bold text-white">Suggested call wording</span>
                  </div>
                  <button
                    onClick={() => copyWording(`Hi ${selected.user_name.split(' ')[0]}, it's Daryl from IWIllBUILD. Our system flagged that you may have had trouble with ${selected.attempted_action || 'something in the app'}. I wanted to call before it became a bigger headache and make sure we get you working.`)}
                    className="flex items-center gap-1 text-[10px] text-violet-200 hover:text-white font-semibold"
                  >
                    {copiedWording ? <><Check size={10} /> Copied</> : <><Copy size={10} /> Copy</>}
                  </button>
                </div>
                <div className="p-4">
                  <p className="text-sm text-slate-700 leading-relaxed italic">
                    "Hi {selected.user_name.split(' ')[0]}, it's Daryl from IWIllBUILD. Our system flagged that you may have had trouble with {selected.attempted_action || 'something in the app'}. I wanted to call before it became a bigger headache and make sure we get you working."
                  </p>
                </div>
              </div>
            )}

            {/* Related incident */}
            {selected.incident_title && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Related incident</p>
                <p className="text-xs text-slate-700 font-semibold">{selected.incident_title}</p>
                {selected.affected_route && <p className="text-[10px] text-slate-400 mt-0.5">{selected.affected_route}</p>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
