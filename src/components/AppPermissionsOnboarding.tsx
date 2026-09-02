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
      'IWIIlBUILD uses your location to log site arrivals, track fleet vehicles, and auto-fill job addresses. Your location is only shared with your company.',
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
          Notification.requestPermission(),
          8000,
          'denied' as NotificationPermission
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

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-gray-950">
      {/* Dismiss */}
      <div className="flex justify-end px-5 pt-14 pb-2">
        <button
          onClick={handleDismissAll}
          className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/60 hover:bg-white/20 transition-colors"
          aria-label="Skip setup"
        >
          <X size={15} />
        </button>
      </div>

      {/* Progress dots */}
      <div className="flex justify-center gap-2 pb-6">
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
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep.id}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.28, ease: 'easeOut' as const }}
            className="w-full max-w-sm flex flex-col items-center text-center gap-6"
          >
            {/* Icon */}
            <div className={`w-24 h-24 rounded-3xl ${currentStep.iconBg} flex items-center justify-center shadow-2xl`}>
              {state === 'granted' ? (
                <CheckCircle2 size={44} className="text-white" />
              ) : (
                <Icon size={44} className="text-white" />
              )}
            </div>

            {/* Text */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-violet-400 uppercase tracking-widest">
                Step {stepIndex + 1} of {STEPS.length}
              </p>
              <h2 className="text-2xl font-black text-white leading-tight">
                {currentStep.title}
              </h2>
              <p className="text-sm font-semibold text-violet-300">
                {currentStep.why}
              </p>
              <p className="text-sm text-white/50 leading-relaxed mt-2">
                {currentStep.detail}
              </p>
            </div>

            {/* Privacy note */}
            <div className="flex items-center gap-2 bg-white/5 rounded-xl px-4 py-3 w-full">
              <Shield size={14} className="text-green-400 shrink-0" />
              <p className="text-xs text-white/40 text-left">
                Your data stays within your company account and is never sold or shared.
              </p>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Actions */}
      <div className="px-6 pb-12 space-y-3">
        <button
          onClick={handleEnable}
          disabled={state === 'requesting' || state === 'granted'}
          className={[
            'w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-base text-white transition-all disabled:opacity-70',
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
          className="w-full py-3 text-sm font-semibold text-white/40 hover:text-white/60 transition-colors"
        >
          {isLastStep ? 'Skip and go to app' : 'Skip for now'}
        </button>
      </div>
    </div>
  );
}
