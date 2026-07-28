/**
 * EmailLogTab — Developer Console tab showing email delivery history.
 * Filters: email address, type, status (sent/failed).
 */
import { useState, useEffect, useCallback } from 'react';
import { Mail, CheckCircle2, XCircle, RefreshCw, Search, Filter, ChevronLeft, ChevronRight } from 'lucide-react';

interface EmailLogEntry {
  id: number;
  email_type: string;
  recipient_email: string;
  recipient_user_id: string | null;
  subject: string | null;
  status: string;
  provider_message_id: string | null;
  error_message: string | null;
  company_id: number | null;
  created_at: string;
}

const EMAIL_TYPES = [
  { value: '', label: 'All types' },
  { value: 'invite', label: 'Invite' },
  { value: 'invite_resend', label: 'Invite resend' },
  { value: 'password_reset', label: 'Password reset' },
  { value: 'verification', label: 'Verification' },
  { value: 'billing', label: 'Billing' },
  { value: 'welcome', label: 'Welcome' },
  { value: 'temp_password', label: 'Temp password' },
];

function typeLabel(type: string): string {
  return EMAIL_TYPES.find(t => t.value === type)?.label ?? type;
}

function typeColor(type: string): string {
  const map: Record<string, string> = {
    invite: 'bg-blue-100 text-blue-700',
    invite_resend: 'bg-blue-50 text-blue-600',
    password_reset: 'bg-amber-100 text-amber-700',
    verification: 'bg-purple-100 text-purple-700',
    billing: 'bg-green-100 text-green-700',
    welcome: 'bg-emerald-100 text-emerald-700',
    temp_password: 'bg-violet-100 text-violet-800',
  };
  return map[type] ?? 'bg-slate-100 text-slate-600';
}

export default function EmailLogTab() {
  const [logs, setLogs] = useState<EmailLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [emailFilter, setEmailFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const LIMIT = 50;

  const load = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(LIMIT) });
      if (emailFilter.trim()) params.set('email', emailFilter.trim());
      if (typeFilter) params.set('type', typeFilter);
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch(`/api/developer/email-log?${params}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs ?? []);
        setTotal(data.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [page, emailFilter, typeFilter, statusFilter]);

  useEffect(() => { void load(1); setPage(1); }, [emailFilter, typeFilter, statusFilter]);
  useEffect(() => { void load(page); }, [page]);

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Mail size={18} className="text-slate-500" />
            Email Delivery Log
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">Track all system emails — invites, resets, verifications, billing.</p>
        </div>
        <button
          onClick={() => void load(page)}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Filter by email…"
            value={emailFilter}
            onChange={e => setEmailFilter(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 w-52"
          />
        </div>
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          {EMAIL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="">All statuses</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
          <option value="queued">Queued</option>
        </select>
        <span className="text-xs text-slate-400 self-center ml-1">{total.toLocaleString()} total</span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {loading && logs.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">Loading…</div>
        ) : logs.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">No email records found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Recipient</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Subject</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map(log => (
                  <>
                    <tr
                      key={log.id}
                      className="hover:bg-slate-50 cursor-pointer transition-colors"
                      onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                    >
                      <td className="px-4 py-3">
                        {log.status === 'sent' ? (
                          <span className="flex items-center gap-1.5 text-emerald-600 font-medium">
                            <CheckCircle2 size={13} /> Sent
                          </span>
                        ) : log.status === 'failed' ? (
                          <span className="flex items-center gap-1.5 text-red-500 font-medium">
                            <XCircle size={13} /> Failed
                          </span>
                        ) : (
                          <span className="text-amber-500 font-medium">{log.status}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeColor(log.email_type)}`}>
                          {typeLabel(log.email_type)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700 font-mono text-xs">{log.recipient_email}</td>
                      <td className="px-4 py-3 text-slate-500 max-w-xs truncate">{log.subject ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                    </tr>
                    {expanded === log.id && (
                      <tr key={`${log.id}-detail`} className="bg-amber-50">
                        <td colSpan={5} className="px-4 py-3">
                          <div className="text-xs space-y-1">
                            {log.error_message && (
                              <div className="text-red-600 font-medium">
                                <span className="font-bold">Error:</span> {log.error_message}
                              </div>
                            )}
                            {log.provider_message_id && (
                              <div className="text-slate-500">
                                <span className="font-bold">Provider ID:</span> {log.provider_message_id}
                              </div>
                            )}
                            {log.company_id && (
                              <div className="text-slate-500">
                                <span className="font-bold">Company ID:</span> {log.company_id}
                              </div>
                            )}
                            <div className="text-slate-400">
                              <span className="font-bold">Log ID:</span> {log.id}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="flex items-center gap-1 px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 transition-colors"
            >
              <ChevronLeft size={14} /> Prev
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="flex items-center gap-1 px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 transition-colors"
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
