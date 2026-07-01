import { useState, useEffect, useCallback } from 'react';
import { Loader2, RefreshCw, ShieldCheck, XCircle, UserCheck, Shield, Mail, CheckCircle2 } from 'lucide-react';

interface AuditEntry {
  id: number;
  action_type: string;
  performed_by_user_id: string;
  performed_by_email: string | null;
  target_user_id: string;
  target_email: string | null;
  target_company_id: number | null;
  reason: string | null;
  meta: string | null;
  created_at: string;
}

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

function actionLabel(type: string): string {
  const map: Record<string, string> = {
    user_verified_manually: 'Manually verified',
    user_deactivated: 'Deactivated',
    user_reactivated: 'Reactivated',
    user_role_changed: 'Role changed',
    verification_email_resent: 'Verification resent',
  };
  return map[type] ?? type.replace(/_/g, ' ');
}

function ActionIcon({ type }: { type: string }) {
  const props = { size: 14, className: 'shrink-0' };
  switch (type) {
    case 'user_verified_manually': return <CheckCircle2 {...props} className="shrink-0 text-emerald-600" />;
    case 'user_deactivated': return <XCircle {...props} className="shrink-0 text-red-500" />;
    case 'user_reactivated': return <UserCheck {...props} className="shrink-0 text-green-600" />;
    case 'user_role_changed': return <Shield {...props} className="shrink-0 text-blue-600" />;
    case 'verification_email_resent': return <Mail {...props} className="shrink-0 text-blue-500" />;
    default: return <ShieldCheck {...props} className="shrink-0 text-slate-400" />;
  }
}

function actionBadgeClass(type: string): string {
  switch (type) {
    case 'user_verified_manually': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'user_deactivated': return 'bg-red-50 text-red-700 border-red-200';
    case 'user_reactivated': return 'bg-green-50 text-green-700 border-green-200';
    case 'user_role_changed': return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'verification_email_resent': return 'bg-sky-50 text-sky-700 border-sky-200';
    default: return 'bg-slate-50 text-slate-600 border-slate-200';
  }
}

export default function DeveloperAuditLogTab() {
  const [events, setEvents] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (filterAction) params.set('actionType', filterAction);
      const res = await fetch(`/api/developer/audit-log?${params}`, { credentials: 'include' });
      const data = await res.json() as { events?: AuditEntry[] };
      setEvents(data.events ?? []);
    } catch { /* silent */ }
    setLoading(false);
  }, [filterAction]);

  useEffect(() => { void load(); }, [load]);

  const actionTypes = [
    { value: '', label: 'All actions' },
    { value: 'user_verified_manually', label: 'Manually verified' },
    { value: 'user_deactivated', label: 'Deactivated' },
    { value: 'user_reactivated', label: 'Reactivated' },
    { value: 'user_role_changed', label: 'Role changed' },
    { value: 'verification_email_resent', label: 'Verification resent' },
  ];

  return (
    <div className="max-w-5xl">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-slate-800">Developer Action Audit Log</h2>
            <p className="text-xs text-slate-400 mt-0.5">{events.length} events · all developer actions are recorded here</p>
          </div>
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:border-primary/60 transition-colors"
          >
            {actionTypes.map((a) => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={22} className="animate-spin text-primary" />
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-16">
            <ShieldCheck size={28} className="text-slate-200 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-400">No audit events yet</p>
            <p className="text-xs text-slate-300 mt-1">Actions taken on user accounts will appear here</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Action</th>
                  <th className="text-left px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Target user</th>
                  <th className="text-left px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Performed by</th>
                  <th className="text-left px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Reason / Detail</th>
                  <th className="text-right px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {events.map((e) => {
                  let metaNote = '';
                  if (e.meta) {
                    try {
                      const m = JSON.parse(e.meta) as { from?: string; to?: string };
                      if (m.from && m.to) metaNote = `${m.from} → ${m.to}`;
                    } catch { /* ignore */ }
                  }
                  return (
                    <tr key={e.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <ActionIcon type={e.action_type} />
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border capitalize ${actionBadgeClass(e.action_type)}`}>
                            {actionLabel(e.action_type)}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="text-sm font-semibold text-slate-800 truncate max-w-[180px]">{e.target_email ?? e.target_user_id}</p>
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="text-xs text-slate-500 truncate max-w-[160px]">{e.performed_by_email ?? e.performed_by_user_id}</p>
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="text-xs text-slate-500 truncate max-w-[200px]">
                          {metaNote && <span className="font-semibold text-slate-700 mr-1">{metaNote}</span>}
                          {e.reason ?? '—'}
                        </p>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <span className="text-xs text-slate-400">{timeAgo(e.created_at)}</span>
                        <p className="text-[10px] text-slate-300">
                          {new Date(e.created_at).toLocaleString('en-AU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
