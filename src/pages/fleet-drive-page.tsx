/**
 * /fleet/:id/drive — Full-screen drive session history for a fleet asset.
 * Shows driver sessions with start/end times, duration, status.
 * Blue theme to match the Drive icon tile.
 */
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  ArrowLeft, Car, Loader2, Download,
  Clock, CheckCircle2, AlertCircle, Navigation,
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
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; icon: React.ElementType }> = {
  active:      { label: 'Active',      bg: 'bg-blue-100',    text: 'text-blue-700',    icon: Navigation },
  completed:   { label: 'Completed',   bg: 'bg-emerald-100', text: 'text-emerald-700', icon: CheckCircle2 },
  auto_closed: { label: 'Auto-closed', bg: 'bg-gray-100',    text: 'text-gray-500',    icon: AlertCircle },
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
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function FleetDrivePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [asset, setAsset] = useState<FleetAsset | null>(null);
  const [sessions, setSessions] = useState<DriverSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
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
  }, [id]);

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
        <button onClick={exportCsv} disabled={exporting} className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 text-xs font-semibold text-gray-600 rounded-lg transition-colors">
          {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
          Export CSV
        </button>
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
          <div className="px-4 py-4 pb-24 md:pb-6 max-w-3xl mx-auto w-full space-y-4">

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
                { label: 'Total Trips', value: sessions.length, color: 'text-gray-900' },
                { label: 'Completed', value: sessions.filter(s => s.status === 'completed').length, color: 'text-emerald-600' },
                { label: 'Active', value: sessions.filter(s => s.status === 'active').length, color: 'text-blue-600' },
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
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-gray-900 font-semibold text-sm truncate">
                            {s.driver_name ?? 'Unknown driver'}
                          </p>
                          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${cfg.bg} ${cfg.text}`}>
                            <StatusIcon size={9} />
                            {cfg.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-400 text-xs">
                          <Clock size={10} />
                          <span>{fmtDateTime(s.start_at)}</span>
                          {s.end_at && <span>→ {fmtDateTime(s.end_at)}</span>}
                          <span className="font-medium text-gray-500">{fmtDuration(s.start_at, s.end_at)}</span>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Mobile bottom bar ── */}
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
          <span className="text-gray-400 text-xs">{sessions.length} session{sessions.length !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </div>
  );
}
