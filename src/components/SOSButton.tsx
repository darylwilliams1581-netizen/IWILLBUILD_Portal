/**
 * SOSButton
 * ─────────────────────────────────────────────────────────────────────────────
 * Hold-to-confirm emergency beacon button.
 * - Hold for 2 seconds to trigger
 * - Plays audible alarm on the triggering device immediately
 * - Posts to /api/sos/trigger which fans out push notifications to all users
 * - Shows confirmation state after firing
 */
import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Siren, X, CheckCircle, Loader2 } from 'lucide-react';
import { createSOSAlarm } from '@/lib/sos-alarm';

interface SOSButtonProps {
  jobId?: number;
  onClose: () => void;
}

const HOLD_DURATION = 2000; // ms

export default function SOSButton({ jobId, onClose }: SOSButtonProps) {
  const [phase, setPhase] = useState<'idle' | 'holding' | 'firing' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0); // 0–100
  const [errorMsg, setErrorMsg] = useState('');

  const holdTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressRaf = useRef<number | null>(null);
  const startedAt   = useRef<number>(0);
  const alarmRef    = useRef(createSOSAlarm());

  const cancelHold = useCallback(() => {
    if (holdTimer.current)   clearTimeout(holdTimer.current);
    if (progressRaf.current) cancelAnimationFrame(progressRaf.current);
    holdTimer.current   = null;
    progressRaf.current = null;
    setPhase('idle');
    setProgress(0);
  }, []);

  const tickProgress = useCallback(() => {
    const elapsed = Date.now() - startedAt.current;
    const pct = Math.min((elapsed / HOLD_DURATION) * 100, 100);
    setProgress(pct);
    if (pct < 100) {
      progressRaf.current = requestAnimationFrame(tickProgress);
    }
  }, []);

  const startHold = useCallback(() => {
    if (phase !== 'idle') return;
    setPhase('holding');
    startedAt.current = Date.now();
    progressRaf.current = requestAnimationFrame(tickProgress);

    holdTimer.current = setTimeout(async () => {
      if (progressRaf.current) cancelAnimationFrame(progressRaf.current);
      setProgress(100);
      setPhase('firing');

      // Start alarm immediately on device
      alarmRef.current.start();

      // Get GPS if available
      let lat: number | undefined;
      let lng: number | undefined;
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 3000 })
        );
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      } catch {
        // GPS optional — proceed without it
      }

      try {
        const res = await fetch('/api/sos/trigger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId, lat, lng }),
        });
        if (!res.ok) throw new Error(await res.text());
        setPhase('done');
      } catch (err) {
        setPhase('error');
        setErrorMsg(String(err));
        alarmRef.current.stop();
      }
    }, HOLD_DURATION);
  }, [phase, tickProgress, jobId]);

  const stopAlarmAndClose = useCallback(() => {
    alarmRef.current.stop();
    onClose();
  }, [onClose]);

  return (
    <div className="flex flex-col items-center gap-5 px-2">

      {/* ── Idle / Holding ── */}
      {(phase === 'idle' || phase === 'holding') && (
        <>
          <p className="text-white/60 text-xs text-center leading-relaxed">
            Hold the button for 2 seconds to send an emergency alert to your entire team.
          </p>

          {/* Hold button */}
          <div className="relative flex items-center justify-center">
            {/* Progress ring */}
            <svg className="absolute" width={120} height={120} viewBox="0 0 120 120">
              <circle cx={60} cy={60} r={52} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={6} />
              <circle
                cx={60} cy={60} r={52}
                fill="none"
                stroke="#ef4444"
                strokeWidth={6}
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 52}`}
                strokeDashoffset={`${2 * Math.PI * 52 * (1 - progress / 100)}`}
                transform="rotate(-90 60 60)"
                style={{ transition: 'stroke-dashoffset 0.05s linear' }}
              />
            </svg>

            <motion.button
              onPointerDown={startHold}
              onPointerUp={cancelHold}
              onPointerLeave={cancelHold}
              onPointerCancel={cancelHold}
              whileTap={{ scale: 0.95 }}
              className="w-24 h-24 rounded-full bg-red-600 hover:bg-red-700 active:bg-red-800 flex flex-col items-center justify-center gap-1 select-none touch-none"
              style={{
                boxShadow: phase === 'holding'
                  ? '0 0 0 8px rgba(239,68,68,0.3), 0 0 0 16px rgba(239,68,68,0.15)'
                  : '0 0 0 4px rgba(239,68,68,0.2)',
                transition: 'box-shadow 0.15s ease',
                WebkitTapHighlightColor: 'transparent',
              } as React.CSSProperties}
              aria-label="Hold to trigger emergency SOS"
            >
              <Siren size={28} className="text-white" />
              <span className="text-white text-[10px] font-bold tracking-wide">
                {phase === 'holding' ? 'HOLD...' : 'SOS'}
              </span>
            </motion.button>
          </div>

          {phase === 'holding' && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-red-400 text-xs font-bold animate-pulse"
            >
              Keep holding…
            </motion.p>
          )}

          <button
            onClick={onClose}
            className="text-white/30 text-xs hover:text-white/60 transition-colors"
          >
            Cancel
          </button>
        </>
      )}

      {/* ── Firing ── */}
      {phase === 'firing' && (
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="w-16 h-16 rounded-full bg-red-600/20 flex items-center justify-center">
            <Loader2 size={28} className="text-red-400 animate-spin" />
          </div>
          <p className="text-white font-bold text-sm">Sending emergency alert…</p>
          <p className="text-white/40 text-xs text-center">Alarm active on your device</p>
        </div>
      )}

      {/* ── Done ── */}
      {phase === 'done' && (
        <div className="flex flex-col items-center gap-4 py-4">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="w-16 h-16 rounded-full bg-red-600/20 flex items-center justify-center"
          >
            <CheckCircle size={32} className="text-red-400" />
          </motion.div>
          <p className="text-white font-bold text-sm text-center">
            Emergency alert sent to your team
          </p>
          <p className="text-white/40 text-xs text-center leading-relaxed">
            All team members have been notified. Help is on the way.
          </p>
          <button
            onClick={stopAlarmAndClose}
            className="mt-2 flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold px-4 py-2.5 rounded-lg transition-colors"
          >
            <X size={13} />
            Stop alarm &amp; close
          </button>
        </div>
      )}

      {/* ── Error ── */}
      {phase === 'error' && (
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="w-16 h-16 rounded-full bg-amber-600/20 flex items-center justify-center">
            <Siren size={28} className="text-amber-400" />
          </div>
          <p className="text-white font-bold text-sm text-center">
            Alert sent but network error occurred
          </p>
          <p className="text-white/40 text-[11px] text-center leading-relaxed max-w-[220px]">
            {errorMsg || 'Could not reach server. Call emergency services directly if needed.'}
          </p>
          <button
            onClick={stopAlarmAndClose}
            className="mt-2 flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold px-4 py-2.5 rounded-lg transition-colors"
          >
            <X size={13} />
            Close
          </button>
        </div>
      )}
    </div>
  );
}
