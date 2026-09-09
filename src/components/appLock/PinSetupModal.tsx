/**
 * PinSetupModal.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal for creating, changing, or disabling the app PIN.
 *
 * Modes:
 *   'create'  — first-time setup: enter PIN → confirm PIN → save
 *   'change'  — verify current PIN first, then create new one
 *   'disable' — verify current PIN, then delete the trusted device record
 *
 * Security:
 *   - PIN is sent to the server for bcrypt hashing — never stored locally
 *   - On success, savePinRecord() stores only the device ID + email (no hash)
 *   - On disable, clearPinRecord() removes local state
 *
 * Native iOS only — the parent (AppLockSettings) only renders this on native.
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, CheckCircle2, AlertCircle, Loader2, ShieldCheck, ShieldOff, KeyRound } from 'lucide-react';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { useBodyScrollLock } from '@/lib/useBodyScrollLock';
import {
  getDeviceFingerprint,
  savePinRecord,
  clearPinRecord,
  getPinRecord,
  clearLockoutState,
} from '@/lib/appLock/appLockStorage';

// ── Types ─────────────────────────────────────────────────────────────────────

export type PinSetupMode = 'create' | 'change' | 'disable';

interface PinSetupModalProps {
  mode: PinSetupMode;
  userEmail: string;
  onClose: () => void;
  onSuccess: () => void;
}

type Step =
  | 'verify-current'   // change/disable: verify existing PIN first
  | 'enter-new'        // create/change: enter new PIN
  | 'confirm-new'      // create/change: confirm new PIN
  | 'done';

function restoreViewport() {
  (document.activeElement as HTMLElement | null)?.blur();
  document.body.style.removeProperty('overflow');
  document.documentElement.style.removeProperty('overflow');
  window.scrollTo(0, 0);
}

async function readApiError(res: Response): Promise<string> {
  const fallback = res.status === 401
    ? 'Sign in again, then set up the PIN.'
    : res.status === 403
      ? 'Your account must be verified before setting a PIN.'
      : res.status === 404
        ? 'PIN service is not on the website yet.'
        : `Could not save PIN (${res.status}).`;
  try {
    const data = await res.json() as { error?: string };
    return data.error ?? fallback;
  } catch {
    return fallback;
  }
}

function stepTitle(mode: PinSetupMode, step: Step): string {
  if (step === 'verify-current') return 'Enter current PIN';
  if (step === 'confirm-new')    return 'Confirm new PIN';
  if (step === 'done')           return mode === 'disable' ? 'PIN disabled' : 'PIN set up';
  if (mode === 'create')         return 'Create a PIN';
  if (mode === 'change')         return 'Enter new PIN';
  return 'Enter PIN';
}

function stepSubtitle(mode: PinSetupMode, step: Step): string {
  if (step === 'verify-current') return 'Verify your identity before making changes.';
  if (step === 'confirm-new')    return 'Re-enter your new PIN to confirm.';
  if (step === 'done' && mode === 'disable') return 'App lock has been removed from this device.';
  if (step === 'done')           return 'Your PIN is active. You\'ll be prompted on next app open.';
  if (mode === 'create')         return 'Choose a 4–6 digit PIN for quick access.';
  return 'Enter your new 4–6 digit PIN.';
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PinSetupModal({ mode, userEmail, onClose, onSuccess }: PinSetupModalProps) {
  const initialStep: Step = (mode === 'change' || mode === 'disable') ? 'verify-current' : 'enter-new';
  const [step, setStep] = useState<Step>(initialStep);
  const [pin, setPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useBodyScrollLock(true);

  useEffect(() => {
    return () => restoreViewport();
  }, []);

  const handleClose = useCallback(() => {
    restoreViewport();
    onClose();
  }, [onClose]);

  // Reset pin input on step change
  useEffect(() => { setPin(''); setError(''); }, [step]);

  // ── Verify current PIN (change / disable flow) ────────────────────────────
  const verifyCurrent = useCallback(async (currentPin: string) => {
    const record = getPinRecord();
    if (!record) { setError('No PIN found on this device.'); return; }

    setBusy(true); setError('');
    try {
      const fp = getDeviceFingerprint();
      const res = await fetch('/api/auth/pin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: userEmail, pin: currentPin, deviceFingerprint: fp }),
      });
      if (!res.ok) {
        setError(await readApiError(res));
        setPin('');
        return;
      }
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!data.ok) {
        setError(data.error ?? 'Incorrect PIN.');
        setPin('');
        return;
      }

      // Verified — move to next step
      if (mode === 'disable') {
        await disablePin(record.deviceId);
      } else {
        setStep('enter-new');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [mode, userEmail]);

  // ── Disable PIN ───────────────────────────────────────────────────────────
  const disablePin = useCallback(async (deviceId: string) => {
    setBusy(true); setError('');
    try {
      const res = await fetch(`/api/auth/trusted-devices/${deviceId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        setError(await readApiError(res));
        return;
      }
      clearPinRecord();
      clearLockoutState();
      setStep('done');
      setTimeout(() => { onSuccess(); }, 1200);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [onSuccess]);

  // ── Save new PIN ──────────────────────────────────────────────────────────
  const saveNewPin = useCallback(async (confirmedPin: string) => {
    if (confirmedPin !== newPin) {
      setError('PINs do not match. Please try again.');
      setPin('');
      setStep('enter-new');
      return;
    }

    setBusy(true); setError('');
    try {
      const fp = getDeviceFingerprint();
      const deviceName = `iPhone (${new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })})`;

      const res = await fetch('/api/auth/trusted-devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ deviceFingerprint: fp, deviceName, pin: confirmedPin }),
      });
      if (!res.ok) {
        setError(await readApiError(res));
        return;
      }
      const data = await res.json() as { ok?: boolean; error?: string; deviceId?: string };
      if (!data.ok) {
        setError(data.error ?? 'Failed to save PIN.');
        return;
      }

      // Fetch device ID from trusted-devices list
      const listRes = await fetch('/api/auth/trusted-devices', { credentials: 'include' });
      const listData = await listRes.json() as { devices?: { id: string; deviceFingerprint: string }[] };
      const device = listData.devices?.find(d => d.deviceFingerprint === fp);

      savePinRecord({
        deviceId: device?.id ?? 'unknown',
        deviceName,
        email: userEmail,
      });

      setStep('done');
      setTimeout(() => { onSuccess(); }, 1200);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [newPin, userEmail, onSuccess]);

  // ── Auto-advance on PIN complete ──────────────────────────────────────────
  useEffect(() => {
    if (pin.length < 4 || busy) return;

    if (step === 'verify-current') {
      verifyCurrent(pin);
    } else if (step === 'enter-new') {
      setNewPin(pin);
      setStep('confirm-new');
    } else if (step === 'confirm-new') {
      saveNewPin(pin);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  const isDone = step === 'done';
  const isDisableMode = mode === 'disable';

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-end justify-center overflow-hidden p-3 sm:items-center"
      style={{
        WebkitTextSizeAdjust: '100%',
        textSizeAdjust: '100%',
        paddingBottom: 'max(env(safe-area-inset-bottom), 12px)',
      }}
    >
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60"
        onClick={handleClose}
      />

      {/* Sheet */}
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="relative flex w-full flex-col rounded-2xl bg-card shadow-2xl"
        style={{
          width: 'min(calc(100vw - 24px), 24rem)',
          maxWidth: '24rem',
          maxHeight: 'min(560px, calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 24px))',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between px-5 pt-5 pb-2">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
              isDisableMode ? 'bg-destructive/15' : 'bg-primary/15'
            }`}>
              {isDisableMode
                ? <ShieldOff size={16} className="text-destructive" />
                : <KeyRound size={16} className="text-primary" />
              }
            </div>
            <div>
              <p className="text-sm font-bold text-foreground leading-tight">
                {mode === 'create' ? 'Set up PIN' : mode === 'change' ? 'Change PIN' : 'Disable PIN'}
              </p>
              <p className="text-xs text-muted-foreground leading-tight">App lock</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground active:bg-muted/70"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-4 pb-2 flex flex-col items-center gap-5">
          <AnimatePresence mode="wait">
            {isDone ? (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center gap-3 py-6"
              >
                <div className={`w-14 h-14 rounded-full flex items-center justify-center ${
                  isDisableMode ? 'bg-muted' : 'bg-primary/15'
                }`}>
                  {isDisableMode
                    ? <ShieldOff size={26} className="text-muted-foreground" />
                    : <ShieldCheck size={26} className="text-primary" />
                  }
                </div>
                <p className="text-base font-semibold text-foreground">{stepTitle(mode, step)}</p>
                <p className="text-sm text-muted-foreground text-center">{stepSubtitle(mode, step)}</p>
              </motion.div>
            ) : (
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.18 }}
                className="flex flex-col items-center gap-4 w-full"
              >
                <div className="text-center">
                  <p className="text-base font-semibold text-foreground">{stepTitle(mode, step)}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">{stepSubtitle(mode, step)}</p>
                </div>

                {/* OTP input */}
                <InputOTP
                  maxLength={6}
                  value={pin}
                  onChange={setPin}
                  disabled={busy}
                  autoFocus
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className="text-base"
                >
                  <InputOTPGroup>
                    {[0, 1, 2, 3].map(i => (
                      <InputOTPSlot key={i} index={i} />
                    ))}
                  </InputOTPGroup>
                </InputOTP>

                {/* Step indicator for create/change */}
                {(mode === 'create' || mode === 'change') && step !== 'verify-current' && (
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full transition-colors ${step === 'enter-new' ? 'bg-primary' : 'bg-muted'}`} />
                    <div className={`w-2 h-2 rounded-full transition-colors ${step === 'confirm-new' ? 'bg-primary' : 'bg-muted'}`} />
                  </div>
                )}

                {/* Error */}
                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-2 text-destructive text-sm"
                    >
                      <AlertCircle size={14} />
                      <span>{error}</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Busy spinner */}
                {busy && (
                  <Loader2 size={18} className="animate-spin text-muted-foreground" />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Hint */}
        {!isDone && (
          <p className="text-center text-xs text-muted-foreground px-5 pb-2">
            PIN is stored securely on the server — never on this device.
          </p>
        )}
      </motion.div>
    </div>
  );
}
