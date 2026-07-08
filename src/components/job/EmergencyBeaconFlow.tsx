/**
 * EmergencyBeaconFlow
 *
 * Two-step modal flow for triggering an emergency alert.
 *
 * Step 1 — Confirmation gate:
 *   "This is an emergency. Are you sure you want to alert the team?"
 *   Buttons: Cancel | Continue
 *
 * Step 2 — Reason + note + hold-to-confirm:
 *   - Select reason (required)
 *   - Optional note (100 chars max)
 *   - Location capture (blocks send if denied)
 *   - Hold-to-confirm button (3-second press-and-hold)
 *
 * On success: calls onSent(alert) and shows confirmation banner.
 * On offline: queues locally, calls onQueued().
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  AlertTriangle, X, MapPin, MapPinOff, Loader2,
  CheckCircle2, WifiOff, ChevronRight,
} from 'lucide-react';
import {
  EMERGENCY_REASONS,
  type EmergencyReason,
  type EmergencyAlert,
  type EmergencyAlertPayload,
} from './emergency-types';

interface Props {
  jobId: number;
  onClose: () => void;
  onSent: (alert: EmergencyAlert) => void;
  onQueued?: () => void;
}

type Step = 'confirm1' | 'confirm2' | 'sending' | 'success' | 'queued';

interface LocationState {
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
  denied: boolean;
  loading: boolean;
  error: string | null;
}

const HOLD_DURATION_MS = 3_000;

// ── Hold-to-confirm button ────────────────────────────────────────────────────

interface HoldButtonProps {
  onConfirmed: () => void;
  disabled?: boolean;
  label?: string;
}

function HoldButton({ onConfirmed, disabled, label = 'Hold to Send Emergency Alert' }: HoldButtonProps) {
  const [progress, setProgress] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef    = useRef<number | null>(null);
  const confirmedRef = useRef(false);

  function startHold() {
    if (disabled || confirmedRef.current) return;
    startRef.current = Date.now();
    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - (startRef.current ?? Date.now());
      const pct = Math.min((elapsed / HOLD_DURATION_MS) * 100, 100);
      setProgress(pct);
      if (pct >= 100 && !confirmedRef.current) {
        confirmedRef.current = true;
        clearInterval(intervalRef.current!);
        onConfirmed();
      }
    }, 30);
  }

  function endHold() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (!confirmedRef.current) setProgress(0);
  }

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  const isHolding = progress > 0 && progress < 100;

  return (
    <div className="relative overflow-hidden rounded-xl select-none">
      {/* Progress fill */}
      <div
        className="absolute inset-0 bg-red-700 transition-none rounded-xl"
        style={{ width: `${progress}%` }}
      />
      <button
        onMouseDown={startHold}
        onMouseUp={endHold}
        onMouseLeave={endHold}
        onTouchStart={startHold}
        onTouchEnd={endHold}
        disabled={disabled}
        className={`relative w-full flex items-center justify-center gap-2 px-5 py-4 rounded-xl text-sm font-black text-white transition-colors ${
          disabled
            ? 'bg-slate-300 cursor-not-allowed'
            : isHolding
            ? 'bg-red-600'
            : 'bg-red-600 hover:bg-red-700 active:bg-red-800 cursor-pointer'
        }`}
        style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
      >
        <AlertTriangle size={16} className="shrink-0" />
        <span>
          {isHolding
            ? `Hold… ${Math.round((progress / 100) * (HOLD_DURATION_MS / 1000))}s`
            : label}
        </span>
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function EmergencyBeaconFlow({ jobId, onClose, onSent, onQueued }: Props) {
  const [step,   setStep]   = useState<Step>('confirm1');
  const [reason, setReason] = useState<EmergencyReason | ''>('');
  const [note,   setNote]   = useState('');
  const [error,  setError]  = useState('');

  const [location, setLocation] = useState<LocationState>({
    lat: null, lng: null, accuracyM: null,
    denied: false, loading: false, error: null,
  });

  // Capture location when entering step 2
  useEffect(() => {
    if (step !== 'confirm2') return;
    if (!('geolocation' in navigator)) {
      setLocation((l) => ({ ...l, denied: true, error: 'Geolocation is not supported on this device.' }));
      return;
    }
    setLocation((l) => ({ ...l, loading: true, error: null }));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: pos.coords.accuracy ?? null,
          denied: false,
          loading: false,
          error: null,
        });
      },
      (err) => {
        const denied = err.code === err.PERMISSION_DENIED;
        setLocation({
          lat: null, lng: null, accuracyM: null,
          denied,
          loading: false,
          error: denied
            ? 'Location permission denied. Enable location access in your browser settings before sending an emergency alert.'
            : 'Unable to get your location. Please try again.',
        });
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  }, [step]);

  const handleSend = useCallback(async () => {
    if (!reason) { setError('Please select a reason before sending.'); return; }
    if (location.denied) { setError('Location permission is required to send an emergency alert.'); return; }
    if (location.loading) { setError('Waiting for location — please try again in a moment.'); return; }

    setStep('sending');
    setError('');

    const payload: EmergencyAlertPayload = {
      jobId,
      reason: reason as EmergencyReason,
      note: note.trim() || undefined,
      lat:              location.lat    ?? undefined,
      lng:              location.lng    ?? undefined,
      locationAccuracyM: location.accuracyM ?? undefined,
      locationDenied:   location.denied,
    };

    // Offline path — queue locally
    if (!navigator.onLine) {
      const queued: EmergencyAlertPayload = { ...payload, offlineQueued: true };
      const existing = JSON.parse(localStorage.getItem('offline_queue_emergency-alerts') ?? '[]') as unknown[];
      existing.push({ id: crypto.randomUUID(), payload: queued, queuedAt: new Date().toISOString(), attempts: 0 });
      localStorage.setItem('offline_queue_emergency-alerts', JSON.stringify(existing));
      setStep('queued');
      onQueued?.();
      return;
    }

    try {
      const res = await fetch('/api/emergency-alerts', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? 'Failed to send alert');
      }

      const data = await res.json() as { ok: boolean; alert: EmergencyAlert };
      setStep('success');
      // Notify parent after a brief success display
      setTimeout(() => { onSent(data.alert); }, 2_000);
    } catch (err) {
      setStep('confirm2');
      setError(err instanceof Error ? err.message : 'Failed to send alert. Please try again.');
    }
  }, [reason, note, location, jobId, onSent, onQueued]);

  // ── Backdrop + modal wrapper ──────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={step === 'confirm1' ? onClose : undefined}
      />

      <AnimatePresence mode="wait">
        {/* ── Step 1: First confirmation ─────────────────────────────────── */}
        {step === 'confirm1' && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -8 }}
            transition={{ duration: 0.18 }}
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
          >
            {/* Red header stripe */}
            <div className="bg-red-600 px-6 py-5 flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0 mt-0.5">
                <AlertTriangle size={20} className="text-white" />
              </div>
              <div>
                <h2 className="font-heading font-black text-white text-lg leading-tight">
                  Emergency Alert
                </h2>
                <p className="text-red-100 text-sm mt-0.5">This will notify your entire team immediately.</p>
              </div>
              <button
                onClick={onClose}
                className="ml-auto p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors shrink-0"
              >
                <X size={16} />
              </button>
            </div>

            <div className="px-6 py-5">
              <p className="text-slate-700 text-sm leading-relaxed">
                This is an emergency. Are you sure you want to alert the team?
              </p>
              <p className="text-slate-500 text-xs mt-2 leading-relaxed">
                Only use this for genuine on-site emergencies. All alerts are logged with your name, time, and location.
              </p>
            </div>

            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-3 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => setStep('confirm2')}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-red-600 text-white text-sm font-black hover:bg-red-700 transition-colors"
              >
                Continue
                <ChevronRight size={15} />
              </button>
            </div>
          </motion.div>
        )}

        {/* ── Step 2: Reason + note + hold-to-confirm ───────────────────── */}
        {step === 'confirm2' && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -8 }}
            transition={{ duration: 0.18 }}
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
                  <AlertTriangle size={15} className="text-red-600" />
                </div>
                <div>
                  <h3 className="font-heading font-black text-sm text-slate-800">Emergency Details</h3>
                  <p className="text-xs text-slate-400">Step 2 of 2</p>
                </div>
              </div>
              <button
                onClick={() => setStep('confirm1')}
                className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X size={15} />
              </button>
            </div>

            <div className="px-5 py-4 flex flex-col gap-4">
              {/* Reason selector */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-2">
                  What is the emergency? <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {EMERGENCY_REASONS.map((r) => (
                    <button
                      key={r.value}
                      onClick={() => { setReason(r.value); setError(''); }}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-semibold text-left transition-all ${
                        reason === r.value
                          ? 'border-red-500 bg-red-50 text-red-700 ring-2 ring-red-200'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <span className="text-base leading-none">{r.emoji}</span>
                      <span className="text-xs leading-tight">{r.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Optional note */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">
                  Additional details <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value.slice(0, 100))}
                  placeholder="e.g. Worker down near scaffold, north side of building"
                  rows={2}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400 placeholder:text-slate-300"
                />
                <p className="text-right text-xs text-slate-400 mt-0.5">{note.length}/100</p>
              </div>

              {/* Location status */}
              <div className={`flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-xs ${
                location.loading
                  ? 'bg-blue-50 border border-blue-200 text-blue-700'
                  : location.denied || location.error
                  ? 'bg-red-50 border border-red-200 text-red-700'
                  : location.lat !== null
                  ? 'bg-green-50 border border-green-200 text-green-700'
                  : 'bg-slate-50 border border-slate-200 text-slate-500'
              }`}>
                {location.loading ? (
                  <><Loader2 size={13} className="animate-spin shrink-0 mt-0.5" /><span>Getting your location…</span></>
                ) : location.denied || location.error ? (
                  <><MapPinOff size={13} className="shrink-0 mt-0.5" /><span>{location.error}</span></>
                ) : location.lat !== null ? (
                  <><MapPin size={13} className="shrink-0 mt-0.5" /><span>Location captured (±{Math.round(location.accuracyM ?? 0)}m accuracy)</span></>
                ) : (
                  <><MapPin size={13} className="shrink-0 mt-0.5" /><span>Location not yet captured</span></>
                )}
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-xs text-red-700">
                  <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Hold-to-confirm */}
              <div>
                <p className="text-xs text-slate-400 text-center mb-2">
                  Press and hold for 3 seconds to send
                </p>
                <HoldButton
                  onConfirmed={handleSend}
                  disabled={!reason || location.denied || location.loading}
                />
                {!reason && (
                  <p className="text-xs text-slate-400 text-center mt-1.5">Select a reason above to enable</p>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Sending spinner ────────────────────────────────────────────── */}
        {step === 'sending' && (
          <motion.div
            key="sending"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xs p-8 flex flex-col items-center gap-4"
          >
            <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center">
              <Loader2 size={24} className="animate-spin text-red-600" />
            </div>
            <div className="text-center">
              <p className="font-heading font-black text-slate-800">Sending Alert…</p>
              <p className="text-sm text-slate-500 mt-1">Notifying your team now.</p>
            </div>
          </motion.div>
        )}

        {/* ── Success ────────────────────────────────────────────────────── */}
        {step === 'success' && (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xs p-8 flex flex-col items-center gap-4"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center"
            >
              <CheckCircle2 size={28} className="text-green-600" />
            </motion.div>
            <div className="text-center">
              <p className="font-heading font-black text-slate-800 text-lg">Alert Sent</p>
              <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                Emergency alert sent. Team has been notified.
              </p>
            </div>
          </motion.div>
        )}

        {/* ── Queued offline ─────────────────────────────────────────────── */}
        {step === 'queued' && (
          <motion.div
            key="queued"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
          >
            <div className="bg-amber-500 px-6 py-5 flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                <WifiOff size={20} className="text-white" />
              </div>
              <div>
                <h2 className="font-heading font-black text-white text-base">Alert Queued</h2>
                <p className="text-amber-100 text-sm mt-0.5">You are currently offline.</p>
              </div>
            </div>
            <div className="px-6 py-5">
              <p className="text-slate-700 text-sm leading-relaxed">
                Your emergency alert has been saved locally with a <strong>pending send</strong> status.
                It will be sent automatically as soon as your connection is restored.
              </p>
              <p className="text-slate-500 text-xs mt-3">
                Do not close the app until you see the alert marked as sent.
              </p>
            </div>
            <div className="px-6 pb-6">
              <button
                onClick={onClose}
                className="w-full px-4 py-3 rounded-xl bg-amber-500 text-white text-sm font-black hover:bg-amber-600 transition-colors"
              >
                Understood
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
