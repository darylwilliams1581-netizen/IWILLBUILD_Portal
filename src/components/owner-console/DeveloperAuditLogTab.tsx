/**
 * DeveloperAuditLogTab
 * Shows developer-initiated actions: manual verify, deactivate/reactivate,
 * role changes, verification resends, template installs, etc.
 * Developer only — never exposed to company admins.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Loader2, RefreshCw, ShieldCheck, XCircle, UserCheck, Shield, Mail,
  CheckCircle2, ChevronLeft, ChevronRight, Building2,
} from 'lucide-react';

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

interface AuditResponse {
  events: AuditEntry[];
  total: number;
  limit: number;
  offset: number;
}

const PAGE_SIZE = 50;

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

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-AU', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function actionLabel(type: string): string {
  const map: Record<string, string> = {
    user_verified_manually:    'Manually verified',
    user_deactivated:          'Deactivated',
    user_reactivated:          'Reactivated',
    user_role_changed:         'Role changed',
    verification_email_resent: 'Verification resent',
    starter_pack_installed:    'Starter pack installed',
    form_templates_installed:  'Form templates installed',
    company_settings_changed:  'Company settings changed',
  };
  return map[type] ?? type.replace(/_/g, ' ');
}

function ActionIcon({ type }: { type: string }) {
  const cls = 'shrink-0';
  const sz = 14;
  switch (type) {
    case 'user_verified_manually':    return <CheckCircle2 size={sz} className={`${cls} text-emerald-600`} />;
    case 'user_deactivated':          return <XCircle      size={sz} className={`${cls} text-red-500`} />;
    case 'user_reactivated':          return <UserCheck    size={sz} className={`${cls} text-green-600`} />;
    case 'user_role_changed':         return <Shield       size={sz} className={`${cls} text-blue-600`} />;
    case 'verification_email_resent': return <Mail         size={sz} className={`${cls} text-blue-500`} />;
    default:                          return <ShieldCheck  size={sz} className={`${cls} text-slate-400`} />;
  }
}

function actionBadgeClass(type: string): string {
  switch (type) {
    case 'user_verified_manually':    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'user_deactivated':          return 'bg-red-50 text-red-700 border-red-200';
    case 'user_reactivated':          return 'bg-green-50 text-green-700 border-green-200';
    case 'user_role_changed':         return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'verification_email_resent': return 'bg-sky-50 text-sky-700 border-sky-200';
    case 'starter_pack_installed':
    case 'form_templates_installed':  return 'bg-violet-50 text-violet-700 border-violet-200';
    case 'company_settings_changed':  return 'bg-amber-50 text-amber-700 border-amber-200';
    default:                          return 'bg-slate-50 text-slate-600 border-slate-200';
  }
}

const ACTION_TYPE_OPTIONS = [
  { value: '', label: 'All actions' },
  { value: 'user_verified_manually',    label: 'Manually verified' },
  { value: 'user_deactivated',          label: 'Deactivated' },
  { value: 'user_reactivated',          label: 'Reactivated' },
  { value: 'user_role_changed',         label: 'Role changed' },
  { value: 'verification_email_resent', label: 'Verification resent' },
];

export default function DeveloperAuditLogTab() {
  const [events, setEvents]   = useState<AuditEntry[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage]       = useState(0);
  const [filterAction, setFilterAction] = useState('');

  const load = useCallback(async (pg = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit:  String(PAGE_SIZE),
        offset: String(pg * PAGE_SIZE),
      });
      if (filterAction) params.set('actionType', filterAction);

      const res  = await fetch(`/api/developer/audit-log?${params}`, { credentials: 'include' });
      const data = await res.json() as AuditResponse;
      setEvents(data.events ?? []);
      setTotal(data.total ?? 0);
    } catch { /* silent */ }
    setLoading(false);
  }, [page, filterAction]);

  useEffect(() => { void load(page); }, [load, page]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="max-w-6xl">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-slate-800 flex items-center gap-2">
              <ShieldCheck size={16} className="text-primary" />
              Developer Audit Log
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {total.toLocaleString()} actions · developer-initiated changes only
            </p>
          </div>
          <select
            value={filterAction}
            onChange={(e) => { setFilterAction(e.target.value); setPage(0); }}
            className="px-3 py-2 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:border-primary/60 transition-colors"
          >
            {ACTION_TYPE_OPTIONS.map((a) => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>
          <button
            onClick={() => void load(page)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={22} className="animate-spin text-primary" />
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-16">
            <ShieldCheck size={28} className="text-slate-200 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-400">No audit events yet</p>
            <p className="text-xs text-slate-300 mt-1">
              Developer actions on user accounts will appear here
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Action</th>
                  <th className="text-left px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Target user</th>
                  <th className="text-left px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Company</th>
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
                      {/* Action */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <ActionIcon type={e.action_type} />
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border capitalize ${actionBadgeClass(e.action_type)}`}>
                            {actionLabel(e.action_type)}
                          </span>
                        </div>
                      </td>

                      {/* Target user */}
                      <td className="px-5 py-3.5">
                        <p className="text-sm font-semibold text-slate-800 truncate max-w-[180px]">
                          {e.target_email ?? '—'}
                        </p>
                        {e.target_user_id && (
                          <p className="text-[10px] text-slate-400 font-mono truncate max-w-[180px]">
                            {e.target_user_id.slice(0, 12)}…
                          </p>
                        )}
                      </td>

                      {/* Company */}
                      <td className="px-5 py-3.5">
                        {e.target_company_id ? (
                          <div className="flex items-center gap-1">
                            <Building2 size={11} className="text-slate-300 shrink-0" />
                            <span className="text-xs text-slate-500 font-mono">#{e.target_company_id}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>

                      {/* Performed by */}
                      <td className="px-5 py-3.5">
                        <p className="text-xs text-slate-600 font-semibold truncate max-w-[160px]">
                          {e.performed_by_email ?? '—'}
                        </p>
                        <p className="text-[10px] text-slate-400 font-mono truncate max-w-[160px]">
                          {e.performed_by_user_id.slice(0, 12)}…
                        </p>
                      </td>

                      {/* Reason */}
                      <td className="px-5 py-3.5">
                        <p className="text-xs text-slate-500 truncate max-w-[200px]">
                          {metaNote && <span className="font-semibold text-slate-700 mr-1">{metaNote}</span>}
                          {e.reason ?? '—'}
                        </p>
                      </td>

                      {/* When */}
                      <td className="px-5 py-3.5 text-right">
                        <span className="text-xs text-slate-400">{timeAgo(e.created_at)}</span>
                        <p className="text-[10px] text-slate-300">{formatDate(e.created_at)}</p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
            <p className="text-xs text-slate-400">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total.toLocaleString()}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0 || loading}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-xs text-slate-500 font-semibold">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1 || loading}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 transition-colors"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
