/**
 * Job → Attendance tab
 *
 * Lets portal users sign in / sign out of a job and view the live roster
 * plus the full attendance log.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  LogIn, LogOut, Loader2, CheckCircle2, AlertCircle,
  Clock, QrCode, RefreshCw, User, UserCheck, History, WifiOff,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import JobQrModal from './JobQrModal';
import { useOfflineQueue } from '@/lib/useOfflineQueue';
import {
  type AttendanceOfflineAction,
  createOfflineClientId,
  readCachedAttendanceStatus,
  syncAttendanceAction,
  writeCachedAttendanceStatus,
} from '@/lib/offlineFieldActions';

interface OnSiteEntry {
  user_id: string;
  signed_in_at: string;
  actor_type: string;
  source: string;
  user_name: string | null;
  user_email: string | null;
}

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
  currentlyOnSite: OnSiteEntry[];
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
  const [status, setStatus]       = useState<StatusData | null>(() => {
    const cached = readCachedAttendanceStatus(jobId);
    return cached ? { ok: true, ...cached, currentlyOnSite: [], recentLog: [] } : null;
  });
  const [loading, setLoading]     = useState(true);
  const [message, setMessage]     = useState<{ text: string; ok: boolean } | null>(null);
  const [qrOpen, setQrOpen]       = useState(false);
  const [qrAction, setQrAction]   = useState<'signin' | 'signout'>('signin');
  // Auto-dismiss success message after 4 s
  const msgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousPendingRef = useRef(0);
  const { queue, enqueue, retryAll } = useOfflineQueue<AttendanceOfflineAction>(
    'job-attendance',
    syncAttendanceAction,
  );
  const jobQueue = queue.filter((item) => item.payload.jobId === jobId);
  const latestQueuedAction = jobQueue.at(-1)?.payload.action;
  const actionLoading = jobQueue.some((item) => item.status === 'syncing');

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/signin-status`, { credentials: 'include' });
      if (res.ok) {
        const next = await res.json() as StatusData;
        setStatus(next);
        writeCachedAttendanceStatus(jobId, {
          signedIn: next.signedIn,
          lastAction: next.lastAction === 'signin' || next.lastAction === 'signout' ? next.lastAction : null,
          lastActionAt: next.lastActionAt,
        });
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { void fetchStatus(); }, [fetchStatus]);

  useEffect(() => {
    if (previousPendingRef.current > 0 && jobQueue.length === 0 && navigator.onLine) {
      void fetchStatus();
    }
    previousPendingRef.current = jobQueue.length;
  }, [fetchStatus, jobQueue.length]);

  function handleAction(action: 'signin' | 'signout') {
    setMessage(null);
    if (msgTimer.current) clearTimeout(msgTimer.current);
    try {
      const occurredAt = new Date().toISOString();
      enqueue({
        clientId: createOfflineClientId(),
        jobId,
        action,
        occurredAt,
        actorType: 'employee',
      });
      const cached = {
        signedIn: action === 'signin',
        lastAction: action,
        lastActionAt: occurredAt,
      } as const;
      writeCachedAttendanceStatus(jobId, cached);
      setStatus((prev) => ({
        ok: true,
        currentlyOnSite: prev?.currentlyOnSite ?? [],
        recentLog: prev?.recentLog ?? [],
        ...cached,
      }));
      setMessage({
        text: navigator.onLine ? 'Saved on this device — syncing…' : 'Saved on this device — will sync when online.',
        ok: true,
      });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'Could not save on this device.', ok: false });
    }
  }

  function openQr(action: 'signin' | 'signout') {
    setQrAction(action);
    setQrOpen(true);
  }

  const signedIn = latestQueuedAction ? latestQueuedAction === 'signin' : (status?.signedIn ?? false);

  return (
    <div className="space-y-4">

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
          className="text-slate-600 hover:text-slate-800 transition-colors"
          title="Refresh"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* ── Action buttons ────────────────────────────────────────────────── */}
      {jobQueue.length > 0 && (
        <div className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${
          jobQueue[0].status === 'failed'
            ? 'bg-red-50 border-red-200 text-red-700'
            : 'bg-amber-50 border-amber-200 text-amber-800'
        }`}>
          {jobQueue[0].status === 'syncing'
            ? <Loader2 size={15} className="animate-spin shrink-0 mt-0.5" />
            : <WifiOff size={15} className="shrink-0 mt-0.5" />}
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {jobQueue[0].status === 'failed' ? 'Saved — sync needs attention' : jobQueue[0].status === 'syncing' ? 'Syncing attendance…' : 'Saved on this device'}
            </p>
            <p className="text-xs mt-0.5">
              {jobQueue[0].lastError ?? `${jobQueue.length} attendance action${jobQueue.length === 1 ? '' : 's'} will sync in order.`}
            </p>
          </div>
          {jobQueue[0].status === 'failed' && (
            <button type="button" onClick={retryAll} className="text-xs font-bold underline underline-offset-2">Retry</button>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => handleAction('signin')}
          disabled={actionLoading || signedIn}
          className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white text-sm font-bold rounded-lg transition-colors"
        >
          {actionLoading ? <Loader2 size={15} className="animate-spin" /> : <LogIn size={15} />}
          Sign In
        </button>
        <button
          onClick={() => handleAction('signout')}
          disabled={actionLoading || !signedIn}
          className="flex items-center gap-2 px-5 py-2.5 bg-slate-700 hover:bg-slate-800 disabled:opacity-40 text-white text-sm font-bold rounded-lg transition-colors"
        >
          {actionLoading ? <Loader2 size={15} className="animate-spin" /> : <LogOut size={15} />}
          Sign Out
        </button>
      </div>

      {/* ── Feedback message ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium ${
              message.ok
                ? 'bg-green-50 border border-green-200 text-green-700'
                : 'bg-red-50 border border-red-200 text-red-700'
            }`}
          >
            {message.ok
              ? <CheckCircle2 size={16} className="shrink-0" />
              : <AlertCircle size={16} className="shrink-0" />}
            {message.text}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── QR codes ─────────────────────────────────────────────────────── */}
      <div className="bg-white border border-border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <QrCode size={16} className="text-violet-600" />
          <h3 className="text-sm font-semibold text-slate-700">QR Code Access</h3>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          Generate a QR code for field workers or guests to sign in/out from their phone.
          Codes expire after 15 minutes.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => openQr('signin')}
            className="flex items-center gap-1.5 px-3 py-2 bg-violet-50 hover:bg-violet-100 border border-violet-200 text-violet-800 text-xs font-semibold rounded-lg transition-colors"
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

      {/* ── Currently on site — live roster ─────────────────────────────── */}
      <div className="bg-white border border-border rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-green-50">
          <UserCheck size={15} className="text-green-600" />
          <h3 className="text-sm font-semibold text-slate-700">Currently on Site</h3>
          <span className="ml-auto flex items-center gap-1.5 text-xs text-green-700 font-semibold">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block" />
            Live
          </span>
        </div>

        {loading && (
          <div className="flex items-center gap-2 px-4 py-4 text-sm text-slate-500">
            <Loader2 size={14} className="animate-spin" />
            Loading…
          </div>
        )}

        {!loading && (!status?.currentlyOnSite || status.currentlyOnSite.length === 0) && (
          <div className="px-4 py-6 text-center text-sm text-slate-400">
            Nobody is currently signed in to this job.
          </div>
        )}

        {!loading && status?.currentlyOnSite && status.currentlyOnSite.length > 0 && (
          <div className="divide-y divide-border">
            {status.currentlyOnSite.map((person) => (
              <div key={person.user_id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                  <User size={14} className="text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">
                    {person.user_name ?? person.user_email ?? 'Unknown'}
                  </p>
                  <p className="text-xs text-slate-400 flex items-center gap-1.5">
                    <span>{ACTOR_LABELS[person.actor_type] ?? person.actor_type}</span>
                    <span>·</span>
                    <span>{SOURCE_LABELS[person.source] ?? person.source}</span>
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs text-slate-400 flex items-center gap-1">
                    <Clock size={10} />
                    {new Date(person.signed_in_at).toLocaleString('en-AU', {
                      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                  <p className="text-xs font-semibold text-green-600 mt-0.5">On site</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Attendance log — raw history ─────────────────────────────────── */}
      <div className="bg-white border border-border rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <History size={15} className="text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-700">Attendance Log</h3>
          <span className="ml-auto text-xs text-slate-400">Last 30 entries</span>
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
