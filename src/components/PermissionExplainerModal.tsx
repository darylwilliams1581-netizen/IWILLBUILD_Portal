/**
 * PermissionExplainerModal
 * ─────────────────────────────────────────────────────────────────────────────
 * Pre-permission explainer shown before any iOS native permission dialog.
 *
 * Design rules:
 * - Plain language, field-worker friendly — no jargon.
 * - Explains WHY the app needs the permission (not just that it does).
 * - Two buttons: "Not Now" (dismiss, no request) and "Enable [X]" (request).
 * - If the permission was previously denied, shows Settings instructions
 *   instead of the Enable button.
 * - Full-screen bottom-sheet on mobile; centred dialog on desktop.
 *
 * Usage:
 *   <PermissionExplainerModal
 *     type="camera"
 *     open={showCameraExplainer}
 *     onNotNow={() => setShowCameraExplainer(false)}
 *     onEnable={async () => {
 *       setShowCameraExplainer(false);
 *       await requestCameraPermission();
 *     }}
 *   />
 *
 * Denied state:
 *   Pass denied={true} to show the "go to Settings" variant instead of
 *   the Enable button. The modal still has a "Close" button.
 */

import React from 'react';
import {
  Camera, Image, MapPin, Mic, Bell,
  X, ExternalLink, Settings, ShieldCheck,
} from 'lucide-react';
import { isNative } from '@/lib/capacitor-plugins';
import type { PermissionType } from '@/lib/usePermissionExplainer';

// ── Per-permission content ────────────────────────────────────────────────────

interface PermissionContent {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  title: string;
  body: string;
  enableLabel: string;
  /** Shown in the denied / Settings variant */
  settingsHint: string;
}

const CONTENT: Record<PermissionType, PermissionContent> = {
  camera: {
    icon: <Camera size={28} />,
    iconBg: 'bg-blue-50',
    iconColor: 'text-blue-500',
    title: 'Enable Camera',
    body: 'IWILLBUILD uses your camera to capture job photos, receipts, incidents, and site evidence for your work records.',
    enableLabel: 'Enable Camera',
    settingsHint:
      'Camera access is turned off. To fix it: open iPhone Settings → IWILLBUILD → turn on Camera.',
  },
  photos: {
    icon: <Image size={28} />,
    iconBg: 'bg-purple-50',
    iconColor: 'text-purple-500',
    title: 'Access Photos',
    body: 'IWILLBUILD uses your photo library so you can upload job photos, receipts, and site evidence from your camera roll.',
    enableLabel: 'Allow Photos',
    settingsHint:
      'Photo access is turned off. To fix it: open iPhone Settings → IWILLBUILD → turn on Photos.',
  },
  location: {
    icon: <MapPin size={28} />,
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-500',
    title: 'Enable Location',
    body: 'IWILLBUILD uses your location for job travel, fleet tracking, and site attendance records.',
    enableLabel: 'Enable Location',
    settingsHint:
      'Location access is turned off. To fix it: open iPhone Settings → IWILLBUILD → Location → While Using the App.',
  },
  microphone: {
    icon: <Mic size={28} />,
    iconBg: 'bg-violet-50',
    iconColor: 'text-violet-600',
    title: 'Enable Microphone',
    body: 'IWILLBUILD uses your microphone for voice notes and dictation where enabled.',
    enableLabel: 'Enable Microphone',
    settingsHint:
      'Microphone access is turned off. To fix it: open iPhone Settings → IWILLBUILD → turn on Microphone.',
  },
  notifications: {
    icon: <Bell size={28} />,
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-500',
    title: 'Enable Notifications',
    body: 'IWILLBUILD sends you reminders and job updates — like when a job is assigned to you or an invoice is paid.',
    enableLabel: 'Enable Notifications',
    settingsHint:
      'Notifications are turned off. To fix it: open iPhone Settings → Notifications → IWILLBUILD → turn on Allow Notifications.',
  },
};

// ── Props ─────────────────────────────────────────────────────────────────────

export interface PermissionExplainerModalProps {
  /** Which permission this explainer is for */
  type: PermissionType;
  /** Whether the modal is visible */
  open: boolean;
  /**
   * True when the permission has already been denied — shows Settings
   * instructions instead of the Enable button.
   */
  denied?: boolean;
  /** Called when the user taps "Not Now" or the × close button */
  onNotNow: () => void;
  /**
   * Called when the user taps "Enable [X]".
   * The caller is responsible for triggering the native permission request.
   * Not called in denied mode.
   */
  onEnable: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PermissionExplainerModal({
  type,
  open,
  denied = false,
  onNotNow,
  onEnable,
}: PermissionExplainerModalProps) {
  if (!open) return null;

  const c = CONTENT[type];

  async function handleOpenSettings() {
    if (isNative()) {
      try {
        const { App } = await import('@capacitor/app');
        // @ts-expect-error openSettings may not be typed in all versions
        await App.openSettings?.();
      } catch { /* silent */ }
    }
    onNotNow();
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      onClick={onNotNow}
    >
      {/* Sheet / dialog — stop propagation so tapping inside doesn't close */}
      <div
        className="
          relative w-full sm:max-w-sm mx-auto
          bg-white
          rounded-t-3xl sm:rounded-3xl
          shadow-2xl
          overflow-hidden
          animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200
        "
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onNotNow}
          aria-label="Close"
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 active:bg-gray-300 transition-colors z-10"
        >
          <X size={16} />
        </button>

        {/* Pull handle (mobile) */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        {/* Content */}
        <div className="px-6 pt-4 pb-2">
          {/* Icon */}
          <div className={`w-16 h-16 rounded-2xl ${c.iconBg} flex items-center justify-center mb-4 ${c.iconColor}`}>
            {c.icon}
          </div>

          {/* Title */}
          <h2 className="text-xl font-bold text-gray-900 mb-2 leading-tight">
            {denied ? `${c.title} in Settings` : c.title}
          </h2>

          {/* Body */}
          <p className="text-sm text-gray-600 leading-relaxed mb-1">
            {denied ? c.settingsHint : c.body}
          </p>

          {/* "You can change this anytime" note — only on the initial prompt */}
          {!denied && (
            <p className="text-xs text-gray-400 mt-2 mb-1">
              You can change this anytime in iPhone Settings.
            </p>
          )}
        </div>

        {/* Divider */}
        <div className="h-px bg-gray-100 mx-6 mt-2" />

        {/* Buttons */}
        <div className="px-6 py-4 flex flex-col gap-2.5">
          {denied ? (
            /* Denied state — Settings button + Close */
            <>
              {isNative() && (
                <button
                  onClick={() => void handleOpenSettings()}
                  className="w-full flex items-center justify-center gap-2 bg-primary text-white font-bold py-3.5 rounded-2xl text-sm active:opacity-80 transition-opacity"
                >
                  <Settings size={16} />
                  Open iPhone Settings
                  <ExternalLink size={13} className="opacity-70" />
                </button>
              )}
              <button
                onClick={onNotNow}
                className="w-full py-3 rounded-2xl text-sm font-semibold text-gray-500 hover:bg-gray-50 active:bg-gray-100 transition-colors"
              >
                Close
              </button>
            </>
          ) : (
            /* Normal state — Enable (primary) + Not Now (secondary) */
            <>
              <button
                onClick={onEnable}
                className="w-full flex items-center justify-center gap-2 bg-primary text-white font-bold py-3.5 rounded-2xl text-sm active:opacity-80 transition-opacity shadow-md shadow-violet-200"
              >
                <ShieldCheck size={16} />
                {c.enableLabel}
              </button>
              <button
                onClick={onNotNow}
                className="w-full py-3 rounded-2xl text-sm font-semibold text-gray-500 hover:bg-gray-50 active:bg-gray-100 transition-colors"
              >
                Not Now
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
