/**
 * SOSAlertPopup
 * ─────────────────────────────────────────────────────────────────────────────
 * Polls /api/sos every 10 seconds for active alerts.
 * When a new active alert is found, shows a full-screen overlay popup on
 * every connected client with the triggering person's name.
 * User taps "Acknowledge" to dismiss — this marks the alert as acknowledged
 * on the server and removes the popup.
 *
 * Mount once in RootLayout (portal pages only — skip on public/marketing pages).
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Siren, X, Phone } from 'lucide-react';
import { createSOSAlarm } from '@/lib/sos-alarm';

interface SosAlert {
  id: number;
  triggered_by_name: string;
  job_id: number | null;
  lat: number | null;
  lng: number | null;
  status: string;
  created_at: string;
}

const POLL_INTERVAL = 10_000; // 10s

export default function SOSAlertPopup() {
  const [activeAlert, setActiveAlert] = useState<SosAlert | null>(null);
  const [acknowledging, setAcknowledging] = useState(false);
  const seenIds = useRef<Set<number>>(new Set());
  const alarmRef = useRef(createSOSAlarm());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch('/api/sos');
      if (!res.ok) return;
      const data = await res.json() as { alerts: SosAlert[] };
      const alerts: SosAlert[] = Array.isArray(data.alerts) ? data.alerts : [];

      // Find the most recent active alert we haven't seen yet
      const newAlert = alerts.find(
        (a) => a.status === 'active' && !seenIds.current.has(a.id)
      );

      if (newAlert) {
        seenIds.current.add(newAlert.id);
        setActiveAlert(newAlert);
        alarmRef.current.start();
      }
    } catch {
      // silent — network may be offline
    }
  }, []);

  useEffect(() => {
    // Only run on portal pages (not marketing/public)
    if (typeof window === 'undefined') return;
    if (!window.location.pathname.startsWith('/') ||
        window.location.pathname === '/' ||
        window.location.pathname.startsWith('/share/') ||
        window.location.pathname.startsWith('/external/')) return;

    fetchAlerts();
    pollRef.current = setInterval(fetchAlerts, POLL_INTERVAL);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      alarmRef.current.stop();
    };
  }, [fetchAlerts]);

  const acknowledge = useCallback(async () => {
    if (!activeAlert) return;
    setAcknowledging(true);
    alarmRef.current.stop();
    try {
      await fetch('/api/sos/acknowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alertId: activeAlert.id }),
      });
    } catch {
      // best-effort
    }
    setActiveAlert(null);
    setAcknowledging(false);
  }, [activeAlert]);

  const dismiss = useCallback(() => {
    alarmRef.current.stop();
    setActiveAlert(null);
  }, []);

  const timeAgo = (iso: string) => {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };

  return (
    <AnimatePresence>
      {activeAlert && (
        <>
          {/* Full-screen backdrop — pulsing red */}
          <motion.div
            key="sos-popup-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] pointer-events-none"
            style={{
              background: 'rgba(220, 38, 38, 0.15)',
              animation: 'sos-pulse 1s ease-in-out infinite alternate',
            }}
          />

          {/* Popup card */}
          <motion.div
            key="sos-popup-card"
            initial={{ scale: 0.8, opacity: 0, y: -40 }}
            animate={{ scale: 1,   opacity: 1, y: 0 }}
            exit={{   scale: 0.8, opacity: 0, y: -40 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="fixed inset-x-4 top-[max(env(safe-area-inset-top),16px)] z-[201] mx-auto max-w-sm"
            role="alertdialog"
            aria-modal="true"
            aria-label="Emergency SOS Alert"
          >
            <div className="bg-[#1A1D23] rounded-2xl shadow-2xl overflow-hidden border border-red-500/40">
              {/* Red header bar */}
              <div className="bg-red-600 px-4 py-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                  <Siren size={16} className="text-white" style={{ animation: 'sos-siren 0.5s ease-in-out infinite alternate' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold text-sm leading-tight">🚨 EMERGENCY SOS ACTIVATED</p>
                  <p className="text-red-200 text-[11px]">{timeAgo(activeAlert.created_at)}</p>
                </div>
                {/* Dismiss (not acknowledge — just hides popup locally) */}
                <button
                  onClick={dismiss}
                  className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-white/70 hover:text-white transition-colors shrink-0"
                  aria-label="Dismiss popup"
                >
                  <X size={13} />
                </button>
              </div>

              {/* Body */}
              <div className="px-4 py-4 flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center shrink-0">
                    <span className="text-red-400 font-bold text-sm">
                      {activeAlert.triggered_by_name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="text-white font-bold text-sm leading-tight">
                      {activeAlert.triggered_by_name}
                    </p>
                    <p className="text-white/50 text-xs">has activated an emergency beacon</p>
                  </div>
                </div>

                {activeAlert.lat && activeAlert.lng && (
                  <a
                    href={`https://maps.google.com/?q=${activeAlert.lat},${activeAlert.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white/70 hover:text-white hover:border-white/20 transition-colors"
                  >
                    <Phone size={11} className="shrink-0" />
                    View location on map
                  </a>
                )}

                <p className="text-white/40 text-[11px] leading-relaxed">
                  Check on this person immediately. Call emergency services (000) if needed.
                </p>

                {/* Acknowledge button */}
                <button
                  onClick={acknowledge}
                  disabled={acknowledging}
                  className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-sm font-bold px-4 py-3 rounded-xl transition-colors"
                  style={{ WebkitTapHighlightColor: 'transparent' } as React.CSSProperties}
                >
                  {acknowledging ? (
                    <>Acknowledging…</>
                  ) : (
                    <>I'm responding — Acknowledge</>
                  )}
                </button>
              </div>
            </div>
          </motion.div>

          {/* CSS for pulsing animations */}
          <style>{`
            @keyframes sos-pulse {
              from { opacity: 0.08; }
              to   { opacity: 0.22; }
            }
            @keyframes sos-siren {
              from { transform: rotate(-15deg); }
              to   { transform: rotate(15deg); }
            }
          `}</style>
        </>
      )}
    </AnimatePresence>
  );
}
