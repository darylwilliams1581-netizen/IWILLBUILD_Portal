/**
 * AppPermissionsTab
 * ─────────────────────────────────────────────────────────────────────────────
 * Shows the current status of all native permissions the app uses.
 * Read-only — does NOT trigger any OS permission dialog.
 *
 * For each permission:
 *   - Current status badge (Granted / Limited / Not yet asked / Denied / N/A)
 *   - Plain-language explanation of what it's used for
 *   - Recovery action for denied state (Open iPhone Settings)
 *   - Explanation of "Limited" for photos (iOS 14+ selected photos)
 *
 * Contextual note: permissions are only requested when the user enters the
 * feature that needs them — not on app open.
 */

import React, { useEffect } from 'react';
import {
  Camera, Image, MapPin, Mic, Bell,
  CheckCircle2, XCircle, AlertCircle, HelpCircle, RefreshCw,
  ExternalLink, Settings,
} from 'lucide-react';
import { useNativePermissions, type PermissionStatus } from '@/lib/useNativePermissions';
import { isNative } from '@/lib/capacitor-plugins';

// ── Open Settings deep-link ───────────────────────────────────────────────────

async function openIphoneSettings() {
  if (!isNative()) return;
  try {
    const cap = (window as {
      Capacitor?: { Plugins?: { App?: { openUrl: (o: { url: string }) => Promise<void> } } }
    }).Capacitor;
    await cap?.Plugins?.App?.openUrl({ url: 'app-settings:' });
  } catch { /* silent */ }
}

// ── Status badge ──────────────────────────────────────────────────────────────

interface BadgeProps { status: PermissionStatus }

function StatusBadge({ status }: BadgeProps) {
  if (status === 'checking') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-400">
        <RefreshCw size={10} className="animate-spin" />
        Checking…
      </span>
    );
  }
  if (status === 'granted') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700">
        <CheckCircle2 size={11} />
        Allowed
      </span>
    );
  }
  if (status === 'limited') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700">
        <AlertCircle size={11} />
        Limited
      </span>
    );
  }
  if (status === 'denied') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-600">
        <XCircle size={11} />
        Denied
      </span>
    );
  }
  if (status === 'prompt') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-600">
        <HelpCircle size={11} />
        Not yet asked
      </span>
    );
  }
  if (status === 'unavailable' || status === 'n/a') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-400">
        N/A
      </span>
    );
  }
  // 'unknown'
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-400">
      <HelpCircle size={11} />
      Unknown
    </span>
  );
}

// ── Permission row ────────────────────────────────────────────────────────────

interface PermRowProps {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  label: string;
  description: string;
  status: PermissionStatus;
  /** Extra note shown below description — used for 'limited' photos explanation */
  limitedNote?: string;
  /** When true, show "Open iPhone Settings" recovery button */
  showSettingsLink?: boolean;
}

function PermRow({
  icon, iconBg, iconColor, label, description, status,
  limitedNote, showSettingsLink,
}: PermRowProps) {
  const showSettings = showSettingsLink && (status === 'denied') && isNative();
  const showLimited  = status === 'limited' && limitedNote;

  return (
    <div className="flex items-start gap-3 py-4 border-b border-slate-100 last:border-0">
      {/* Icon */}
      <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center shrink-0 ${iconColor}`}>
        {icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <span className="text-sm font-semibold text-slate-800">{label}</span>
          <StatusBadge status={status} />
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">{description}</p>

        {/* Limited note */}
        {showLimited && (
          <p className="text-xs text-amber-700 mt-1.5 leading-relaxed bg-amber-50 rounded-lg px-2.5 py-1.5">
            {limitedNote}
          </p>
        )}

        {/* Denied recovery */}
        {showSettings && (
          <button
            onClick={() => void openIphoneSettings()}
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-violet-600 hover:text-violet-800 active:opacity-70 transition-colors"
          >
            <Settings size={12} />
            Open iPhone Settings
            <ExternalLink size={11} className="opacity-60" />
          </button>
        )}

        {/* Denied on web — no settings link, just explain */}
        {status === 'denied' && !isNative() && (
          <p className="text-xs text-red-600 mt-1.5">
            Access was denied in your browser. Check your browser's site permissions to re-enable.
          </p>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AppPermissionsTab() {
  const perms = useNativePermissions();

  // Re-check when the tab becomes visible (user may have just returned from Settings)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') perms.refresh();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [perms]);

  return (
    <div className="space-y-4">

      {/* Header card */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-bold text-slate-900">App Permissions</h2>
          <button
            onClick={perms.refresh}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-violet-600 active:opacity-70 transition-colors"
            title="Refresh permission status"
          >
            <RefreshCw size={13} />
            Refresh
          </button>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">
          Permissions are only requested when you use the feature that needs them — not when the app opens.
          If something is blocked, tap "Open iPhone Settings" to fix it.
        </p>
      </div>

      {/* Permission rows */}
      <div className="bg-white rounded-xl border border-slate-200 px-4 divide-y divide-slate-100">

        <PermRow
          icon={<Camera size={18} />}
          iconBg="bg-blue-50"
          iconColor="text-blue-500"
          label="Camera"
          description="Used when you take job photos, capture receipts, record incidents, or photograph site evidence. Asked the first time you open the camera."
          status={perms.camera}
          showSettingsLink
        />

        <PermRow
          icon={<Image size={18} />}
          iconBg="bg-purple-50"
          iconColor="text-purple-500"
          label="Photos"
          description="Used when you upload photos from your library, or when the camera saves a backup copy to your camera roll."
          status={perms.photos}
          showSettingsLink
          limitedNote="You've allowed access to selected photos only (iOS Limited Access). The photo picker still works, but you can only see the photos you explicitly allowed. To allow all photos, open iPhone Settings → IWIllBUIlD → Photos → All Photos."
        />

        <PermRow
          icon={<MapPin size={18} />}
          iconBg="bg-emerald-50"
          iconColor="text-emerald-500"
          label="Location"
          description="Used for drive sessions, fleet tracking, and site attendance records. Asked the first time you start a drive or use a location feature."
          status={perms.location}
          showSettingsLink
        />

        <PermRow
          icon={<Mic size={18} />}
          iconBg="bg-violet-50"
          iconColor="text-violet-600"
          label="Microphone"
          description="Used for voice notes and dictation where enabled. Only requested if you use a voice input feature."
          status={perms.microphone}
          showSettingsLink
        />

        <PermRow
          icon={<Bell size={18} />}
          iconBg="bg-amber-50"
          iconColor="text-amber-500"
          label="Notifications"
          description="Used to send job updates, reminders, and alerts — like when a job is assigned to you or an invoice is paid."
          status={perms.notifications}
          showSettingsLink
        />

      </div>

      {/* Contextual note — only shown on native */}
      {isNative() && (
        <div className="bg-slate-50 rounded-xl border border-slate-200 px-4 py-3">
          <p className="text-xs text-slate-500 leading-relaxed">
            <span className="font-semibold text-slate-600">Changed your mind?</span>{' '}
            Open iPhone Settings → IWIllBUIlD to update any permission at any time.
          </p>
        </div>
      )}

    </div>
  );
}
