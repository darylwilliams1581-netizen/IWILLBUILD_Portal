/**
 * /fleet/:id/drive — Full-screen drive session history for a fleet asset.
 * Shows driver sessions with start/end times, duration, status.
 * Includes manual "Log Trip" button for admin entry.
 */
import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  ArrowLeft, Car, Loader2, Download,
  Clock, CheckCircle2, AlertCircle, Navigation,
  Plus, X, User, Calendar, AlarmClock, FileText,
} from 'lucide-react';

interface FleetAsset {
  id: number;
  name: string;
  type?: string | null;
  rego?: string | null;
}

interface DriverSession {
  id: number;
  user_id?: string | null;
  driver_name?: string | null;
  start_at: string | null;
  end_at: string | null;
  status: string;
  source?: string | null;
  notes?: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; icon: React.ElementType }> = {
  active:      { label: 'Active',      bg: 'bg-blue-100',    text: 'text-blue-700',    icon: Navigation },
  completed:   { label: 'Completed',   bg: 'bg-emerald-100', text: 'text-emerald-700', icon: CheckCircle2 },
  auto_closed: { label: 'Auto-closed', bg: 'bg-gray-100',    text: 'text-gray-500',    icon: AlertCircle },
  manual:      { label: 'Manual',      bg: 'bg-purple-100',  text: 'text-purple-700',  icon: FileText },
};

function statusCfg(status: string) {
  return STATUS_CONFIG[status] ?? { label: status, bg: 'bg-gray-100', text: 'text-gray-500', icon: AlertCircle };
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });
}

function fmtDuration(start: string | null, end: string | null): string {
  if (!start) return '—';
  const endMs = end ? new Date(end).getTime() : Date.now();
  const mins = Math.round((endMs - new Date(start).getTime()) / 60000);
  if (mins < 1) return '0m';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ── Log Trip Sheet ────────────────────────────────────────────────────────────

interface LogTripSheetProps {
  assetId: string;
  assetName: string;
  onClose: () => void;
  onSaved: () => void;
}

function toLocalDatetimeValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function LogTripSheet({ assetId, assetName, onClose, onSaved }: LogTripSheetProps) {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 3600000);

  const [driverName, setDriverName] = useState('');
  const [startAt, setStartAt]       = useState(toLocalDatetimeValue(oneHourAgo));
  const [endAt, setEndAt]           = useState(toLocalDatetimeValue(now));
  const [notes, setNotes]           = useState('');
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');
  const [done, setDone]             = useState(false);

  async function handleSave() {
    if (!driverName.trim()) { setError('Driver name is required'); return; }
    if (!startAt)           { setError('Start time is required'); return; }
    if (endAt && new Date(endAt) <= new Date(startAt)) {
      setError('End time must be after start time'); return;
    }
    setSaving(true); setError('');
    try {
      const res = await fetch(`/api/fleet/${assetId}/driver-sessions/manual`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driverName: driverName.trim(),
          startAt: new Date(startAt).toISOString(),
          endAt: endAt ? new Date(endAt).toISOString() : null,
          notes: notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        setError(d.error ?? 'Failed to save trip');
        return;
      }
      setDone(true);
      setTimeout(() => { onSaved(); onClose(); }, 1200);
    } catch {
      setError('Network error — please try again');
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/60 flex items-end md:items-center md:justify-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="w-full md:max-w-md bg-white rounded-t-3xl md:rounded-3xl border border-gray-200 flex flex-col overflow-hidden"
        style={{ maxHeight: '92vh', boxShadow: '0 -4px 32px rgba(0,0,0,0.14)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 md:hidden shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center">
              <Car size={16} className="text-blue-600" />
            </div>
            <div>
              <h2 className="text-gray-900 font-bold text-base leading-tight">Log Trip</h2>
              <p className="text-gray-400 text-xs">{assetName}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors">
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        {done ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 px-5 py-12">
            <div className="w-16 h-16 rounded-full bg-emerald-100 border border-emerald-200 flex items-center justify-center">
              <CheckCircle2 size={32} className="text-emerald-500" />
            </div>
            <p className="text-gray-900 font-bold text-lg">Trip logged!</p>
            <p className="text-gray-400 text-sm">Session has been recorded.</p>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

              {/* Driver name */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
                  <span className="flex items-center gap-1.5"><User size={11} /> Driver Name <span className="text-red-500">*</span></span>
                </label>
                <input
                  type="text"
                  value={driverName}
                  onChange={e => setDriverName(e.target.value)}
                  placeholder="e.g. Daryl Williams"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-blue-400 transition-colors"
                />
              </div>

              {/* Start time */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
                  <span className="flex items-center gap-1.5"><Calendar size={11} /> Start Time <span className="text-red-500">*</span></span>
                </label>
                <input
                  type="datetime-local"
                  value={startAt}
                  onChange={e => setStartAt(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 text-sm focus:outline-none focus:border-blue-400 transition-colors"
                />
              </div>

              {/* End time */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
                  <span className="flex items-center gap-1.5"><AlarmClock size={11} /> End Time <span className="text-gray-400 font-normal">(optional)</span></span>
                </label>
                <input
                  type="datetime-local"
                  value={endAt}
                  onChange={e => setEndAt(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 text-sm focus:outline-none focus:border-blue-400 transition-colors"
                />
                {startAt && endAt && new Date(endAt) > new Date(startAt) && (
                  <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">
                    <Clock size={10} />
                    Duration: {fmtDuration(new Date(startAt).toISOString(), new Date(endAt).toISOString())}
                  </p>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
                  <span className="flex items-center gap-1.5"><FileText size={11} /> Notes <span className="text-gray-400 font-normal">(optional)</span></span>
                </label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Any notes about this trip…"
                  rows={2}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-blue-400 resize-none transition-colors"
                />
              </div>

              {/* Error */}
              <AnimatePresence>
                {error && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                    <AlertCircle size={14} className="text-red-500 shrink-0" />
                    <p className="text-red-600 text-sm flex-1">{error}</p>
                    <button onClick={() => setError('')} className="text-red-400 hover:text-red-600"><X size={13} /></button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div className="px-5 pb-8 pt-3 border-t border-gray-100 shrink-0">
              <button
                onClick={() => void handleSave()}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2.5 bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white font-bold py-4 rounded-2xl transition-colors shadow-md shadow-blue-200 disabled:opacity-60"
              >
                {saving ? <Loader2 size={18} className="animate-spin" /> : <Car size={18} />}
                {saving ? 'Saving…' : 'Save Trip'}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function FleetDrivePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [asset, setAsset]       = useState<FleetAsset | null>(null);
  const [sessions, setSessions] = useState<DriverSession[]>([]);
  const [loading, setLoading]   = useState(true);
  const [exporting, setExporting] = useState(false);
  const [showLogTrip, setShowLogTrip] = useState(false);

  const loadData = () => {
    if (!id) { setLoading(false); return; }
    Promise.all([
      fetch(`/api/fleet/${id}`, { credentials: 'include' })
        .then(r => r.json() as Promise<{ asset?: FleetAsset } | FleetAsset>)
        .then(data => {
          const a = data && typeof data === 'object' && 'asset' in data ? data.asset : data as FleetAsset;
          setAsset(a ?? null);
        }),
      fetch(`/api/fleet/${id}/driver-sessions`, { credentials: 'include' })
        .then(r => r.json() as Promise<{ sessions: DriverSession[] }>)
        .then(data => setSessions(data.sessions ?? [])),
    ])
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/fleet/${id}/usage-export`, { credentials: 'include' });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `fleet-${id}-drive.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch { /* silent */ } finally { setExporting(false); }
  };

  const activeSession = sessions.find(s => s.status === 'active');
  const assetLabel = asset ? `${asset.name}${asset.rego ? ` (${asset.rego})` : ''}` : `Asset #${id}`;
  const title = asset ? `${assetLabel} — Drive Log` : 'Drive Log';

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Helmet>
        <title>{title} — IWILLBUILD</title>
        <meta name="description" content="View drive session history for this fleet asset." />
        <meta name="robots" content="noindex, nofollow" />
        <link rel="canonical" href={`https://iwillbuild.com/fleet/${id}/drive`} />
      </Helmet>

      {/* ── Desktop top bar ── */}
      <div className="hidden md:flex bg-white border-b border-gray-100 px-4 py-3 items-center gap-3 shrink-0" style={{ boxShadow: '0 1px 0 rgba(0,0,0,0.05)' }}>
        <button onClick={() => navigate('/home')} className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-gray-200 transition-colors shrink-0">
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
            <Car size={15} className="text-blue-600" />
          </div>
          <div className="min-w-0">
            {loading ? <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" /> : (
              <>
                <h1 className="text-gray-900 font-bold text-sm leading-tight truncate">{asset?.name ?? 'Fleet Asset'}</h1>
                {asset?.rego && <p className="text-gray-400 text-xs font-mono leading-tight">{asset.rego}{asset.type ? ` · ${asset.type}` : ''}</p>}
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowLogTrip(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold rounded-lg transition-colors shadow-sm shadow-blue-200"
          >
            <Plus size={13} /> Log Trip
          </button>
          <button onClick={exportCsv} disabled={exporting} className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 text-xs font-semibold text-gray-600 rounded-lg transition-colors">
            {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            Export CSV
          </button>
        </div>
      </div>

      {/* ── Mobile: back arrow ── */}
      <button onClick={() => navigate('/home')} className="md:hidden fixed top-3 left-3 z-20 w-9 h-9 rounded-xl bg-white/90 backdrop-blur-sm shadow-sm border border-gray-100 flex items-center justify-center text-gray-600 active:bg-gray-100 transition-colors" aria-label="Back">
        <ArrowLeft size={18} />
      </button>

      {/* ── Mobile: export top-right ── */}
      <button onClick={exportCsv} disabled={exporting} className="md:hidden fixed top-3 right-3 z-20 h-9 px-3 rounded-xl bg-white/90 backdrop-blur-sm shadow-sm border border-gray-100 flex items-center gap-1.5 text-xs font-semibold text-gray-600 active:bg-gray-100 disabled:opacity-40 transition-colors">
        {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
        CSV
      </button>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-blue-400" />
          </div>
        ) : (
          <div className="px-4 py-4 pb-32 md:pb-6 max-w-3xl mx-auto w-full space-y-4">

            {/* Active session banner */}
            {activeSession && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3.5 flex items-center gap-3"
              >
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-blue-700 font-bold text-sm">Currently in use</p>
                  <p className="text-blue-500 text-xs">
                    {activeSession.driver_name ?? 'Unknown driver'} · started {fmtDateTime(activeSession.start_at)} · {fmtDuration(activeSession.start_at, null)} elapsed
                  </p>
                </div>
                <Navigation size={16} className="text-blue-500 shrink-0" />
              </motion.div>
            )}

            {/* Summary */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Total Trips', value: sessions.length,                                    color: 'text-gray-900' },
                { label: 'Completed',   value: sessions.filter(s => s.status === 'completed').length, color: 'text-emerald-600' },
                { label: 'Active',      value: sessions.filter(s => s.status === 'active').length,    color: 'text-blue-600' },
              ].map(c => (
                <div key={c.label} className="bg-white rounded-2xl border border-gray-100 px-3 py-3 text-center" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                  <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
                  <p className="text-gray-400 text-xs mt-0.5">{c.label}</p>
                </div>
              ))}
            </div>

            {/* Session list */}
            {sessions.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 px-6 py-12 text-center" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3">
                  <Car size={22} className="text-blue-400" />
                </div>
                <p className="text-gray-700 font-semibold text-sm">No drive sessions yet</p>
                <p className="text-gray-400 text-xs mt-1">Sessions are recorded when a driver signs in via the Drive screen</p>
                <button
                  onClick={() => setShowLogTrip(true)}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-bold rounded-xl transition-colors"
                >
                  <Plus size={15} /> Log a trip manually
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {sessions.map((s, i) => {
                  const cfg = statusCfg(s.status);
                  const StatusIcon = cfg.icon;
                  return (
                    <motion.div
                      key={s.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.025 }}
                      className="bg-white rounded-2xl border border-gray-100 px-4 py-3.5 flex items-center gap-3"
                      style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
                    >
                      <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                        <Car size={16} className="text-blue-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <p className="text-gray-900 font-semibold text-sm truncate">
                            {s.driver_name ?? 'Unknown driver'}
                          </p>
                          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${cfg.bg} ${cfg.text}`}>
                            <StatusIcon size={9} />
                            {cfg.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-400 text-xs flex-wrap">
                          <Clock size={10} />
                          <span>{fmtDateTime(s.start_at)}</span>
                          {s.end_at && <><span>→</span><span>{fmtDateTime(s.end_at)}</span></>}
                          <span className="font-medium text-gray-500">{fmtDuration(s.start_at, s.end_at)}</span>
                        </div>
                        {s.notes && (
                          <p className="text-gray-400 text-xs mt-0.5 truncate italic">{s.notes}</p>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Mobile bottom bar with Log Trip button ── */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-10 bg-white border-t border-gray-100" style={{ boxShadow: '0 -1px 0 rgba(0,0,0,0.05)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
            <Car size={15} className="text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            {loading ? <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" /> : (
              <>
                <p className="text-gray-900 font-bold text-sm leading-tight truncate">{asset?.name ?? 'Fleet Asset'}</p>
                {asset?.rego && <p className="text-gray-400 text-xs font-mono leading-tight">{asset.rego}</p>}
              </>
            )}
          </div>
          <button
            onClick={() => setShowLogTrip(true)}
            className="flex items-center gap-1.5 bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white font-bold text-sm px-4 py-2.5 rounded-xl transition-colors shadow-sm shadow-blue-200"
          >
            <Plus size={15} /> Log Trip
          </button>
        </div>
      </div>

      {/* ── Log Trip Sheet ── */}
      <AnimatePresence>
        {showLogTrip && id && asset && (
          <LogTripSheet
            assetId={id}
            assetName={asset.name}
            onClose={() => setShowLogTrip(false)}
            onSaved={() => { setLoading(true); loadData(); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
