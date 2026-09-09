/**
 * AppPermissionsOnboarding
 * ─────────────────────────────────────────────────────────────────────────────
 * Full-screen permission walkthrough shown ONCE after first login on a native
 * device (iOS / Android). Walks the user through:
 *   1. Location — for GPS tracking on jobs
 *   2. Camera   — for job photos and SWMS
 *   3. Notifications — for job alerts and updates
 *
 * Uses localStorage key 'iwb_app_onboarding_done' to ensure it only shows once.
 */

import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  MapPin, Camera, Bell, ChevronRight, X, CheckCircle2, Shield,
} from 'lucide-react';
import {
  getNativeGeo,
  getCameraPlugin,
  getPushNotificationsPlugin,
} from '@/lib/capacitor-plugins';

// ── Persistence ───────────────────────────────────────────────────────────────

const ONBOARDING_KEY = 'iwb_app_onboarding_done';

export function hasCompletedOnboarding(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === 'true';
  } catch {
    return false;
  }
}

function markOnboardingDone(): void {
  try {
    localStorage.setItem(ONBOARDING_KEY, 'true');
  } catch { /* storage unavailable */ }
}

// ── Step definitions ──────────────────────────────────────────────────────────

type StepId = 'location' | 'camera' | 'notifications';

interface Step {
  id: StepId;
  icon: typeof MapPin;
  iconBg: string;
  title: string;
  why: string;
  detail: string;
  buttonLabel: string;
}

const STEPS: Step[] = [
  {
    id: 'location',
    icon: MapPin,
    iconBg: 'bg-blue-500',
    title: 'Location access',
    why: 'Required for GPS tracking on jobs',
    detail:
      'IWIllBUIlD uses your location to log site arrivals, track fleet vehicles, and auto-fill job addresses. Your location is only shared with your company.',
    buttonLabel: 'Enable location',
  },
  {
    id: 'camera',
    icon: Camera,
    iconBg: 'bg-violet-500',
    title: 'Camera & photos',
    why: 'Required for job photos and SWMS sign-off',
    detail:
      'Take job site photos, capture signatures on safety forms, and attach images to incidents and reports — all without leaving the app.',
    buttonLabel: 'Enable camera',
  },
  {
    id: 'notifications',
    icon: Bell,
    iconBg: 'bg-amber-500',
    title: 'Push notifications',
    why: 'Stay updated on job changes and alerts',
    detail:
      'Get notified when jobs are assigned to you, when a prestart is due, or when your manager sends an update. You can adjust this in Settings at any time.',
    buttonLabel: 'Enable notifications',
  },
];

// ── Timeout helper ────────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

// ── Permission requesters ─────────────────────────────────────────────────────

async function requestLocation(): Promise<boolean> {
  try {
    // Access Geolocation plugin directly via bridge — no dynamic import
    const geo = getNativeGeo();
    if (!geo) {
      // Web / PWA fallback — use browser geolocation API
      if (!navigator.geolocation) return false;
      return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          () => resolve(true),
          () => resolve(false),
          { timeout: 5000 }
        );
      });
    }
    const status = await withTimeout(
      geo.requestPermissions({ permissions: ['location'] }),
      8000,
      { location: 'denied', coarseLocation: 'denied' } as { location?: string; coarseLocation?: string }
    );
    const loc = (status as { location?: string; coarseLocation?: string }).location
      ?? (status as { location?: string; coarseLocation?: string }).coarseLocation;
    return loc === 'granted';
  } catch {
    return false;
  }
}

async function requestCamera(): Promise<boolean> {
  try {
    // Access Camera plugin directly via bridge — no dynamic import
    const CameraPlugin = getCameraPlugin();
    if (!CameraPlugin) return false;
    const status = await withTimeout(
      CameraPlugin.requestPermissions({ permissions: ['camera', 'photos'] }),
      8000,
      { camera: 'denied' } as { camera?: string }
    );
    const cam = (status as { camera?: string }).camera ?? 'denied';
    return cam === 'granted';
  } catch {
    return false;
  }
}

async function requestNotifications(): Promise<boolean> {
  try {
    // Access PushNotifications plugin directly via bridge — no dynamic import
    const Push = getPushNotificationsPlugin();
    if (!Push) {
      if (!('Notification' in window)) return false;
      try {
        const result = await withTimeout(
          window.Notification.requestPermission(),
          8000,
          'denied' as 'default' | 'denied' | 'granted'
        );
        return result === 'granted';
      } catch {
        return false;
      }
    }
    const result = await withTimeout(
      Push.requestPermissions(),
      8000,
      { receive: 'denied' } as { receive: string }
    );
    return result.receive === 'granted';
  } catch {
    return false;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  onDone: () => void;
}

type StepState = 'idle' | 'requesting' | 'granted' | 'denied';

export default function AppPermissionsOnboarding({ onDone }: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const [stepStates, setStepStates] = useState<Record<StepId, StepState>>({
    location: 'idle',
    camera: 'idle',
    notifications: 'idle',
  });

  const currentStep = STEPS[stepIndex];
  const isLastStep = stepIndex === STEPS.length - 1;

  const handleEnable = useCallback(async () => {
    const step = STEPS[stepIndex];
    setStepStates((s) => ({ ...s, [step.id]: 'requesting' }));

    // Hard 10-second global bail-out — if the native bridge is completely
    // unresponsive, we resolve to false so the button never spins forever.
    let granted = false;
    try {
      const requestFn =
        step.id === 'location'      ? requestLocation :
        step.id === 'camera'        ? requestCamera :
        /* notifications */           requestNotifications;

      granted = await withTimeout(requestFn(), 10000, false);
    } catch {
      granted = false;
    }

    setStepStates((s) => ({ ...s, [step.id]: granted ? 'granted' : 'denied' }));

    setTimeout(() => {
      if (isLastStep) {
        markOnboardingDone();
        onDone();
      } else {
        setStepIndex((i) => i + 1);
      }
    }, 700);
  }, [stepIndex, isLastStep, onDone]);

  const handleSkip = useCallback(() => {
    if (isLastStep) {
      markOnboardingDone();
      onDone();
    } else {
      setStepIndex((i) => i + 1);
    }
  }, [isLastStep, onDone]);

  const handleDismissAll = useCallback(() => {
    markOnboardingDone();
    onDone();
  }, [onDone]);

  const state = stepStates[currentStep.id];
  const Icon = currentStep.icon;

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden bg-gray-950/75 p-4"
      style={{ WebkitTextSizeAdjust: '100%', textSizeAdjust: '100%' }}
    >
      <div
        className="flex w-full max-w-sm flex-col overflow-hidden rounded-2xl bg-gray-950 shadow-2xl ring-1 ring-white/10"
        style={{
          width: 'calc(100% - 8px)',
          maxWidth: '24rem',
          maxHeight: 'calc(100% - 24px)',
          overflow: 'hidden',
        }}
        role="dialog"
        aria-modal="true"
        aria-label="App permission setup"
      >
      {/* Dismiss */}
      <div
        className="flex shrink-0 justify-end px-4 pb-1"
        style={{ paddingTop: '12px' }}
      >
        <button
          onClick={handleDismissAll}
          className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/60 hover:bg-white/20 transition-colors"
          aria-label="Skip setup"
        >
          <X size={15} />
        </button>
      </div>

      {/* Progress dots */}
      <div className="flex shrink-0 justify-center gap-2 pb-2">
        {STEPS.map((s, i) => (
          <div
            key={s.id}
            className="h-1.5 rounded-full transition-all duration-300"
            style={{
              width: i === stepIndex ? 24 : 8,
              background: i <= stepIndex
                ? 'hsl(var(--primary))'
                : 'rgba(255,255,255,0.15)',
            }}
          />
        ))}
      </div>

      {/* Step card */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-2">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep.id}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.28, ease: 'easeOut' as const }}
            className="mx-auto flex w-full flex-col items-center gap-3 py-2 text-center"
          >
            {/* Icon */}
            <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl ${currentStep.iconBg} shadow-xl`}>
              {state === 'granted' ? (
                <CheckCircle2 size={30} className="text-white" />
              ) : (
                <Icon size={30} className="text-white" />
              )}
            </div>

            {/* Text */}
            <div className="w-full min-w-0 space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-violet-400">
                Step {stepIndex + 1} of {STEPS.length}
              </p>
              <h2 className="break-words text-xl font-black leading-tight text-white">
                {currentStep.title}
              </h2>
              <p className="break-words text-xs font-semibold text-violet-300">
                {currentStep.why}
              </p>
              <p className="mt-1 break-words text-xs leading-relaxed text-white/55">
                {currentStep.detail}
              </p>
            </div>

            {/* Privacy note */}
            <div className="flex w-full min-w-0 items-center gap-2 rounded-xl bg-white/5 px-3 py-2.5">
              <Shield size={13} className="shrink-0 text-green-400" />
              <p className="min-w-0 break-words text-left text-[11px] leading-relaxed text-white/45">
                Your data stays within your company account and is never sold or shared.
              </p>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Actions */}
      <div
        className="shrink-0 space-y-1.5 px-4 pt-2"
        style={{ paddingBottom: '12px' }}
      >
        <button
          onClick={handleEnable}
          disabled={state === 'requesting' || state === 'granted'}
          className={[
            'flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white transition-all disabled:opacity-70',
            state === 'granted' ? 'bg-green-600' : 'bg-primary hover:bg-primary/90',
          ].join(' ')}
        >
          {state === 'requesting' ? (
            <>
              <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              Requesting…
            </>
          ) : state === 'granted' ? (
            <>
              <CheckCircle2 size={18} />
              Granted
            </>
          ) : (
            <>
              {currentStep.buttonLabel}
              <ChevronRight size={18} />
            </>
          )}
        </button>

        <button
          onClick={handleSkip}
          className="w-full py-2 text-xs font-semibold text-white/40 transition-colors hover:text-white/60"
        >
          {isLastStep ? 'Skip and go to app' : 'Skip for now'}
        </button>
      </div>
      </div>
    </div>,
    document.body,
  );
}
