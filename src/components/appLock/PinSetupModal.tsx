/**
 * PinSetupModal — create / change / disable app PIN.
 * Uses an on-screen keypad (same as App lock) so iOS keyboard zoom cannot
 * blow out the sheet. Native only.
 */
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, AlertCircle, Loader2, ShieldCheck, ShieldOff, KeyRound, Delete } from 'lucide-react';
import { useBodyScrollLock } from '@/lib/useBodyScrollLock';
import {
  getDeviceFingerprint,
  savePinRecord,
  clearPinRecord,
  getPinRecord,
  clearLockoutState,
} from '@/lib/appLock/appLockStorage';

export type PinSetupMode = 'create' | 'change' | 'disable';

interface PinSetupModalProps {
  mode: PinSetupMode;
  userEmail: string;
  onClose: () => void;
  onSuccess: () => void;
}

type Step = 'verify-current' | 'enter-new' | 'confirm-new' | 'done';

const PAD_ROWS = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['', '0', 'del']];
const PIN_LENGTH = 4;

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
  if (step === 'confirm-new') return 'Confirm new PIN';
  if (step === 'done') return mode === 'disable' ? 'PIN disabled' : 'PIN set up';
  if (mode === 'create') return 'Create a PIN';
  if (mode === 'change') return 'Enter new PIN';
  return 'Enter PIN';
}

function PinDots({ filled }: { filled: number }) {
  return (
    <div className="flex items-center justify-center gap-3">
      {Array.from({ length: PIN_LENGTH }).map((_, i) => (
        <div
          key={i}
          className={`rounded-full border-2 transition-all ${
            i < filled ? 'h-3.5 w-3.5 bg-violet-600 border-violet-600' : 'h-3 w-3 border-slate-300 bg-transparent'
          }`}
        />
      ))}
    </div>
  );
}

function PadButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  if (label === '') return <div className="h-14 w-14" />;
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.9 }}
      onClick={onPress}
      disabled={disabled}
      className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-xl font-medium text-slate-800 active:bg-slate-200 disabled:opacity-30"
      aria-label={label === 'del' ? 'Delete' : label}
    >
      {label === 'del' ? <Delete size={18} /> : label}
    </motion.button>
  );
}

export default function PinSetupModal({ mode, userEmail, onClose, onSuccess }: PinSetupModalProps) {
  const initialStep: Step = (mode === 'change' || mode === 'disable') ? 'verify-current' : 'enter-new';
  const [step, setStep] = useState<Step>(initialStep);
  const [pin, setPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState(userEmail);

  useBodyScrollLock(true);
  useEffect(() => () => restoreViewport(), []);
  useEffect(() => { setPin(''); setError(''); }, [step]);

  useEffect(() => {
    if (email) return;
    void fetch('/api/me', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((d: { user?: { email?: string } } | null) => {
        if (d?.user?.email) setEmail(d.user.email);
      })
      .catch(() => undefined);
  }, [email]);

  const handleClose = useCallback(() => {
    restoreViewport();
    onClose();
  }, [onClose]);

  const verifyCurrent = useCallback(async (currentPin: string) => {
    const record = getPinRecord();
    if (!record) { setError('No PIN found on this device.'); return; }
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/auth/pin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, pin: currentPin, deviceFingerprint: getDeviceFingerprint() }),
      });
      if (!res.ok) { setError(await readApiError(res)); setPin(''); return; }
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!data.ok) { setError(data.error ?? 'Incorrect PIN.'); setPin(''); return; }
      if (mode === 'disable') await disablePin(record.deviceId);
      else setStep('enter-new');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [mode, email]);

  const disablePin = useCallback(async (deviceId: string) => {
    setBusy(true); setError('');
    try {
      const res = await fetch(`/api/auth/trusted-devices/${deviceId}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) { setError(await readApiError(res)); return; }
      clearPinRecord();
      clearLockoutState();
      setStep('done');
      setTimeout(() => onSuccess(), 900);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [onSuccess]);

  const saveNewPin = useCallback(async (confirmedPin: string) => {
    if (confirmedPin !== newPin) {
      setError('PINs do not match. Please try again.');
      setPin('');
      setStep('enter-new');
      return;
    }
    if (!email) {
      setError('Could not read your account email. Sign out and in, then try again.');
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
      if (!res.ok) { setError(await readApiError(res)); return; }
      const data = await res.json() as { ok?: boolean; error?: string; deviceId?: string };
      if (!data.ok) { setError(data.error ?? 'Failed to save PIN.'); return; }

      savePinRecord({
        deviceId: data.deviceId ?? 'unknown',
        deviceName,
        email,
      });
      setStep('done');
      setTimeout(() => onSuccess(), 900);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [newPin, email, onSuccess]);

  useEffect(() => {
    if (pin.length !== PIN_LENGTH || busy) return;
    if (step === 'verify-current') void verifyCurrent(pin);
    else if (step === 'enter-new') { setNewPin(pin); setStep('confirm-new'); }
    else if (step === 'confirm-new') void saveNewPin(pin);
  }, [pin]); // eslint-disable-line react-hooks/exhaustive-deps

  function handlePad(key: string) {
    if (busy) return;
    if (key === 'del') { setPin(p => p.slice(0, -1)); return; }
    if (pin.length < PIN_LENGTH) setPin(p => p + key);
  }

  const isDone = step === 'done';
  const isDisableMode = mode === 'disable';

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-end justify-center overflow-hidden p-3 sm:items-center"
      style={{
        WebkitTextSizeAdjust: '100%',
        paddingBottom: 'max(env(safe-area-inset-bottom), 12px)',
      }}
    >
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-black/60" onClick={handleClose} />
      <motion.div
        initial={{ y: 48, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="relative flex min-w-0 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        style={{
          width: 'min(calc(100dvw - 24px), 22rem)',
          maxHeight: 'min(88dvh, calc(100dvh - 32px))',
        }}
      >
        <div className="flex shrink-0 items-center justify-between px-4 pt-4 pb-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${isDisableMode ? 'bg-red-50' : 'bg-violet-50'}`}>
              {isDisableMode ? <ShieldOff size={16} className="text-red-600" /> : <KeyRound size={16} className="text-violet-600" />}
            </div>
            <p className="truncate text-sm font-bold text-slate-900">
              {mode === 'create' ? 'Set up PIN' : mode === 'change' ? 'Change PIN' : 'Disable PIN'}
            </p>
          </div>
          <button type="button" onClick={handleClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500">
            <X size={15} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col items-center gap-4 overflow-y-auto px-4 pb-5">
          {isDone ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-violet-50">
                {isDisableMode ? <ShieldOff size={26} className="text-slate-500" /> : <ShieldCheck size={26} className="text-violet-600" />}
              </div>
              <p className="text-base font-semibold text-slate-900">{stepTitle(mode, step)}</p>
              <p className="text-center text-sm text-slate-500">
                {mode === 'disable' ? 'App lock has been removed from this device.' : "You'll be asked for this PIN next time you open the app."}
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm font-semibold text-slate-900">{stepTitle(mode, step)}</p>
              <PinDots filled={pin.length} />
              {error && (
                <p className="flex items-center gap-1.5 text-center text-sm text-red-600">
                  <AlertCircle size={14} /> {error}
                </p>
              )}
              {busy && <Loader2 size={18} className="animate-spin text-slate-400" />}
              <div className="flex flex-col items-center gap-2.5 pt-1">
                {PAD_ROWS.map((row, ri) => (
                  <div key={ri} className="flex items-center gap-3">
                    {row.map((key, ki) => (
                      <PadButton key={`${ri}-${ki}`} label={key} onPress={() => handlePad(key)} disabled={busy} />
                    ))}
                  </div>
                ))}
              </div>
              <p className="text-center text-[11px] text-slate-400">4-digit PIN. Stored on the server, not this phone.</p>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
