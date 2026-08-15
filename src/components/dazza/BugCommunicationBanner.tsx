/**
 * BugCommunicationBanner
 * ─────────────────────────────────────────────────────────────────────────────
 * Polls for active incident communications relevant to the signed-in user.
 * Renders:
 *   - A dismissible banner for type='banner'
 *   - A temporary popup for type='popup' (auto-fades after 6s)
 *   - A blocking modal for type='modal' (is_critical=true)
 *   - A green resolved notification for type='resolved'
 *
 * Mounted once in ShellRouter — renders nothing when no active comms.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { X, AlertTriangle, CheckCircle2, Info, Wrench, Phone, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export interface ActiveComm {
  id: string;
  incident_id: string | null;
  comm_type: 'banner' | 'popup' | 'modal' | 'resolved' | 'acknowledgement';
  status: string;
  title: string;
  message: string;
  workaround: string | null;
  action_label: string | null;
  action_url: string | null;
  is_dismissible: boolean;
  is_critical: boolean;
  incident_title: string | null;
  incident_severity: string | null;
  incident_status: string | null;
}

const POLL_INTERVAL = 60_000; // 1 min

function useCommunications(appVersion?: string) {
  const [comms, setComms] = useState<ActiveComm[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const params = appVersion ? `?build=${encodeURIComponent(appVersion)}` : '';
      const res = await fetch(`/api/dazza/v3/communications${params}`, { credentials: 'include' });
      if (!res.ok) return;
      const d = await res.json() as { communications?: ActiveComm[] };
      setComms(d.communications ?? []);
    } catch { /* ignore */ }
  }, [appVersion]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), POLL_INTERVAL);
    return () => clearInterval(t);
  }, [load]);

  const dismiss = useCallback(async (id: string) => {
    setDismissed(prev => new Set([...prev, id]));
    try {
      await fetch(`/api/dazza/v3/communications/${id}/dismiss`, {
        method: 'POST', credentials: 'include',
      });
    } catch { /* ignore */ }
  }, []);

  const stillHavingTrouble = useCallback(async (id: string) => {
    try {
      await fetch(`/api/dazza/v3/communications/${id}/still-having-trouble`, {
        method: 'POST', credentials: 'include',
      });
    } catch { /* ignore */ }
    setDismissed(prev => new Set([...prev, id]));
  }, []);

  const visible = comms.filter(c => !dismissed.has(c.id));
  return { visible, dismiss, stillHavingTrouble, reload: load };
}

// ── Severity colour ──────────────────────────────────────────────────────────
function severityColor(sev: string | null): string {
  if (sev === 'critical') return 'border-red-400 bg-red-50';
  if (sev === 'high') return 'border-orange-400 bg-orange-50';
  return 'border-amber-400 bg-amber-50';
}

// ── Banner ───────────────────────────────────────────────────────────────────
function Banner({ comm, onDismiss, onStillTrouble }: {
  comm: ActiveComm;
  onDismiss: (id: string) => void;
  onStillTrouble: (id: string) => void;
}) {
  const [showWorkaround, setShowWorkaround] = useState(false);
  const [confirmedResolved, setConfirmedResolved] = useState(false);
  const isResolved = comm.comm_type === 'resolved';

  if (confirmedResolved) return null;

  const borderColor = isResolved
    ? 'border-emerald-400 bg-emerald-50'
    : severityColor(comm.incident_severity);

  const Icon = isResolved ? CheckCircle2 : AlertTriangle;
  const iconColor = isResolved ? 'text-emerald-600' : 'text-amber-600';

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25 }}
      className={`w-full border-l-4 rounded-xl px-4 py-3 flex items-start gap-3 shadow-sm ${borderColor}`}
    >
      <Icon size={16} className={`${iconColor} mt-0.5 flex-shrink-0`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800">{comm.title}</p>
        <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{comm.message}</p>

        {comm.workaround && (
          <div className="mt-2">
            <button
              onClick={() => setShowWorkaround(v => !v)}
              className="text-xs text-violet-600 font-semibold flex items-center gap-1 hover:underline"
            >
              <Wrench size={11} /> {showWorkaround ? 'Hide workaround' : 'View workaround'}
            </button>
            {showWorkaround && (
              <p className="text-xs text-slate-700 mt-1 bg-white/70 rounded-lg px-3 py-2 border border-slate-200">
                {comm.workaround}
              </p>
            )}
          </div>
        )}

        {isResolved && (
          <div className="flex items-center gap-3 mt-2">
            <button
              onClick={() => setConfirmedResolved(true)}
              className="text-xs font-semibold text-emerald-700 hover:underline"
            >
              Working now
            </button>
            <button
              onClick={() => onStillTrouble(comm.id)}
              className="text-xs font-semibold text-red-600 hover:underline"
            >
              Still having trouble
            </button>
          </div>
        )}

        {comm.action_label && comm.action_url && (
          <a
            href={comm.action_url}
            className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-violet-600 hover:underline"
          >
            {comm.action_label} <ChevronRight size={11} />
          </a>
        )}

        {comm.incident_id && (
          <p className="text-[10px] text-slate-400 mt-1">
            {comm.incident_title ? `${comm.incident_title} · ` : ''}
            {comm.incident_status ?? 'Investigating'}
          </p>
        )}
      </div>

      {comm.is_dismissible && (
        <button
          onClick={() => onDismiss(comm.id)}
          className="flex-shrink-0 p-1 rounded-lg hover:bg-black/10 text-slate-400 hover:text-slate-600 transition-colors"
          aria-label="Dismiss"
        >
          <X size={14} />
        </button>
      )}
    </motion.div>
  );
}

// ── Popup (auto-fade) ────────────────────────────────────────────────────────
function Popup({ comm, onDismiss }: { comm: ActiveComm; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(comm.id), 6000);
    return () => clearTimeout(t);
  }, [comm.id, onDismiss]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ duration: 0.3 }}
      className="fixed bottom-24 right-4 z-50 max-w-sm w-full bg-white border border-slate-200 rounded-2xl shadow-xl p-4 flex items-start gap-3"
    >
      <Info size={16} className="text-violet-500 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800">{comm.title}</p>
        <p className="text-xs text-slate-600 mt-0.5">{comm.message}</p>
      </div>
      <button onClick={() => onDismiss(comm.id)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
        <X size={13} />
      </button>
    </motion.div>
  );
}

// ── Critical Modal ───────────────────────────────────────────────────────────
function CriticalModal({ comm, onDismiss, onStillTrouble }: {
  comm: ActiveComm;
  onDismiss: (id: string) => void;
  onStillTrouble: (id: string) => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [showWorkaround, setShowWorkaround] = useState(false);

  if (acknowledged) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
      >
        <div className="bg-gradient-to-r from-red-600 to-orange-600 px-5 py-4">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className="text-white" />
            <h2 className="text-sm font-bold text-white">Important</h2>
          </div>
        </div>
        <div className="p-5">
          <h3 className="text-base font-bold text-slate-800 mb-2">{comm.title}</h3>
          <p className="text-sm text-slate-600 leading-relaxed">{comm.message}</p>

          {comm.workaround && (
            <div className="mt-3">
              <button
                onClick={() => setShowWorkaround(v => !v)}
                className="text-xs text-violet-600 font-semibold flex items-center gap-1 hover:underline"
              >
                <Wrench size={11} /> {showWorkaround ? 'Hide workaround' : 'View workaround'}
              </button>
              {showWorkaround && (
                <p className="text-xs text-slate-700 mt-2 bg-amber-50 rounded-xl px-3 py-2 border border-amber-200">
                  {comm.workaround}
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2 mt-5">
            <button
              onClick={() => setAcknowledged(true)}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-sm font-bold transition-colors"
            >
              I understand
            </button>
            {comm.workaround && (
              <button
                onClick={() => { setShowWorkaround(true); }}
                className="w-full py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold transition-colors"
              >
                View workaround
              </button>
            )}
            <a
              href="mailto:support@iwillbuild.com"
              className="w-full py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 text-sm font-semibold transition-colors text-center flex items-center justify-center gap-1.5"
            >
              <Phone size={13} /> Contact support
            </a>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ── Main export ──────────────────────────────────────────────────────────────
export default function BugCommunicationBanner({ appVersion }: { appVersion?: string }) {
  const { visible, dismiss, stillHavingTrouble } = useCommunications(appVersion);

  const banners = visible.filter(c => c.comm_type === 'banner' || c.comm_type === 'resolved');
  const popups = visible.filter(c => c.comm_type === 'popup');
  const modals = visible.filter(c => c.comm_type === 'modal' && c.is_critical);

  if (!visible.length) return null;

  return (
    <>
      {/* Banners — inline in dashboard flow */}
      {banners.length > 0 && (
        <div className="flex flex-col gap-2 px-4 pt-2 pb-0">
          <AnimatePresence>
            {banners.map(c => (
              <Banner key={c.id} comm={c} onDismiss={dismiss} onStillTrouble={stillHavingTrouble} />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Popups — fixed bottom-right */}
      <AnimatePresence>
        {popups.map(c => (
          <Popup key={c.id} comm={c} onDismiss={dismiss} />
        ))}
      </AnimatePresence>

      {/* Critical modals — blocking */}
      <AnimatePresence>
        {modals.slice(0, 1).map(c => (
          <CriticalModal key={c.id} comm={c} onDismiss={dismiss} onStillTrouble={stillHavingTrouble} />
        ))}
      </AnimatePresence>
    </>
  );
}
