/**
 * ActivityLogTab — cross-company login and account activity log for platform developers.
 * Shows login successes, failures, logouts, password resets, email verifications,
 * and developer-initiated account actions.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Loader2, RefreshCw, Activity, LogIn, LogOut, ShieldX,
  KeyRound, Mail, MailCheck, ChevronLeft,
  ChevronRight, Search, Filter, AlertTriangle, CheckCircle2, XCircle,
  Eye, Globe,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ActivityEntry {
  id: number;
  event_type: string;
  success: number | boolean;
  user_id: string | null;
  email: string | null;
  company_id: number | null;
  performed_by_user_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  reason: string | null;
  metadata_json: string | null;
  created_at: string;
}

interface ActivityResponse {
  events: ActivityEntry[];
  total: number;
  limit: number;
  offset: number;
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

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-AU', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function eventLabel(type: string): string {
  const map: Record<string, string> = {
    login_success:              'Login success',
    login_failed:               'Login failed',
    login_blocked_unverified:   'Blocked — unverified',
    login_blocked_inactive:     'Blocked — inactive',
    rate_limited_login:         'Rate limited',
    logout:                     'Logout',
    password_reset_requested:   'Password reset requested',
    password_changed:           'Password changed',
    email_verification_sent:    'Verification email sent',
    email_verified:             'Email verified',
    pin_login_success:          'PIN login success',
    pin_login_failed:           'PIN login failed',
  };
  return map[type] ?? type.replace(/_/g, ' ');
}

function EventIcon({ type, success }: { type: string; success: boolean }) {
  const cls = 'shrink-0';
  const sz = 14;
  if (!success) return <XCircle size={sz} className={`${cls} text-red-500`} />;
  switch (type) {
    case 'login_success':
    case 'pin_login_success':      return <LogIn size={sz} className={`${cls} text-emerald-600`} />;
    case 'login_failed':
    case 'pin_login_failed':       return <ShieldX size={sz} className={`${cls} text-red-500`} />;
    case 'login_blocked_unverified':
    case 'login_blocked_inactive': return <AlertTriangle size={sz} className={`${cls} text-amber-500`} />;
    case 'rate_limited_login':     return <AlertTriangle size={sz} className={`${cls} text-orange-500`} />;
    case 'logout':                 return <LogOut size={sz} className={`${cls} text-slate-400`} />;
    case 'password_reset_requested': return <KeyRound size={sz} className={`${cls} text-amber-500`} />;
    case 'password_changed':       return <KeyRound size={sz} className={`${cls} text-blue-600`} />;
    case 'email_verification_sent': return <Mail size={sz} className={`${cls} text-sky-500`} />;
    case 'email_verified':         return <MailCheck size={sz} className={`${cls} text-emerald-600`} />;
    default:                       return <Activity size={sz} className={`${cls} text-slate-400`} />;
  }
}

function eventBadgeClass(type: string, success: boolean): string {
  if (!success) return 'bg-red-50 text-red-700 border-red-200';
  switch (type) {
    case 'login_success':
    case 'pin_login_success':      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'login_failed':
    case 'pin_login_failed':       return 'bg-red-50 text-red-700 border-red-200';
    case 'login_blocked_unverified':
    case 'login_blocked_inactive': return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'rate_limited_login':     return 'bg-orange-50 text-orange-700 border-orange-200';
    case 'logout':                 return 'bg-slate-50 text-slate-500 border-slate-200';
    case 'password_reset_requested': return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'password_changed':       return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'email_verification_sent': return 'bg-sky-50 text-sky-700 border-sky-200';
    case 'email_verified':         return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    default:                       return 'bg-slate-50 text-slate-600 border-slate-200';
  }
}

function parseUserAgent(ua: string | null): string {
  if (!ua) return '—';
  // Extract browser name
  if (ua.includes('Chrome') && !ua.includes('Edg')) return 'Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
  if (ua.includes('Edg')) return 'Edge';
  if (ua.includes('OPR') || ua.includes('Opera')) return 'Opera';
  if (ua.includes('curl')) return 'curl';
  if (ua.includes('PostmanRuntime')) return 'Postman';
  return ua.slice(0, 30);
}

// ── Filter options ────────────────────────────────────────────────────────────

// Activity Log only shows auth/account events — developer actions go in Audit Log
const EVENT_TYPE_OPTIONS = [
  { value: '', label: 'All events' },
  { value: 'login_success',              label: 'Login success' },
  { value: 'login_failed',               label: 'Login failed' },
  { value: 'login_blocked_unverified',   label: 'Blocked — unverified' },
  { value: 'login_blocked_inactive',     label: 'Blocked — inactive' },
  { value: 'rate_limited_login',         label: 'Rate limited' },
  { value: 'logout',                     label: 'Logout' },
  { value: 'password_reset_requested',   label: 'Password reset requested' },
  { value: 'password_changed',           label: 'Password changed' },
  { value: 'email_verification_sent',    label: 'Verification email sent' },
  { value: 'email_verified',             label: 'Email verified' },
  { value: 'pin_login_success',          label: 'PIN login success' },
  { value: 'pin_login_failed',           label: 'PIN login failed' },
];

const SUCCESS_OPTIONS = [
  { value: '', label: 'All outcomes' },
  { value: '1', label: 'Success only' },
  { value: '0', label: 'Failed only' },
];

const PAGE_SIZE = 50;

// ── Component ─────────────────────────────────────────────────────────────────

export default function ActivityLogTab() {
  const [events, setEvents]         = useState<ActivityEntry[]>([]);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(true);
  const [page, setPage]             = useState(0);

  // Filters
  const [eventType, setEventType]   = useState('');
  const [successFilter, setSuccess] = useState('');
  const [emailSearch, setEmail]     = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [dateFrom, setDateFrom]     = useState('');
  const [dateTo, setDateTo]         = useState('');

  // Expanded row for user agent detail
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const load = useCallback(async (pg = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(pg * PAGE_SIZE),
      });
      if (eventType)     params.set('eventType', eventType);
      if (successFilter) params.set('success', successFilter);
      if (emailSearch)   params.set('email', emailSearch);
      if (dateFrom)      params.set('dateFrom', dateFrom);
      if (dateTo)        params.set('dateTo', dateTo);

      const res = await fetch(`/api/developer/activity-log?${params}`, { credentials: 'include' });
      const data = await res.json() as ActivityResponse;
      setEvents(data.events ?? []);
      setTotal(data.total ?? 0);
    } catch { /* silent */ }
    setLoading(false);
  }, [page, eventType, successFilter, emailSearch, dateFrom, dateTo]);

  useEffect(() => { void load(page); }, [load, page]);

  function applyFilters() {
    setEmail(emailInput);
    setPage(0);
  }

  function clearFilters() {
    setEventType('');
    setSuccess('');
    setEmailInput('');
    setEmail('');
    setDateFrom('');
    setDateTo('');
    setPage(0);
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const hasFilters = eventType || successFilter || emailSearch || dateFrom || dateTo;

  return (
    <div className="max-w-6xl">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

        {/* ── Header ── */}
        <div className="px-5 py-4 border-b border-slate-100">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="font-bold text-slate-800 flex items-center gap-2">
                <Activity size={16} className="text-primary" />
                Activity Log
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {total.toLocaleString()} events · login, auth &amp; account events · developer only
              </p>
            </div>
            <button
              onClick={() => void load(page)}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>

          {/* ── Filters ── */}
          <div className="mt-3 flex flex-wrap gap-2 items-end">
            {/* Event type */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Event</label>
              <select
                value={eventType}
                onChange={(e) => { setEventType(e.target.value); setPage(0); }}
                className="px-3 py-1.5 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:border-primary/60 transition-colors min-w-[180px]"
              >
                {EVENT_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Success */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Outcome</label>
              <select
                value={successFilter}
                onChange={(e) => { setSuccess(e.target.value); setPage(0); }}
                className="px-3 py-1.5 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:border-primary/60 transition-colors"
              >
                {SUCCESS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Email search */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Email</label>
              <div className="flex gap-1">
                <input
                  type="text"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
                  placeholder="Search email…"
                  className="px-3 py-1.5 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:border-primary/60 transition-colors w-44"
                />
                <button
                  onClick={applyFilters}
                  className="px-2.5 py-1.5 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
                >
                  <Search size={13} />
                </button>
              </div>
            </div>

            {/* Date range */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
                className="px-3 py-1.5 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:border-primary/60 transition-colors"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">To</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
                className="px-3 py-1.5 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:border-primary/60 transition-colors"
              />
            </div>

            {hasFilters && (
              <button
                onClick={clearFilters}
                className="self-end px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-500 hover:bg-slate-50 transition-colors flex items-center gap-1"
              >
                <Filter size={11} />
                Clear
              </button>
            )}
          </div>
        </div>

        {/* ── Table ── */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={22} className="animate-spin text-primary" />
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-16">
            <Activity size={28} className="text-slate-200 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-400">No activity events yet</p>
            <p className="text-xs text-slate-300 mt-1">Login attempts and account events will appear here</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Event</th>
                  <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Email / User</th>
                  <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">IP</th>
                  <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Browser</th>
                  <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Reason / Detail</th>
                  <th className="text-right px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {events.map((e) => {
                  const isSuccess = Boolean(e.success);
                  const isExpanded = expandedId === e.id;

                  let metaNote = '';
                  if (e.metadata_json) {
                    try {
                      const m = JSON.parse(e.metadata_json) as { from?: string; to?: string };
                      if (m.from && m.to) metaNote = `${m.from} → ${m.to}`;
                    } catch { /* ignore */ }
                  }

                  return (
                    <>
                      <tr
                        key={e.id}
                        className={`hover:bg-slate-50 transition-colors cursor-pointer ${!isSuccess ? 'bg-red-50/30' : ''}`}
                        onClick={() => setExpandedId(isExpanded ? null : e.id)}
                      >
                        {/* Event type */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <EventIcon type={e.event_type} success={isSuccess} />
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border capitalize ${eventBadgeClass(e.event_type, isSuccess)}`}>
                              {eventLabel(e.event_type)}
                            </span>
                            {isSuccess
                              ? <CheckCircle2 size={11} className="text-emerald-400 shrink-0" />
                              : <XCircle size={11} className="text-red-400 shrink-0" />
                            }
                          </div>
                        </td>

                        {/* Email */}
                        <td className="px-4 py-3">
                          <p className="text-sm font-semibold text-slate-800 truncate max-w-[200px]">
                            {e.email ?? '—'}
                          </p>
                          {e.user_id && (
                            <p className="text-[10px] text-slate-400 truncate max-w-[200px]">
                              {e.user_id.slice(0, 12)}…
                            </p>
                          )}
                        </td>

                        {/* IP */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <Globe size={11} className="text-slate-300 shrink-0" />
                            <span className="text-xs text-slate-500 font-mono">{e.ip_address ?? '—'}</span>
                          </div>
                        </td>

                        {/* Browser */}
                        <td className="px-4 py-3">
                          <span className="text-xs text-slate-500">{parseUserAgent(e.user_agent)}</span>
                        </td>

                        {/* Reason */}
                        <td className="px-4 py-3">
                          <p className="text-xs text-slate-500 truncate max-w-[200px]">
                            {metaNote && <span className="font-semibold text-slate-700 mr-1">{metaNote}</span>}
                            {e.reason ?? '—'}
                          </p>
                        </td>

                        {/* When */}
                        <td className="px-4 py-3 text-right">
                          <span className="text-xs text-slate-400">{timeAgo(e.created_at)}</span>
                          <p className="text-[10px] text-slate-300">{formatDate(e.created_at)}</p>
                          <Eye size={10} className={`ml-auto mt-0.5 transition-colors ${isExpanded ? 'text-primary' : 'text-slate-200'}`} />
                        </td>
                      </tr>

                      {/* Expanded detail row */}
                      {isExpanded && (
                        <tr key={`${e.id}-detail`} className="bg-slate-50 border-b border-slate-100">
                          <td colSpan={6} className="px-6 py-3">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                              <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Full IP</p>
                                <p className="font-mono text-slate-700">{e.ip_address ?? '—'}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">User ID</p>
                                <p className="font-mono text-slate-700 break-all">{e.user_id ?? '—'}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Performed by</p>
                                <p className="font-mono text-slate-700 break-all">{e.performed_by_user_id ?? '—'}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Company ID</p>
                                <p className="font-mono text-slate-700">{e.company_id ?? '—'}</p>
                              </div>
                              <div className="col-span-2 md:col-span-4">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">User Agent</p>
                                <p className="font-mono text-slate-600 break-all text-[11px]">{e.user_agent ?? '—'}</p>
                              </div>
                              {e.metadata_json && (
                                <div className="col-span-2 md:col-span-4">
                                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Metadata</p>
                                  <p className="font-mono text-slate-600 break-all text-[11px]">{e.metadata_json}</p>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Pagination ── */}
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
