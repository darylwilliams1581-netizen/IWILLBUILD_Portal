/**
 * FleetUsagePanel
 * Sign On / Sign Off panel for a fleet asset.
 * Shown in the fleet-detail page as a dedicated "Usage" tab section.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  LogIn, LogOut, Loader2, AlertCircle, CheckCircle2,
  Clock, Briefcase, Calendar, BarChart2, RefreshCw,
  ChevronDown, ChevronUp, Timer,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ActiveSession {
  id: number;
  user_id: string;
  actor_type: string;
  started_at: string;
  elapsed_minutes: number;
  job_id: number | null;
  job_name: string | null;
  job_number: string | null;
  meter_start: number | null;
  note: string | null;
  source: string;
}

interface PeriodTotals {
  sessionCount: number;
  totalMinutes: number;
}

interface RecentSession {
  id: number;
  user_id: string;
  actor_type: string;
  started_at: string;
  ended_at: string;
  duration_minutes: number;
  job_id: number | null;
  job_name: string | null;
  job_number: string | null;
  source: string;
  note: string | null;
}

interface UsageStatus {
  ok: boolean;
  activeSession: ActiveSession | null;
  today: PeriodTotals;
  thisWeek: PeriodTotals;
  recentSessions: RecentSession[];
}

interface Job {
  id: number;
  name: string;
  job_number: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMinutes(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function fmtElapsed(startedAt: string): string {
  const diffMs = Date.now() - new Date(startedAt).getTime();
  const totalMins = Math.floor(diffMs / 60000);
  return fmtMinutes(totalMins);
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

const ACTOR_TYPES = [
  { value: 'employee',        label: 'Employee' },
  { value: 'contractor',      label: 'Contractor' },
  { value: 'consultant',      label: 'Consultant' },
  { value: 'delivery_driver', label: 'Delivery driver' },
  { value: 'guest',           label: 'Guest' },
];

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  fleetId: number;
  assetName?: string;
}

export default function FleetUsagePanel({ fleetId, assetName }: Props) {
  const [status, setStatus]         = useState<UsageStatus | null>(null);
  const [loading, setLoading]       = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Sign-on form
  const [showSignOnForm, setShowSignOnForm] = useState(false);
  const [actorType, setActorType]   = useState('employee');
  const [jobId, setJobId]           = useState<string>('');
  const [note, setNote]             = useState('');
  const [meterStart, setMeterStart] = useState('');

  // Sign-off form
  const [showSignOffForm, setShowSignOffForm] = useState(false);
  const [signOffNote, setSignOffNote]     = useState('');
  const [meterEnd, setMeterEnd]           = useState('');

  // Jobs list for picker
  const [jobs, setJobs]             = useState<Job[]>([]);

  // Elapsed ticker
  const [, setTick] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/fleet/${fleetId}/usage-status`, { credentials: 'include' });
      if (!res.ok) { setError('Failed to load usage status'); return; }
      const data = await res.json() as UsageStatus;
      setStatus(data);
      setError(null);
    } catch {
      setError('Network error loading usage status');
    } finally {
      setLoading(false);
    }
  }, [fleetId]);

  const loadJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/jobs', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json() as { jobs?: Job[] } | Job[];
      setJobs(Array.isArray(data) ? data : (data.jobs ?? []));
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    void loadStatus();
    void loadJobs();
  }, [loadStatus, loadJobs]);

  // Tick every 30s to update elapsed display
  useEffect(() => {
    tickRef.current = setInterval(() => setTick(t => t + 1), 30_000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, []);

  // ── Actions ────────────────────────────────────────────────────────────────

  async function handleSignOn() {
    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await fetch(`/api/fleet/${fleetId}/signin`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actorType,
          jobId: jobId ? parseInt(jobId) : null,
          note: note.trim() || null,
          meterStart: meterStart ? parseFloat(meterStart) : null,
          source: 'portal',
        }),
      });
      const data = await res.json() as { ok?: boolean; error?: string; activeSession?: ActiveSession };
      if (!res.ok) {
        if (res.status === 409) {
          setActionError(`Already signed on${data.activeSession ? ` since ${fmtTime(data.activeSession.started_at)}` : ''}. Sign off first.`);
        } else {
          setActionError(data.error ?? 'Failed to sign on');
        }
        return;
      }
      setActionSuccess('Signed on successfully.');
      setShowSignOnForm(false);
      setNote(''); setMeterStart(''); setJobId('');
      void loadStatus();
    } catch {
      setActionError('Network error. Please try again.');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSignOff() {
    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await fetch(`/api/fleet/${fleetId}/signout`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          note: signOffNote.trim() || null,
          meterEnd: meterEnd ? parseFloat(meterEnd) : null,
        }),
      });
      const data = await res.json() as { ok?: boolean; error?: string; session?: RecentSession };
      if (!res.ok) {
        setActionError(data.error ?? 'Failed to sign off');
        return;
      }
      const dur = data.session?.duration_minutes ?? 0;
      setActionSuccess(`Signed off. Session duration: ${fmtMinutes(dur)}.`);
      setShowSignOffForm(false);
      setSignOffNote(''); setMeterEnd('');
      void loadStatus();
    } catch {
      setActionError('Network error. Please try again.');
    } finally {
      setActionLoading(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 size={24} className="animate-spin mr-2" />
        Loading usage status…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
        <AlertCircle size={16} className="shrink-0" />
        {error}
        <button onClick={() => void loadStatus()} className="ml-auto text-red-500 hover:text-red-700">
          <RefreshCw size={14} />
        </button>
      </div>
    );
  }

  const active = status?.activeSession ?? null;
  const isActive = !!active;

  return (
    <div className="space-y-5">

      {/* ── Status card ─────────────────────────────────────────────────── */}
      <div className={`rounded-2xl border-2 p-5 transition-colors ${
        isActive
          ? 'border-green-300 bg-green-50'
          : 'border-slate-200 bg-white'
      }`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
              isActive ? 'bg-green-500 text-white' : 'bg-slate-100 text-slate-400'
            }`}>
              {isActive ? <Timer size={20} /> : <Clock size={20} />}
            </div>
            <div>
              {isActive ? (
                <>
                  <p className="font-bold text-green-800 text-sm">Active session</p>
                  <p className="text-green-700 text-xs mt-0.5">
                    Started {fmtTime(active!.started_at)} · {fmtElapsed(active!.started_at)} elapsed
                  </p>
                  {active!.job_name && (
                    <p className="text-green-600 text-xs mt-0.5 flex items-center gap-1">
                      <Briefcase size={10} />
                      {active!.job_name} {active!.job_number ? `(${active!.job_number})` : ''}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="font-bold text-slate-600 text-sm">No active session</p>
                  <p className="text-slate-400 text-xs mt-0.5">Asset is available to sign on</p>
                </>
              )}
            </div>
          </div>

          <div className="flex gap-2 flex-shrink-0">
            {!isActive && (
              <button
                onClick={() => { setShowSignOnForm(v => !v); setShowSignOffForm(false); setActionError(null); setActionSuccess(null); }}
                className="flex items-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-lg transition-colors"
              >
                <LogIn size={13} />
                Sign On
              </button>
            )}
            {isActive && (
              <button
                onClick={() => { setShowSignOffForm(v => !v); setShowSignOnForm(false); setActionError(null); setActionSuccess(null); }}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold rounded-lg transition-colors"
              >
                <LogOut size={13} />
                Sign Off
              </button>
            )}
            <button
              onClick={() => void loadStatus()}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              title="Refresh"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {/* ── Feedback ── */}
        {actionSuccess && (
          <div className="mt-3 flex items-center gap-2 bg-green-100 border border-green-200 rounded-lg px-3 py-2 text-xs text-green-800">
            <CheckCircle2 size={13} className="shrink-0" />
            {actionSuccess}
          </div>
        )}
        {actionError && (
          <div className="mt-3 flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
            <AlertCircle size={13} className="shrink-0" />
            {actionError}
          </div>
        )}

        {/* ── Sign On form ── */}
        {showSignOnForm && !isActive && (
          <div className="mt-4 pt-4 border-t border-green-200 space-y-3">
            <p className="text-xs font-bold text-green-800 uppercase tracking-wide">Sign On Details</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Actor type</label>
                <select
                  value={actorType}
                  onChange={e => setActorType(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400/30"
                >
                  {ACTOR_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Job (optional)</label>
                <select
                  value={jobId}
                  onChange={e => setJobId(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400/30"
                >
                  <option value="">— No job —</option>
                  {jobs.map(j => (
                    <option key={j.id} value={j.id}>
                      {j.job_number ? `${j.job_number} — ` : ''}{j.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Meter / hours start (optional)</label>
                <input
                  type="number"
                  value={meterStart}
                  onChange={e => setMeterStart(e.target.value)}
                  placeholder="e.g. 1234.5"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400/30"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Note (optional)</label>
                <input
                  type="text"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="Any notes…"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400/30"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSignOn}
                disabled={actionLoading}
                className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-colors"
              >
                {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <LogIn size={14} />}
                {actionLoading ? 'Signing on…' : 'Confirm Sign On'}
              </button>
              <button
                onClick={() => setShowSignOnForm(false)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 text-sm rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* ── Sign Off form ── */}
        {showSignOffForm && isActive && (
          <div className="mt-4 pt-4 border-t border-slate-200 space-y-3">
            <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">Sign Off Details</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Meter / hours end (optional)</label>
                <input
                  type="number"
                  value={meterEnd}
                  onChange={e => setMeterEnd(e.target.value)}
                  placeholder="e.g. 1256.0"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/30"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Note (optional)</label>
                <input
                  type="text"
                  value={signOffNote}
                  onChange={e => setSignOffNote(e.target.value)}
                  placeholder="Any notes…"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/30"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSignOff}
                disabled={actionLoading}
                className="flex items-center gap-1.5 px-4 py-2 bg-slate-700 hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-colors"
              >
                {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
                {actionLoading ? 'Signing off…' : 'Confirm Sign Off'}
              </button>
              <button
                onClick={() => setShowSignOffForm(false)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 text-sm rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Period totals ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Calendar size={14} className="text-slate-400" />
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Today</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">
            {status ? fmtMinutes(status.today.totalMinutes) : '—'}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            {status?.today.sessionCount ?? 0} session{status?.today.sessionCount !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <BarChart2 size={14} className="text-slate-400" />
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">This week</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">
            {status ? fmtMinutes(status.thisWeek.totalMinutes) : '—'}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            {status?.thisWeek.sessionCount ?? 0} session{status?.thisWeek.sessionCount !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* ── Recent sessions ──────────────────────────────────────────────── */}
      {(status?.recentSessions?.length ?? 0) > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
            <Clock size={14} className="text-slate-400" />
            <h3 className="text-sm font-bold text-slate-700">Recent sessions</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {status!.recentSessions.map(s => (
              <div key={s.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-700">
                    {fmtDate(s.started_at)} · {fmtTime(s.started_at)} → {fmtTime(s.ended_at)}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-xs text-slate-400 capitalize">{s.actor_type.replace('_', ' ')}</span>
                    {s.job_name && (
                      <span className="text-xs text-slate-400 flex items-center gap-0.5">
                        <Briefcase size={10} />
                        {s.job_name}
                      </span>
                    )}
                    {s.note && (
                      <span className="text-xs text-slate-400 italic truncate max-w-[160px]">{s.note}</span>
                    )}
                  </div>
                </div>
                <span className="text-sm font-bold text-slate-700 flex-shrink-0 tabular-nums">
                  {fmtMinutes(s.duration_minutes)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {(status?.recentSessions?.length ?? 0) === 0 && !isActive && (
        <div className="text-center py-8 text-slate-400 text-sm">
          No usage sessions recorded yet.
        </div>
      )}
    </div>
  );
}
