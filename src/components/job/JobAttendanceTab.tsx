/**
 * Job → Attendance tab
 *
 * Lets portal users sign in / sign out of a job and view the recent log.
 * Also provides QR code generation for guest/field access.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  LogIn, LogOut, Loader2, CheckCircle2, AlertCircle,
  Clock, Users, QrCode, RefreshCw, User,
} from 'lucide-react';
import JobQrModal from './JobQrModal';

interface AttendanceEntry {
  id: number;
  action: string;
  source: string;
  actor_type: string;
  notes: string | null;
  created_at: string;
  user_name: string | null;
  user_email: string | null;
}

interface StatusData {
  ok: boolean;
  signedIn: boolean;
  lastAction: string | null;
  lastActionAt: string | null;
  recentLog: AttendanceEntry[];
}

interface Props {
  jobId: number;
  jobName?: string;
}

const SOURCE_LABELS: Record<string, string> = {
  portal: 'Portal',
  qr:     'QR scan',
  manual: 'Manual',
};

const ACTOR_LABELS: Record<string, string> = {
  employee:        'Employee',
  contractor:      'Contractor',
  consultant:      'Consultant',
  delivery_driver: 'Delivery driver',
  guest:           'Guest',
};

export default function JobAttendanceTab({ jobId, jobName }: Props) {
  const [status, setStatus]       = useState<StatusData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage]     = useState<{ text: string; ok: boolean } | null>(null);
  const [qrOpen, setQrOpen]       = useState(false);
  const [qrAction, setQrAction]   = useState<'signin' | 'signout'>('signin');

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/signin-status`, { credentials: 'include' });
      if (res.ok) setStatus(await res.json() as StatusData);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { void fetchStatus(); }, [fetchStatus]);

  async function handleAction(action: 'signin' | 'signout') {
    setActionLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/${action}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json() as {
        ok: boolean;
        message?: string;
        alreadySignedIn?: boolean;
        notSignedIn?: boolean;
      };
      setMessage({ text: data.message ?? (res.ok ? 'Done.' : 'Failed.'), ok: res.ok });
      if (res.ok) {
        // Optimistically update signedIn immediately so buttons reflect new state
        if (action === 'signin') {
          setStatus((prev) => prev ? { ...prev, signedIn: true, lastAction: 'signin' } : prev);
        } else {
          setStatus((prev) => prev ? { ...prev, signedIn: false, lastAction: 'signout' } : prev);
        }
        // Then refresh from server for accurate state + recent log
        await fetchStatus();
      }
    } catch {
      setMessage({ text: 'Request failed. Please try again.', ok: false });
    } finally {
      setActionLoading(false);
    }
  }

  function openQr(action: 'signin' | 'signout') {
    setQrAction(action);
    setQrOpen(true);
  }

  const signedIn = status?.signedIn ?? false;

  return (
    <div className="max-w-2xl space-y-5">

      {/* ── Status card ──────────────────────────────────────────────────── */}
      <div className={`rounded-xl border p-5 flex items-center gap-4 ${
        signedIn
          ? 'bg-green-50 border-green-200'
          : 'bg-slate-50 border-slate-200'
      }`}>
        <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
          signedIn ? 'bg-green-100' : 'bg-slate-200'
        }`}>
          <User size={22} className={signedIn ? 'text-green-600' : 'text-slate-500'} />
        </div>
        <div className="flex-1 min-w-0">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 size={14} className="animate-spin" />
              Checking status…
            </div>
          ) : (
            <>
              <p className="font-semibold text-slate-800">
                {signedIn ? 'You are signed in to this job' : 'You are not signed in'}
              </p>
              {status?.lastActionAt && (
                <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                  <Clock size={11} />
                  Last action: {status.lastAction} at {new Date(status.lastActionAt).toLocaleString('en-AU')}
                </p>
              )}
            </>
          )}
        </div>
        <button
          onClick={fetchStatus}
          disabled={loading}
          className="text-slate-400 hover:text-slate-600 transition-colors"
          title="Refresh"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* ── Action buttons ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => void handleAction('signin')}
          disabled={actionLoading || signedIn}
          className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white text-sm font-bold rounded-lg transition-colors"
        >
          {actionLoading ? <Loader2 size={15} className="animate-spin" /> : <LogIn size={15} />}
          Sign In
        </button>
        <button
          onClick={() => void handleAction('signout')}
          disabled={actionLoading || !signedIn}
          className="flex items-center gap-2 px-5 py-2.5 bg-slate-700 hover:bg-slate-800 disabled:opacity-40 text-white text-sm font-bold rounded-lg transition-colors"
        >
          {actionLoading ? <Loader2 size={15} className="animate-spin" /> : <LogOut size={15} />}
          Sign Out
        </button>
      </div>

      {/* ── Feedback message ──────────────────────────────────────────────── */}
      {message && (
        <div className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm ${
          message.ok
            ? 'bg-green-50 border border-green-200 text-green-700'
            : 'bg-red-50 border border-red-200 text-red-700'
        }`}>
          {message.ok
            ? <CheckCircle2 size={14} className="shrink-0" />
            : <AlertCircle size={14} className="shrink-0" />}
          {message.text}
        </div>
      )}

      {/* ── QR codes ─────────────────────────────────────────────────────── */}
      <div className="bg-white border border-border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <QrCode size={16} className="text-orange-500" />
          <h3 className="text-sm font-semibold text-slate-700">QR Code Access</h3>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          Generate a QR code for field workers or guests to sign in/out from their phone.
          Codes expire after 15 minutes.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => openQr('signin')}
            className="flex items-center gap-1.5 px-3 py-2 bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-700 text-xs font-semibold rounded-lg transition-colors"
          >
            <QrCode size={13} />
            QR Sign In
          </button>
          <button
            onClick={() => openQr('signout')}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
          >
            <QrCode size={13} />
            QR Sign Out
          </button>
        </div>
      </div>

      {/* ── Recent log ───────────────────────────────────────────────────── */}
      <div className="bg-white border border-border rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Users size={15} className="text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-700">Recent Attendance</h3>
          <span className="ml-auto text-xs text-slate-400">Last 20 entries</span>
        </div>

        {loading && (
          <div className="flex items-center gap-2 px-4 py-4 text-sm text-slate-500">
            <Loader2 size={14} className="animate-spin" />
            Loading…
          </div>
        )}

        {!loading && (!status?.recentLog || status.recentLog.length === 0) && (
          <div className="px-4 py-6 text-center text-sm text-slate-400">
            No attendance records yet.
          </div>
        )}

        {!loading && status?.recentLog && status.recentLog.length > 0 && (
          <div className="divide-y divide-border">
            {status.recentLog.map((entry) => (
              <div key={entry.id} className="flex items-center gap-3 px-4 py-3">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                  entry.action === 'signin' ? 'bg-green-100' : 'bg-slate-100'
                }`}>
                  {entry.action === 'signin'
                    ? <LogIn size={13} className="text-green-600" />
                    : <LogOut size={13} className="text-slate-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">
                    {entry.user_name ?? entry.user_email ?? 'Unknown user'}
                  </p>
                  <p className="text-xs text-slate-400 flex items-center gap-1.5">
                    <span className={entry.action === 'signin' ? 'text-green-600 font-semibold' : 'text-slate-500 font-semibold'}>
                      {entry.action === 'signin' ? 'Signed in' : 'Signed out'}
                    </span>
                    <span>·</span>
                    <span>{ACTOR_LABELS[entry.actor_type] ?? entry.actor_type}</span>
                    <span>·</span>
                    <span>{SOURCE_LABELS[entry.source] ?? entry.source}</span>
                  </p>
                </div>
                <span className="text-xs text-slate-400 flex-shrink-0">
                  {new Date(entry.created_at).toLocaleString('en-AU', {
                    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                  })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── QR Modal ─────────────────────────────────────────────────────── */}
      {qrOpen && (
        <JobQrModal
          jobId={jobId}
          jobName={jobName}
          action={qrAction}
          onClose={() => setQrOpen(false)}
        />
      )}
    </div>
  );
}
