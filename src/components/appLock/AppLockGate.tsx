/**
 * AppLockGate.tsx
 * Full-screen lock overlay shown when a signed-in app returns from the background.
 * A fresh password or Apple sign-in does not show this screen.
 * The keypad uses dark text on the light page so the numbers stay visible.
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Scan, Delete, Lock } from 'lucide-react';
import { useAppLock } from '@/lib/appLock/useAppLock';
import { markSignInUnlock } from '@/lib/appLock/appLockStorage';
import { isNativeApp } from '@/lib/native-routing';
import { authClient } from '@/lib/auth/auth-client';

const PAD_ROWS = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['', '0', 'del']];

function PinDots({
  length,
  filled,
  shake
}: {
  length: number;
  filled: number;
  shake: boolean;
}) {
  return <motion.div className="flex items-center justify-center gap-4" animate={shake ? {
    x: [0, -10, 10, -8, 8, -4, 4, 0]
  } : {
    x: 0
  }} transition={{
    duration: 0.4,
    ease: 'easeInOut'
  }}>
      {Array.from({
      length
    }).map((_, i) => <motion.div key={i} className={`rounded-full border-2 transition-all duration-150 ${i < filled ? 'bg-gray-900 border-gray-900 w-4 h-4' : 'bg-transparent border-gray-400 w-3.5 h-3.5'}`} animate={{
      scale: i === filled - 1 && filled > 0 ? [1, 1.3, 1] : 1
    }} transition={{
      duration: 0.15
    }} />)}
    </motion.div>;
}

function PadButton({
  label,
  onPress,
  disabled
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  if (label === '') return <div className="w-16 h-16" />;
  return <motion.button whileTap={{
    scale: 0.88,
    opacity: 0.7
  }} transition={{
    duration: 0.1
  }} onClick={onPress} disabled={disabled} className={`
        flex items-center justify-center rounded-full
        w-16 h-16 text-2xl font-medium text-gray-900 select-none
        bg-gray-100 border border-gray-300 active:bg-gray-200
        disabled:opacity-30 disabled:pointer-events-none
      `} aria-label={label === 'del' ? 'Delete' : label}>
      {label === 'del' ? <Delete size={22} strokeWidth={1.5} className="text-gray-900" /> : label}
    </motion.button>;
}

interface AppLockGateProps {
  children: React.ReactNode;
}

export default function AppLockGate({
  children
}: AppLockGateProps) {
  if (!isNativeApp) return <>{children}</>;
  return <AppLockGateNative>{children}</AppLockGateNative>;
}

function AppLockGateNative({
  children
}: AppLockGateProps) {
  const lock = useAppLock();
  const [pin, setPin] = useState('');
  const [shake, setShake] = useState(false);
  const [pinLength] = useState(4);
  const [exitError, setExitError] = useState('');
  const [appleBusy, setAppleBusy] = useState(false);

  useEffect(() => {
    if (lock.isLocked && lock.hasFaceId) {
      const t = setTimeout(() => {
        lock.tryFaceId().catch(() => {});
      }, 400);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lock.isLocked]);

  useEffect(() => {
    if (pin.length === pinLength && !lock.verifying) {
      handleSubmit(pin);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  const handleSubmit = useCallback(async (currentPin: string) => {
    const ok = await lock.verifyPin(currentPin);
    if (!ok) {
      setShake(true);
      setTimeout(() => setShake(false), 500);
      setPin('');
    }
  }, [lock]);

  const handlePad = useCallback((key: string) => {
    if (lock.verifying || appleBusy || lock.lockedUntil && lock.lockedUntil > Date.now()) return;
    if (key === 'del') {
      setPin(p => p.slice(0, -1));
      return;
    }
    if (pin.length < 6) {
      setPin(p => p + key);
    }
  }, [pin, lock.verifying, lock.lockedUntil, appleBusy]);

  async function useAppleInstead() {
    setExitError('');
    setAppleBusy(true);
    try {
      const { registerPlugin } = await import('@capacitor/core');
      const appleAuth = registerPlugin<{ signIn: () => Promise<{ status?: string; identityToken?: string; nonce?: string }> }>('IWBAppleAuth');
      const result = await appleAuth.signIn();
      if (result.status === 'cancelled') return;
      const response = await fetch('/api/auth/apple', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identityToken: result.identityToken, nonce: result.nonce }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        setExitError(body.error || 'Apple sign-in failed. Enter your PIN or use your password.');
        return;
      }
      markSignInUnlock();
      lock.unlock();
      window.location.assign('/home');
    } catch (err: unknown) {
      setExitError(err instanceof Error ? err.message : 'Apple sign-in failed. Enter your PIN or use your password.');
    } finally {
      setAppleBusy(false);
    }
  }

  async function usePasswordInstead() {
    setExitError('');
    try {
      await authClient.signOut();
    } catch {
      setExitError('Could not open password sign-in. Enter your PIN.');
      return;
    }
    markSignInUnlock();
    window.location.assign('/login');
  }

  const isLockedOut = !!(lock.lockedUntil && lock.lockedUntil > Date.now());
  const busy = lock.verifying || appleBusy;

  return <>
      {children}

      <AnimatePresence>
        {lock.isLocked && <motion.div key="app-lock-overlay" initial={{
        opacity: 0
      }} animate={{
        opacity: 1
      }} exit={{
        opacity: 0
      }} transition={{
        duration: 0.2
      }} className="fixed inset-0 z-[9999] flex flex-col items-center overflow-y-auto bg-white text-gray-900" style={{
        paddingTop: 'max(env(safe-area-inset-top), 24px)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 16px)'
      }}>
            <div className="flex w-full max-w-sm flex-col items-center gap-5 px-6 py-4">
              <div className="flex flex-col items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-violet-200 bg-violet-100">
                  <Lock size={26} className="text-violet-700" strokeWidth={1.5} />
                </div>
                <div className="text-center">
                  <p className="text-lg font-semibold tracking-tight text-gray-900">iwillbuild</p>
                  <p className="mt-0.5 text-sm text-gray-500">Enter your PIN to continue</p>
                </div>
              </div>

              <div className="flex flex-col items-center gap-3">
                <PinDots length={pinLength} filled={pin.length} shake={shake} />
                <AnimatePresence mode="wait">
                  {isLockedOut ? <motion.div key="lockout" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-1">
                      <p className="text-sm font-semibold text-amber-600">Too many attempts</p>
                      <p className="text-xs text-gray-500">Try again in {lock.secondsRemaining}s</p>
                    </motion.div> : lock.error || exitError ? <motion.p key="error" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="px-4 text-center text-sm text-red-600">
                      {exitError || lock.error}
                    </motion.p> : <div key="spacer" className="h-5" />}
                </AnimatePresence>
              </div>

              <div className="flex flex-col items-center gap-3">
                {PAD_ROWS.map((row, ri) => <div key={ri} className="flex items-center gap-4">
                    {row.map((key, ki) => <PadButton key={`${ri}-${ki}`} label={key} onPress={() => handlePad(key)} disabled={busy || isLockedOut} />)}
                  </div>)}
                {lock.hasFaceId ? <motion.button whileTap={{ scale: 0.88 }} onClick={() => lock.tryFaceId()} disabled={busy} className="mt-1 flex h-12 items-center justify-center gap-2 rounded-full bg-gray-100 px-5 text-sm font-medium text-gray-900 disabled:opacity-30" aria-label="Use Face ID">
                    <Scan size={18} className="text-gray-900" strokeWidth={1.5} />
                    Face ID
                  </motion.button> : null}
              </div>

              <div className="flex w-full flex-col gap-3 pb-2">
                <button type="button" onClick={() => void useAppleInstead()} disabled={busy} className="flex min-h-12 w-full items-center justify-center rounded-xl bg-black text-sm font-semibold text-white disabled:opacity-60">
                  Sign in with Apple
                </button>
                <button type="button" onClick={() => void usePasswordInstead()} disabled={busy} className="min-h-11 text-sm font-medium text-violet-700 underline underline-offset-2 disabled:opacity-60">
                  Use password instead
                </button>
              </div>
            </div>
          </motion.div>}
      </AnimatePresence>
    </>;
}
