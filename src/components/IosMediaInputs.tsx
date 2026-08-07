/**
 * IosMediaInputs
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders the two hidden file inputs (camera + library) and the optional
 * permission-denied banner for the useIosMediaPicker hook.
 *
 * Usage:
 *   const picker = useIosMediaPicker(handleFile);
 *
 *   return (
 *     <>
 *       <IosMediaInputs picker={picker} />
 *       {picker.permissionDenied && <IosPermissionBanner type={picker.permissionDenied} />}
 *       <button onClick={picker.openCamera}>Camera</button>
 *       <button onClick={picker.openLibrary}>Library</button>
 *     </>
 *   );
 */

import React from 'react';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import type { IosMediaPickerState } from '@/hooks/useIosMediaPicker';
import { isNative } from '@/lib/capacitor-plugins';

// ── Hidden inputs ─────────────────────────────────────────────────────────────

interface IosMediaInputsProps {
  picker: IosMediaPickerState & {
    _cameraInputRef: React.RefObject<HTMLInputElement>;
    _libraryInputRef: React.RefObject<HTMLInputElement>;
    _handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  };
  /** Extra accept types for the library picker (default: image/*) */
  accept?: string;
}

export function IosMediaInputs({ picker, accept = 'image/*' }: IosMediaInputsProps) {
  // On native (Capacitor) the camera input is never clicked directly — the
  // Capacitor Camera plugin handles capture. The input is only used on web.
  //
  // On web (including Safari PWA / Add to Home Screen):
  //   - With capture="environment": iOS forces the native camera app to open,
  //     bypassing our in-app UI and returning a file we can't process correctly.
  //   - Without capture: iOS shows the standard media picker sheet (Take Photo /
  //     Photo Library / Browse) which works correctly and lets users choose.
  //
  // So we intentionally omit `capture` on web — the standard picker is better UX
  // and the returned File goes through our normal processImage pipeline.
  return (
    <>
      {/* Camera input — NO capture attribute on web so iOS shows the standard
          media picker sheet instead of forcing the native camera app */}
      <input
        ref={picker._cameraInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        aria-hidden="true"
        onChange={picker._handleInputChange}
      />
      {/* Library input — no capture attribute so iOS shows the full picker */}
      <input
        ref={picker._libraryInputRef}
        type="file"
        accept={accept}
        className="hidden"
        aria-hidden="true"
        onChange={picker._handleInputChange}
      />
    </>
  );
}

// ── Permission denied banner ──────────────────────────────────────────────────

interface IosPermissionBannerProps {
  type: 'camera' | 'photos';
  onDismiss?: () => void;
}

export function IosPermissionBanner({ type, onDismiss }: IosPermissionBannerProps) {
  const label = type === 'camera' ? 'Camera' : 'Photo Library';
  const detail = type === 'camera'
    ? 'Camera access is required to take photos. Please allow it in Settings.'
    : 'Photo Library access is required to select photos. Please allow it in Settings.';

  async function openSettings() {
    if (isNative()) {
      try {
        // Use window.Capacitor.Plugins global — avoids Vite dynamic import resolution
        const cap = (window as {
          Capacitor?: { Plugins?: { App?: { openUrl: (opts: { url: string }) => Promise<void> } } }
        }).Capacitor;
        // 'app-settings:' is the iOS deep-link to the app's Settings page
        await cap?.Plugins?.App?.openUrl({ url: 'app-settings:' });
        return;
      } catch { /* fall through */ }
    }
    // Web fallback — nothing useful to open, just dismiss
    onDismiss?.();
  }

  return (
    <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-sm">
      <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-amber-800">{label} access denied</p>
        <p className="text-amber-700 text-xs mt-0.5 leading-snug">{detail}</p>
        {isNative() && (
          <button
            onClick={() => void openSettings()}
            className="mt-2 flex items-center gap-1 text-xs font-semibold text-amber-700 underline underline-offset-2"
          >
            Open Settings <ExternalLink size={11} />
          </button>
        )}
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="text-amber-400 hover:text-amber-600 transition-colors shrink-0 text-lg leading-none"
          aria-label="Dismiss"
        >
          ×
        </button>
      )}
    </div>
  );
}

// ── HEIC preview placeholder ──────────────────────────────────────────────────

/**
 * Shown when the selected file is HEIC/HEIF and cannot be previewed in WebView.
 */
export function HeicPreviewPlaceholder({ fileName }: { fileName?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 bg-slate-100 rounded-xl border border-slate-200 px-4 py-6 text-center">
      <div className="w-10 h-10 rounded-xl bg-slate-200 flex items-center justify-center">
        <span className="text-xs font-bold text-slate-500">HEIC</span>
      </div>
      <p className="text-sm font-semibold text-slate-700">Photo selected</p>
      {fileName && (
        <p className="text-xs text-slate-400 truncate max-w-[180px]">{fileName}</p>
      )}
      <p className="text-xs text-slate-400 leading-snug">
        Preview not available for HEIC photos — it will upload correctly.
      </p>
    </div>
  );
}
