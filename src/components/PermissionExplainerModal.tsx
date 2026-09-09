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
import { createPortal } from 'react-dom';
import {
  Camera, Image, MapPin, Mic, Bell,
  X, ExternalLink, Settings, ShieldCheck,
} from 'lucide-react';
import { isNative, getAppPlugin } from '@/lib/capacitor-plugins';
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
    body: 'IWIllBUIlD uses your camera to capture job photos, receipts, incidents, and site evidence for your work records.',
    enableLabel: 'Enable Camera',
    settingsHint:
      'Camera access is turned off. To fix it: open iPhone Settings → IWIllBUIlD → turn on Camera.',
  },
  photos: {
    icon: <Image size={28} />,
    iconBg: 'bg-purple-50',
    iconColor: 'text-purple-500',
    title: 'Access Photos',
    body: 'IWIllBUIlD uses your photo library so you can upload job photos, receipts, and site evidence from your camera roll.',
    enableLabel: 'Allow Photos',
    settingsHint:
      'Photo access is turned off. To fix it: open iPhone Settings → IWIllBUIlD → turn on Photos.',
  },
  location: {
    icon: <MapPin size={28} />,
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-500',
    title: 'Enable Location',
    body: 'IWIllBUIlD uses your location for job travel, fleet tracking, and site attendance records.',
    enableLabel: 'Enable Location',
    settingsHint:
      'Location access is turned off. To fix it: open iPhone Settings → IWIllBUIlD → Location → While Using the App.',
  },
  microphone: {
    icon: <Mic size={28} />,
    iconBg: 'bg-violet-50',
    iconColor: 'text-violet-600',
    title: 'Enable Microphone',
    body: 'IWIllBUIlD uses your microphone for voice notes and dictation where enabled.',
    enableLabel: 'Enable Microphone',
    settingsHint:
      'Microphone access is turned off. To fix it: open iPhone Settings → IWIllBUIlD → turn on Microphone.',
  },
  notifications: {
    icon: <Bell size={28} />,
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-500',
    title: 'Enable Notifications',
    body: 'IWIllBUIlD sends you reminders and job updates — like when a job is assigned to you or an invoice is paid.',
    enableLabel: 'Enable Notifications',
    settingsHint:
      'Notifications are turned off. To fix it: open iPhone Settings → Notifications → IWIllBUIlD → turn on Allow Notifications.',
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
        // Use getAppPlugin() — validates openUrl is available before calling.
        const App = getAppPlugin();
        await App?.openUrl({ url: 'app-settings:' });
      } catch { /* silent */ }
    }
    onNotNow();
  }

  if (typeof document === 'undefined') return null;

  return createPortal(
    /* Backdrop */
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden p-4"
      style={{
        backgroundColor: 'rgba(0,0,0,0.65)',
        paddingTop: 'max(env(safe-area-inset-top), 16px)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 16px)',
      }}
      onClick={onNotNow}
    >
      {/* Sheet / dialog — stop propagation so tapping inside doesn't close */}
      <div
        className="relative mx-auto flex w-full max-w-sm flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-in fade-in duration-200"
        style={{
          width: 'calc(100% - 8px)',
          maxWidth: '24rem',
          maxHeight: 'calc(100% - 24px)',
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`permission-title-${type}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onNotNow}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-colors hover:bg-gray-200 active:bg-gray-300"
        >
          <X size={16} />
        </button>

        {/* Pull handle (mobile) */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        {/* Content */}
        <div className="min-h-0 overflow-y-auto px-4 pb-2 pt-3">
          {/* Icon */}
          <div className={`mb-3 flex h-12 w-12 items-center justify-center rounded-xl ${c.iconBg} ${c.iconColor}`}>
            {c.icon}
          </div>

          {/* Title */}
          <h2 id={`permission-title-${type}`} className="mb-1.5 pr-8 text-lg font-bold leading-tight text-gray-900">
            {denied ? `${c.title} in Settings` : c.title}
          </h2>

          {/* Body */}
          <p className="mb-1 break-words text-xs leading-relaxed text-gray-600">
            {denied ? c.settingsHint : c.body}
          </p>

          {/* "You can change this anytime" note — only on the initial prompt */}
          {!denied && (
            <p className="mb-1 mt-2 text-[11px] text-gray-400">
              You can change this anytime in iPhone Settings.
            </p>
          )}
        </div>

        {/* Divider */}
        <div className="mx-4 mt-2 h-px shrink-0 bg-gray-100" />

        {/* Buttons */}
        <div className="flex shrink-0 flex-col gap-1.5 px-4 py-3">
          {denied ? (
            /* Denied state — Settings button + Close */
            <>
              {isNative() && (
                <button
                  onClick={() => void handleOpenSettings()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-bold text-white transition-opacity active:opacity-80"
                >
                  <Settings size={16} />
                  Open iPhone Settings
                  <ExternalLink size={13} className="opacity-70" />
                </button>
              )}
              <button
                onClick={onNotNow}
                className="w-full rounded-xl py-2 text-xs font-semibold text-gray-500 transition-colors hover:bg-gray-50 active:bg-gray-100"
              >
                Close
              </button>
            </>
          ) : (
            /* Normal state — Enable (primary) + Not Now (secondary) */
            <>
              <button
                onClick={onEnable}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-bold text-white shadow-md shadow-violet-200 transition-opacity active:opacity-80"
              >
                <ShieldCheck size={16} />
                {c.enableLabel}
              </button>
              <button
                onClick={onNotNow}
                className="w-full rounded-xl py-2 text-xs font-semibold text-gray-500 transition-colors hover:bg-gray-50 active:bg-gray-100"
              >
                Not Now
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
