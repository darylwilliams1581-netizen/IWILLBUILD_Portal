/**
 * AppLockGate.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Full-screen lock overlay shown when the app is locked.
 * Renders on top of all content — children are not accessible until unlocked.
 *
 * Features:
 *   • 4–6 digit PIN pad (large touch targets, iOS-style)
 *   • Face ID button (shown only when hasFaceId is true)
 *   • Increasing-delay lockout with countdown
 *   • Shake animation on wrong PIN
 *   • Haptic feedback via useAppLock
 *   • "Use password instead" link → navigates to /login
 *   • Native iOS only — on web this renders children directly
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from 'motion/react';
import { Scan, Delete, Lock } from 'lucide-react';
import { useAppLock } from '@/lib/appLock/useAppLock';
import { isNativeApp } from '@/lib/native-routing';

// ── PIN pad digit layout ──────────────────────────────────────────────────────
const PAD_ROWS = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['', '0', 'del']];

// ── Sub-components ────────────────────────────────────────────────────────────

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
    }).map((_, i) => <motion.div key={i} className={`rounded-full border-2 transition-all duration-150 ${i < filled ? 'bg-white border-white w-4 h-4' : 'bg-transparent border-white/50 w-3.5 h-3.5'}`} animate={{
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
  if (label === '') return <div />;
  return <motion.button whileTap={{
    scale: 0.88,
    opacity: 0.7
  }} transition={{
    duration: 0.1
  }} onClick={onPress} disabled={disabled} className={`
        flex items-center justify-center rounded-full
        w-20 h-20 text-2xl font-light text-white select-none
        bg-white/10 active:bg-white/20
        disabled:opacity-30 disabled:pointer-events-none
        transition-colors
      `} aria-label={label === 'del' ? 'Delete' : label}>
      {label === 'del' ? <Delete size={22} strokeWidth={1.5} /> : label}
    </motion.button>;
}

// ── Main component ────────────────────────────────────────────────────────────

interface AppLockGateProps {
  children: React.ReactNode;
}
export default function AppLockGate({
  children
}: AppLockGateProps) {
  // On web, render children directly — this feature is native-only
  // AppLockGateNative contains all hooks so we avoid conditional hook calls
  if (!isNativeApp) return <>{children}</>;
  return <AppLockGateNative>{children}</AppLockGateNative>;
}
function AppLockGateNative({
  children
}: AppLockGateProps) {
  const navigate = useNavigate();
  const lock = useAppLock();
  const [pin, setPin] = useState('');
  const [shake, setShake] = useState(false);
  const [pinLength] = useState(4); // default; server accepts 4–6

  // Auto-attempt Face ID on mount if available
  useEffect(() => {
    if (lock.isLocked && lock.hasFaceId) {
      // Small delay so the overlay is visible before the system prompt appears
      const t = setTimeout(() => {
        lock.tryFaceId().catch(() => {});
      }, 400);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lock.isLocked]);

  // Auto-submit when PIN reaches expected length
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
    if (lock.verifying || lock.lockedUntil && lock.lockedUntil > Date.now()) return;
    if (key === 'del') {
      setPin(p => p.slice(0, -1));
      return;
    }
    if (pin.length < 6) {
      setPin(p => p + key);
    }
  }, [pin, lock.verifying, lock.lockedUntil]);
  const isLockedOut = !!(lock.lockedUntil && lock.lockedUntil > Date.now());
  return <>
      {/* Render children underneath — they're hidden by the overlay */}
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
      }} className="fixed inset-0 z-[9999] flex flex-col items-center justify-between bg-background" style={{
        paddingTop: 'max(env(safe-area-inset-top), 48px)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 32px)'
      }}>
            {/* ── Top: logo + label ── */}
            <div className="flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center">
                <Lock size={26} className="text-primary" strokeWidth={1.5} />
              </div>
              <div className="text-center">
                <p className="text-foreground text-lg font-semibold tracking-tight">iwillbuild</p>
                <p className="text-muted-foreground text-sm mt-0.5">Enter your PIN to continue</p>
              </div>
            </div>

            {/* ── Middle: dots + error ── */}
            <div className="flex flex-col items-center gap-5">
              <PinDots length={pinLength} filled={pin.length} shake={shake} />

              <AnimatePresence mode="wait">
                {isLockedOut ? <motion.div key="lockout" initial={{
              opacity: 0,
              y: 4
            }} animate={{
              opacity: 1,
              y: 0
            }} exit={{
              opacity: 0
            }} className="flex flex-col items-center gap-1">
                    <p className="text-amber-500 text-sm font-semibold">Too many attempts</p>
                    <p className="text-muted-foreground text-xs">
                      Try again in {lock.secondsRemaining}s
                    </p>
                  </motion.div> : lock.error ? <motion.p key="error" initial={{
              opacity: 0,
              y: 4
            }} animate={{
              opacity: 1,
              y: 0
            }} exit={{
              opacity: 0
            }} className="text-destructive text-sm text-center px-8">
                    {lock.error}
                  </motion.p> : <div key="spacer" className="h-5" />}
              </AnimatePresence>
            </div>

            {/* ── PIN pad ── */}
            <div className="flex flex-col items-center gap-3">
              {PAD_ROWS.map((row, ri) => <div key={ri} className="flex items-center gap-5">
                  {row.map((key, ki) => <PadButton key={`${ri}-${ki}`} label={key} onPress={() => handlePad(key)} disabled={lock.verifying || isLockedOut} />)}
                </div>)}

              {/* Face ID row */}
              <div className="flex items-center justify-center gap-5 mt-1" style={{
            height: 80
          }}>
                {/* Placeholder left */}
                <div className="w-20 h-20" />

                {/* Face ID button (centre) */}
                {lock.hasFaceId ? <motion.button whileTap={{
              scale: 0.88
            }} onClick={() => lock.tryFaceId()} disabled={lock.verifying} className="w-20 h-20 rounded-full bg-foreground/10 flex items-center justify-center active:bg-foreground/20 disabled:opacity-30" aria-label="Use Face ID">
                    <Scan size={26} className="text-foreground" strokeWidth={1.5} />
                  </motion.button> : <div className="w-20 h-20" />}

                {/* Placeholder right */}
                <div className="w-20 h-20" />
              </div>
            </div>

            {/* ── Bottom: use password link ── */}
            <button onClick={() => navigate('/login')} className="text-muted-foreground text-sm underline underline-offset-2 active:text-foreground transition-colors">
              Use password instead
            </button>
          </motion.div>}
      </AnimatePresence>
    </>;
}
