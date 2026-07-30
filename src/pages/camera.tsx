/**
 * /camera — Field Camera Module (Prompt 4: Permissions + Native Polish)
 *
 * Permission strategy:
 *   - Camera: checked via useIosMediaPicker before every shutter tap.
 *     First use shows PermissionExplainerModal (pre-prompt). Denied shows
 *     the denied variant with "Open iPhone Settings".
 *   - Photo Library: same flow via useIosMediaPicker for the Library button.
 *   - Save to Photos / Camera Roll: checked separately before backup.
 *     If denied or unavailable, backup is silently skipped — capture continues.
 *
 * Crash-safe rules:
 *   - All Capacitor plugin calls are wrapped in try/catch.
 *   - Plugins are accessed via window.Capacitor.Plugins (no dynamic imports
 *     that Vite would try to resolve at build time).
 *   - HEIC files are handled: no canvas decode attempted on HEIC.
 *   - Every async path that touches native APIs has a fallback.
 *
 * Settings (from Prompt 3) are loaded once on mount and applied to every
 * capture: quality resize, overlay burn, backup to camera roll.
 */

import {
  useState, useEffect, useRef, useCallback, memo,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  Camera, ChevronLeft, X, Trash2, Briefcase,
  StickyNote, Loader2, ImageIcon, HardHat, ChevronRight,
  WifiOff, CheckCircle2, CheckSquare, Square, ArrowRight,
  AlertCircle, Settings, Check, FolderOpen,
  Zap, ZapOff, FlipHorizontal2, Upload,
  Pencil, RotateCcw, RotateCw, Download, ZoomIn,
} from 'lucide-react';

import { useIosMediaPicker } from '@/hooks/useIosMediaPicker';
import { IosMediaInputs, IosPermissionBanner } from '@/components/IosMediaInputs';
import PermissionExplainerModal from '@/components/PermissionExplainerModal';
import { isNative } from '@/lib/capacitor-plugins';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type UploadStatus = 'pending' | 'uploading' | 'done' | 'error';

interface CaptureItem {
  clientId: string;
  id: number | null;
  localUrl: string | null;
  serverUrl: string | null;
  note: string | null;
  jobId: number | null;
  jobName: string | null;
  status: UploadStatus;
  errorMsg: string | null;
  capturedAt: string;
}

interface JobOption {
  id: number;
  name: string;
  jobNumber?: string | null;
}

export interface CameraSettings {
  backupToRoll: boolean;
  quality: 'low' | 'medium' | 'high';
  notesEnabled: boolean;
  overlayEnabled: boolean;
  overlayDateFormat: string;
  overlayTimeFormat: '24h' | '12h';
  overlayTextColor: 'white' | 'black';
  overlayFontSize: 10 | 12 | 14 | 16;
}

const DEFAULT_SETTINGS: CameraSettings = {
  backupToRoll: false,
  quality: 'high',
  notesEnabled: true,
  overlayEnabled: false,
  overlayDateFormat: 'dd MM yyyy',
  overlayTimeFormat: '24h',
  overlayTextColor: 'white',
  overlayFontSize: 12,
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

function makeClientId() {
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function formatOverlayDate(d: Date, fmt: string): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  return fmt
    .replace('dd', dd)
    .replace('MM', mm)
    .replace('yyyy', yyyy);
}

function formatOverlayTime(d: Date, fmt: '24h' | '12h'): string {
  if (fmt === '24h') {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  const h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(d.getMinutes()).padStart(2, '0')} ${ampm}`;
}

/**
 * Process a File through canvas: resize + optional overlay burn.
 * HEIC files are returned as-is (canvas cannot decode HEIC in WKWebView).
 */
async function processImage(
  file: File,
  settings: CameraSettings,
  capturedAt: Date,
): Promise<Blob> {
  // HEIC guard — WKWebView cannot decode HEIC in canvas; skip processing
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const isHeic = file.type.startsWith('image/heic') || file.type.startsWith('image/heif')
    || ext === 'heic' || ext === 'heif';
  if (isHeic) return file;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      // Draw BEFORE revoking — some iOS versions blank the canvas if the
      // objectUrl is revoked before drawImage completes
      const maxDim = settings.quality === 'low' ? 1280
        : settings.quality === 'medium' ? 2048
        : 4096;

      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Canvas not available'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // Safe to revoke now — drawImage has consumed the image data
      URL.revokeObjectURL(objectUrl);

      if (settings.overlayEnabled) {
        const fontSize = settings.overlayFontSize;
        const dateStr = formatOverlayDate(capturedAt, settings.overlayDateFormat);
        const timeStr = formatOverlayTime(capturedAt, settings.overlayTimeFormat);
        const stampText = `${dateStr}  ${timeStr}`;

        ctx.font = `bold ${fontSize}px 'Courier New', monospace`;
        ctx.textBaseline = 'bottom';

        const padding = Math.round(fontSize * 0.6);
        const textMetrics = ctx.measureText(stampText);
        const textW = textMetrics.width;
        const textH = fontSize;
        const x = width - textW - padding * 2;
        const y = height - padding;

        const bgAlpha = 0.55;
        ctx.fillStyle = settings.overlayTextColor === 'white'
          ? `rgba(0,0,0,${bgAlpha})`
          : `rgba(255,255,255,${bgAlpha})`;
        const pillPad = Math.round(fontSize * 0.35);
        const rx = x - pillPad;
        const ry = y - textH - pillPad;
        const rw = textW + pillPad * 2;
        const rh = textH + pillPad * 2;
        const r = Math.round(fontSize * 0.4);
        ctx.beginPath();
        ctx.moveTo(rx + r, ry);
        ctx.lineTo(rx + rw - r, ry);
        ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + r);
        ctx.lineTo(rx + rw, ry + rh - r);
        ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - r, ry + rh);
        ctx.lineTo(rx + r, ry + rh);
        ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - r);
        ctx.lineTo(rx, ry + r);
        ctx.quadraticCurveTo(rx, ry, rx + r, ry);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = settings.overlayTextColor === 'white' ? '#ffffff' : '#000000';
        ctx.fillText(stampText, x, y);
      }

      const jpegQuality = settings.quality === 'low' ? 0.72
        : settings.quality === 'medium' ? 0.84
        : 0.92;

      canvas.toBlob(
        (blob) => { if (blob) resolve(blob); else reject(new Error('Canvas toBlob failed')); },
        'image/jpeg',
        jpegQuality,
      );
    };

    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Image load failed')); };
    img.src = objectUrl;
  });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] ?? result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Check whether save-to-photos permission is available.
 * Returns 'granted' | 'denied' | 'unavailable'.
 * Uses @capacitor/camera via dynamic import (getCameraPlugin).
 */
async function checkSaveToPhotosPermission(): Promise<'granted' | 'denied' | 'unavailable'> {
  if (!isNative()) return 'unavailable';
  try {
    const { getCameraPlugin } = await import('@/lib/capacitor-plugins');
    const Camera = await getCameraPlugin();
    if (!Camera) return 'unavailable';

    const status = await Camera.checkPermissions();
    const photos = (status as { photos?: string }).photos
      ?? (status as { camera?: string }).camera
      ?? 'prompt';
    if (photos === 'granted' || photos === 'limited') return 'granted';
    if (photos === 'denied') return 'denied';

    // 'prompt' — request it
    const requested = await Camera.requestPermissions({ permissions: ['photos'] as never });
    const rPhotos = (requested as { photos?: string }).photos
      ?? (requested as { camera?: string }).camera
      ?? 'denied';
    return (rPhotos === 'granted' || rPhotos === 'limited') ? 'granted' : 'denied';
  } catch {
    return 'unavailable';
  }
}

/**
 * Save a blob to the device camera roll via @capacitor/camera savePhoto().
 *
 * Strategy:
 *   1. Write the JPEG blob to the Capacitor CACHE directory as a temp file.
 *   2. Call Camera.savePhoto({ path: uri }) — the correct @capacitor/camera API
 *      for saving to the iOS Photos library.
 *   3. If Camera.savePhoto is not available (plugin not synced to native project
 *      yet), return 'unavailable' — never pretend the save succeeded.
 *
 * Returns:
 *   'saved'            — photo is genuinely in the device camera roll
 *   'permission_denied'— user denied Photos access
 *   'unavailable'      — not on native, plugin missing, or save failed
 */
async function saveToDeviceCameraRoll(blob: Blob): Promise<'saved' | 'permission_denied' | 'unavailable'> {
  if (!isNative()) return 'unavailable';
  try {
    const perm = await checkSaveToPhotosPermission();
    if (perm === 'denied') return 'permission_denied';
    if (perm === 'unavailable') return 'unavailable';

    const cap = (window as {
      Capacitor?: { Plugins?: {
        Filesystem?: {
          writeFile: (opts: {
            path: string; data: string; directory: string; recursive?: boolean;
          }) => Promise<{ uri: string }>;
        };
        Camera?: {
          savePhoto?: (opts: { path: string }) => Promise<void>;
        };
      } }
    }).Capacitor;

    const Filesystem = cap?.Plugins?.Filesystem;
    if (!Filesystem) return 'unavailable';

    // Write to CACHE as a temp file — CACHE is writable and not user-visible
    const base64 = await blobToBase64(blob);
    const fileName = `iwillbuild_${Date.now()}.jpg`;
    const writeResult = await Filesystem.writeFile({
      path: fileName,
      data: base64,
      directory: 'CACHE',
      recursive: true,
    });

    // Use Camera.savePhoto() — the correct @capacitor/camera API for camera roll
    const CameraPlugin = cap?.Plugins?.Camera;
    if (CameraPlugin?.savePhoto) {
      await CameraPlugin.savePhoto({ path: writeResult.uri });
      return 'saved';
    }

    // savePhoto not available — the native project has not been synced with
    // @capacitor/camera yet (or the plugin version doesn't support savePhoto).
    // Do NOT fall back to writing to DOCUMENTS/DCIM — that is not the camera roll
    // and would silently mislead the user. Return unavailable so the UI is honest.
    console.warn('[camera-roll] Camera.savePhoto not available — run npx cap sync to register the plugin');
    return 'unavailable';
  } catch (e) {
    console.warn('[camera-roll] save failed:', e);
    return 'unavailable';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings sheet
// ─────────────────────────────────────────────────────────────────────────────

function SettingsSheet({
  open,
  settings,
  saving,
  backupPermDenied,
  backupUnavailable,
  onClose,
  onChange,
}: {
  open: boolean;
  settings: CameraSettings;
  saving: boolean;
  /** True when save-to-photos was denied — show warning in backup row */
  backupPermDenied: boolean;
  /**
   * True when Camera.savePhoto is not available in the current native build.
   * This means @capacitor/camera has been installed in JS but the native project
   * has not yet been synced (npx cap sync not run since install). The toggle is
   * shown as disabled with an honest explanation rather than pretending it works.
   */
  backupUnavailable: boolean;
  onClose: () => void;
  onChange: (patch: Partial<CameraSettings>) => void;
}) {
  async function openNativeSettings() {
    if (!isNative()) return;
    try {
      // Use window.Capacitor.Plugins global — avoids Vite dynamic import resolution
      const cap = (window as {
        Capacitor?: { Plugins?: { App?: { openUrl: (opts: { url: string }) => Promise<void> } } }
      }).Capacitor;
      await cap?.Plugins?.App?.openUrl({ url: 'app-settings:' });
    } catch { /* silent */ }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] bg-black/50"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 340 }}
            className="fixed bottom-0 left-0 right-0 z-[90] bg-white rounded-t-3xl flex flex-col"
            style={{ boxShadow: '0 -4px 40px rgba(0,0,0,0.18)', maxHeight: 'calc(100dvh - 5rem)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center">
                  <Settings size={15} className="text-gray-600" />
                </div>
                <div>
                  <p className="text-gray-900 font-bold text-sm">Camera Settings</p>
                  <p className="text-gray-400 text-[11px]">Applies to this device only</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {saving && <Loader2 size={13} className="animate-spin text-violet-400" />}
                <button onClick={onClose} className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-500">
                  <X size={14} />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 px-4 py-3 space-y-1"
              style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}
            >
              {/* Backup */}
              <SettingsSection label="Backup">
                <SettingsToggleRow
                  label="Back up to Camera Roll"
                  description={
                    backupUnavailable
                      ? 'Not available in this build — run cap sync'
                      : backupPermDenied
                      ? 'Photos access denied — tap to open Settings'
                      : 'Save photos to your device gallery'
                  }
                  value={settings.backupToRoll && !backupUnavailable}
                  warning={backupPermDenied}
                  disabled={backupUnavailable}
                  onChange={v => {
                    if (backupUnavailable) return;
                    if (backupPermDenied && v) { void openNativeSettings(); return; }
                    onChange({ backupToRoll: v });
                  }}
                />
                {backupUnavailable && (
                  <div className="mx-3 mb-2 flex items-start gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
                    <AlertCircle size={13} className="text-gray-400 shrink-0 mt-0.5" />
                    <p className="text-gray-500 text-[10px] leading-snug">
                      Camera roll backup requires <span className="font-mono font-semibold">npx cap sync</span> to be run after installing the camera plugin. This will be available in the next build.
                    </p>
                  </div>
                )}
                {!backupUnavailable && backupPermDenied && (
                  <div className="mx-3 mb-2 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                    <AlertCircle size={13} className="text-amber-500 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-amber-800 text-[11px] font-semibold">Photos access denied</p>
                      <p className="text-amber-700 text-[10px] mt-0.5">
                        Go to iPhone Settings → IWILLBUILD → Photos to allow saving.
                      </p>
                      {isNative() && (
                        <button
                          onClick={() => void openNativeSettings()}
                          className="mt-1.5 text-[11px] font-bold text-amber-700 underline underline-offset-2"
                        >
                          Open Settings →
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </SettingsSection>

              {/* Quality */}
              <SettingsSection label="Photo Quality">
                <SettingsSegmentRow
                  options={[
                    { value: 'low', label: 'Low' },
                    { value: 'medium', label: 'Med' },
                    { value: 'high', label: 'High' },
                  ]}
                  value={settings.quality}
                  onChange={v => onChange({ quality: v as CameraSettings['quality'] })}
                />
                <p className="text-gray-400 text-[10px] px-1 pb-1">
                  {settings.quality === 'low'
                    ? 'Max 1280px — smaller files, faster upload'
                    : settings.quality === 'medium'
                    ? 'Max 2048px — balanced quality and size'
                    : 'Max 4096px — full resolution, larger files'}
                </p>
              </SettingsSection>

              {/* Notes */}
              <SettingsSection label="Notes">
                <SettingsToggleRow
                  label="Enable notes on captures"
                  description="Show Add Note button on each photo"
                  value={settings.notesEnabled}
                  onChange={v => onChange({ notesEnabled: v })}
                />
              </SettingsSection>

              {/* Overlay */}
              <SettingsSection label="Camera Overlay">
                <SettingsToggleRow
                  label="Stamp date & time on photos"
                  description="Burned into the image — visible in any viewer"
                  value={settings.overlayEnabled}
                  onChange={v => onChange({ overlayEnabled: v })}
                />
                {settings.overlayEnabled && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-0.5 pt-1">
                      <SettingsSelectRow
                        label="Date format"
                        value={settings.overlayDateFormat}
                        options={[
                          { value: 'dd MM yyyy', label: 'DD MM YYYY' },
                          { value: 'MM/dd/yyyy', label: 'MM/DD/YYYY' },
                          { value: 'yyyy-MM-dd', label: 'YYYY-MM-DD' },
                        ]}
                        onChange={v => onChange({ overlayDateFormat: v })}
                      />
                      <SettingsSelectRow
                        label="Time format"
                        value={settings.overlayTimeFormat}
                        options={[
                          { value: '24h', label: '24 hour' },
                          { value: '12h', label: '12 hour (AM/PM)' },
                        ]}
                        onChange={v => onChange({ overlayTimeFormat: v as CameraSettings['overlayTimeFormat'] })}
                      />
                      <SettingsSelectRow
                        label="Text colour"
                        value={settings.overlayTextColor}
                        options={[
                          { value: 'white', label: 'White' },
                          { value: 'black', label: 'Black' },
                        ]}
                        onChange={v => onChange({ overlayTextColor: v as CameraSettings['overlayTextColor'] })}
                      />
                      <SettingsSelectRow
                        label="Font size"
                        value={String(settings.overlayFontSize)}
                        options={[
                          { value: '10', label: '10 pt' },
                          { value: '12', label: '12 pt' },
                          { value: '14', label: '14 pt' },
                          { value: '16', label: '16 pt' },
                        ]}
                        onChange={v => onChange({ overlayFontSize: Number(v) as CameraSettings['overlayFontSize'] })}
                      />
                      <OverlayPreview settings={settings} />
                    </div>
                  </motion.div>
                )}
              </SettingsSection>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ── Settings sub-components ───────────────────────────────────────────────────

function SettingsSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-gray-50 border border-gray-100 overflow-hidden">
      <div className="px-4 pt-3 pb-1">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{label}</p>
      </div>
      <div className="px-1 pb-2 space-y-0.5">{children}</div>
    </div>
  );
}

function SettingsToggleRow({
  label, description, value, warning, disabled, onChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  warning?: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => { if (!disabled) onChange(!value); }}
      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-colors text-left ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-100'
      }`}
      disabled={disabled}
    >
      <div className="flex-1 min-w-0 pr-3">
        <p className={`text-sm font-medium ${warning ? 'text-amber-700' : 'text-gray-900'}`}>{label}</p>
        {description && (
          <p className={`text-[11px] mt-0.5 ${warning ? 'text-amber-600' : 'text-gray-400'}`}>{description}</p>
        )}
      </div>
      <div className={`w-11 h-6 rounded-full transition-colors shrink-0 relative ${
        value ? (warning ? 'bg-amber-400' : 'bg-violet-600') : 'bg-gray-200'
      }`}>
        <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
          value ? 'translate-x-5' : 'translate-x-0.5'
        }`} />
      </div>
    </button>
  );
}

function SettingsSegmentRow({
  options, value, onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex gap-1 px-3 py-2">
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`flex-1 h-8 rounded-xl text-xs font-bold transition-colors ${
            value === opt.value ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function SettingsSelectRow({
  label, value, options, onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-gray-100 transition-colors">
      <p className="text-gray-700 text-sm">{label}</p>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="text-sm text-gray-900 font-semibold bg-transparent border-none focus:outline-none focus:ring-0 text-right cursor-pointer"
        onClick={e => e.stopPropagation()}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

function OverlayPreview({ settings }: { settings: CameraSettings }) {
  const now = new Date();
  const dateStr = formatOverlayDate(now, settings.overlayDateFormat);
  const timeStr = formatOverlayTime(now, settings.overlayTimeFormat);
  const stamp = `${dateStr}  ${timeStr}`;
  const fontSize = settings.overlayFontSize;
  return (
    <div className="mx-3 mb-2 rounded-xl overflow-hidden bg-gray-800 relative" style={{ height: 72 }}>
      <div className="absolute inset-0 opacity-40"
        style={{ background: 'linear-gradient(135deg, #374151 0%, #1f2937 100%)' }} />
      <div
        className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md"
        style={{
          background: settings.overlayTextColor === 'white' ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.55)',
          fontFamily: "'Courier New', monospace",
          fontSize: `${fontSize}px`,
          fontWeight: 'bold',
          color: settings.overlayTextColor === 'white' ? '#fff' : '#000',
          lineHeight: 1.4,
        }}
      >
        {stamp}
      </div>
      <p className="absolute top-2 left-3 text-white/40 text-[10px]">Preview</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Job picker sheet
// ─────────────────────────────────────────────────────────────────────────────

function JobPickerSheet({
  open, title = 'Attach to Job', onClose, onSelect,
}: {
  open: boolean;
  title?: string;
  onClose: () => void;
  onSelect: (job: JobOption) => void;
}) {
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!open) { setQ(''); return; }
    setLoading(true);
    fetch('/api/jobs?status=active&limit=200', { credentials: 'include' })
      .then(r => r.json())
      .then((d: { jobs?: JobOption[] } | JobOption[]) =>
        setJobs(Array.isArray(d) ? d : (d.jobs ?? [])))
      .catch(() => setJobs([]))
      .finally(() => setLoading(false));
  }, [open]);

  const filtered = q.trim()
    ? jobs.filter(j =>
        j.name.toLowerCase().includes(q.toLowerCase()) ||
        (j.jobNumber ?? '').toLowerCase().includes(q.toLowerCase()))
    : jobs;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] bg-black/50"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 340 }}
            className="fixed bottom-0 left-0 right-0 z-[90] bg-white rounded-t-3xl flex flex-col"
            style={{ boxShadow: '0 -4px 40px rgba(0,0,0,0.18)', maxHeight: 'calc(100dvh - 4rem)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-violet-100 flex items-center justify-center">
                  <Briefcase size={15} className="text-violet-600" />
                </div>
                <div>
                  <p className="text-gray-900 font-bold text-sm">{title}</p>
                  <p className="text-gray-400 text-[11px]">Active jobs</p>
                </div>
              </div>
              <button onClick={onClose} className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-500">
                <X size={14} />
              </button>
            </div>
            <div className="px-4 pt-3 pb-2 shrink-0">
              <input
                type="search"
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Search jobs…"
                className="w-full h-9 bg-gray-100 rounded-xl px-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-300"
              />
            </div>
            <div className="overflow-y-auto flex-1 px-4 pb-3 space-y-1.5">
              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 size={20} className="animate-spin text-violet-400" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-10">
                  <HardHat size={28} className="text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-400 text-sm">{q ? 'No matching jobs' : 'No active jobs found'}</p>
                </div>
              ) : filtered.map(job => (
                <button
                  key={job.id}
                  onClick={() => { onSelect(job); onClose(); }}
                  className="w-full flex items-center gap-3 bg-gray-50 border border-gray-200 hover:bg-violet-50 hover:border-violet-200 active:bg-violet-100 rounded-2xl px-4 py-3 text-left transition-colors"
                >
                  <div className="w-8 h-8 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
                    <HardHat size={14} className="text-violet-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-900 font-semibold text-sm truncate">{job.name}</p>
                    {job.jobNumber && <p className="text-gray-400 text-[11px] font-mono">{job.jobNumber}</p>}
                  </div>
                  <ChevronRight size={14} className="text-gray-300 shrink-0" />
                </button>
              ))}
            </div>
            <div className="shrink-0" style={{ height: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)' }} />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Note sheet
// ─────────────────────────────────────────────────────────────────────────────

function NoteSheet({
  open, initialNote, onClose, onSave,
}: {
  open: boolean;
  initialNote: string | null;
  onClose: () => void;
  onSave: (note: string) => void;
}) {
  const [text, setText] = useState(initialNote ?? '');
  useEffect(() => { if (open) setText(initialNote ?? ''); }, [open, initialNote]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] bg-black/50"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 340 }}
            className="fixed bottom-0 left-0 right-0 z-[90] bg-white rounded-t-3xl flex flex-col"
            style={{ boxShadow: '0 -4px 40px rgba(0,0,0,0.18)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-yellow-100 flex items-center justify-center">
                  <StickyNote size={15} className="text-yellow-500" />
                </div>
                <p className="text-gray-900 font-bold text-sm">{initialNote ? 'Edit Note' : 'Add Note'}</p>
              </div>
              <button onClick={onClose} className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-500">
                <X size={14} />
              </button>
            </div>
            <div className="px-4 py-4 flex flex-col gap-3">
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                rows={3}
                placeholder="Short note for this photo…"
                className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100 resize-none"
                autoFocus
              />
              <button
                onClick={() => { onSave(text.trim()); onClose(); }}
                className="w-full h-11 rounded-2xl bg-yellow-500 hover:bg-yellow-600 text-white font-bold text-sm transition-colors"
              >
                Save Note
              </button>
            </div>
            <div className="shrink-0" style={{ height: 'calc(env(safe-area-inset-bottom, 0px) + 0.5rem)' }} />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Capture edit modal — rotate, label, replace (mirrors JobPhotos EditModal)
// Works on camera_captures via /api/camera-captures/:id
// ─────────────────────────────────────────────────────────────────────────────

interface CaptureEditModalProps {
  item: CaptureItem;
  onClose: () => void;
  onSaved: (patch: Partial<CaptureItem>) => void;
}

function CaptureEditModal({ item, onClose, onSaved }: CaptureEditModalProps) {
  const [label, setLabel] = useState(item.note ?? '');
  const [saving, setSaving] = useState(false);
  const [rotating, setRotating] = useState<'left' | 'right' | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [error, setError] = useState('');
  const [localBust, setLocalBust] = useState(Date.now());
  const replaceRef = useRef<HTMLInputElement>(null);

  const imgUrl = item.serverUrl ?? item.localUrl;
  const bustedUrl = imgUrl ? `${imgUrl}${imgUrl.includes('?') ? '&' : '?'}v=${localBust}` : null;

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  async function doRotate(dir: 'left' | 'right') {
    if (!item.id) return;
    setRotating(dir); setError('');
    try {
      const res = await fetch(`/api/camera-captures/${item.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify({ rotate: dir }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Rotation failed');
      const bust = Date.now();
      setLocalBust(bust);
      onSaved({});
    } catch (e) { setError(e instanceof Error ? e.message : 'Rotation failed'); }
    finally { setRotating(null); }
  }

  async function doSave() {
    if (!item.id) { onClose(); return; }
    setSaving(true); setError('');
    try {
      const res = await fetch(`/api/camera-captures/${item.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify({ note: label || null }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Save failed');
      onSaved({ note: label || null });
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed'); }
    finally { setSaving(false); }
  }

  async function doReplace(file: File) {
    if (!item.id) return;
    setReplacing(true); setError('');
    try {
      const fd = new FormData(); fd.append('photo', file);
      const res = await fetch(`/api/camera-captures/${item.id}/replace`, {
        method: 'POST', credentials: 'include', body: fd,
      });
      const data = await res.json() as { ok?: boolean; capture?: { url: string }; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Replace failed');
      setLocalBust(Date.now());
      if (data.capture?.url) onSaved({ serverUrl: data.capture.url });
    } catch (e) { setError(e instanceof Error ? e.message : 'Replace failed'); }
    finally { setReplacing(false); if (replaceRef.current) replaceRef.current.value = ''; }
  }

  const busy = saving || rotating !== null || replacing;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="relative bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md flex flex-col"
        style={{ maxHeight: 'min(92dvh, 680px)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="sm:hidden flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-violet-100 flex items-center justify-center">
              <Pencil size={14} className="text-violet-600" />
            </div>
            <p className="text-gray-900 font-bold text-sm">Edit Photo</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-500">
            <X size={14} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 overscroll-contain">
          {/* Preview */}
          <div className="bg-gray-900 flex items-center justify-center" style={{ height: 'min(200px, 32dvh)' }}>
            {bustedUrl ? (
              <img
                key={localBust}
                src={bustedUrl}
                alt="Capture preview"
                className="max-w-full max-h-full object-contain"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            ) : (
              <div className="flex items-center justify-center w-full h-full">
                <ImageIcon size={32} className="text-gray-600" />
              </div>
            )}
          </div>

          {/* Rotate */}
          <div className="flex items-center justify-center gap-3 px-5 py-3 border-b border-gray-100 bg-gray-50">
            <span className="text-xs font-semibold text-gray-500 mr-1">Rotate:</span>
            <button onClick={() => doRotate('left')} disabled={busy || !item.id}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-100 text-xs font-semibold text-gray-700 disabled:opacity-40 transition-colors">
              {rotating === 'left' ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />} Left 90°
            </button>
            <button onClick={() => doRotate('right')} disabled={busy || !item.id}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-100 text-xs font-semibold text-gray-700 disabled:opacity-40 transition-colors">
              {rotating === 'right' ? <Loader2 size={13} className="animate-spin" /> : <RotateCw size={13} />} Right 90°
            </button>
          </div>

          {/* Fields */}
          <div className="px-5 py-4 flex flex-col gap-3">
            {!item.id && (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                <AlertCircle size={13} className="text-amber-500 shrink-0" />
                <p className="text-amber-700 text-xs">Photo is still uploading — rotate and replace will be available once it saves.</p>
              </div>
            )}
            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-2">
                <AlertCircle size={12} /> {error}
              </p>
            )}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Note / Caption</label>
              <input
                type="text"
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="e.g. North wall framing"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400 transition-colors"
                onKeyDown={e => { if (e.key === 'Enter' && !busy) void doSave(); }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-semibold text-gray-700">Replace photo</p>
              <p className="text-[11px] text-gray-400 leading-snug">Upload a new version to replace this photo in the inbox.</p>
              <button type="button" onClick={() => replaceRef.current?.click()} disabled={busy || !item.id}
                className="flex items-center gap-2 self-start mt-1 px-3 py-2 border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 text-sm font-semibold text-gray-700 rounded-xl transition-colors">
                {replacing ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                {replacing ? 'Replacing…' : 'Choose file to replace'}
              </button>
              <input ref={replaceRef} type="file" accept="image/*" className="hidden"
                onChange={e => { if (e.target.files?.[0]) void doReplace(e.target.files[0]); }} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between gap-2 px-5 py-4 border-t border-gray-100 bg-gray-50 shrink-0"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)' }}
        >
          {item.serverUrl ? (
            <a
              href={item.serverUrl}
              download="capture.jpg"
              className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 bg-white hover:bg-gray-100 text-sm font-semibold text-gray-600 rounded-xl transition-colors"
            >
              <Download size={13} /> Download
            </a>
          ) : <div />}
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} disabled={busy}
              className="px-4 py-2 text-sm font-semibold text-gray-500 hover:text-gray-700 disabled:opacity-40 transition-colors">
              Cancel
            </button>
            <button type="button" onClick={() => void doSave()} disabled={busy}
              className="flex items-center gap-1.5 px-5 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors">
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Capture lightbox — full-screen dark viewer with edit + delete actions
// ─────────────────────────────────────────────────────────────────────────────

interface CaptureLightboxProps {
  items: CaptureItem[];
  index: number;
  onClose: () => void;
  onNavigate: (i: number) => void;
  onEdit: (item: CaptureItem) => void;
  onDelete: (clientId: string) => void;
}

const CaptureLightbox = memo(function CaptureLightbox({
  items, index, onClose, onNavigate, onEdit, onDelete,
}: CaptureLightboxProps) {
  const item = items[index];
  const imgUrl = item?.serverUrl ?? item?.localUrl;

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && index > 0) onNavigate(index - 1);
      if (e.key === 'ArrowRight' && index < items.length - 1) onNavigate(index + 1);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [index, items.length, onClose, onNavigate]);

  if (!item) return null;

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/95">
      <div className="absolute inset-0 pointer-events-none" />

      {/* Top action bar */}
      <div
        className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 z-10 pointer-events-auto"
        style={{ paddingTop: 'calc(max(env(safe-area-inset-top, 0px), 44px) + 8px)', paddingBottom: '12px' }}
      >
        <button onClick={onClose}
          className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white/70 hover:bg-white/20 transition-colors"
          aria-label="Close">
          <X size={18} />
        </button>
        <div className="flex items-center gap-2">
          {item.id && (
            <button onClick={() => onEdit(item)}
              className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white/70 hover:bg-white/20 transition-colors"
              aria-label="Edit photo">
              <Pencil size={16} />
            </button>
          )}
          {item.serverUrl && (
            <a href={item.serverUrl} download="capture.jpg"
              className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white/70 hover:bg-white/20 transition-colors"
              aria-label="Download">
              <Download size={16} />
            </a>
          )}
          <button onClick={() => { onDelete(item.clientId); onClose(); }}
            className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-red-400 hover:bg-red-500/20 transition-colors"
            aria-label="Delete photo">
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Prev / Next */}
      {index > 0 && (
        <button onClick={() => onNavigate(index - 1)}
          className="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
          aria-label="Previous photo">
          <ChevronLeft size={22} />
        </button>
      )}
      {index < items.length - 1 && (
        <button onClick={() => onNavigate(index + 1)}
          className="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
          aria-label="Next photo">
          <ChevronRight size={22} />
        </button>
      )}

      {/* Image */}
      <div className="relative z-10 max-w-[92vw] max-h-[80dvh] flex flex-col items-center gap-3 pointer-events-none">
        {imgUrl ? (
          <img
            src={imgUrl}
            alt={item.note ?? 'Captured photo'}
            className="max-w-full max-h-[72dvh] object-contain rounded-xl shadow-2xl"
            loading="eager"
          />
        ) : (
          <div className="w-48 h-48 rounded-2xl bg-white/5 flex items-center justify-center">
            <ImageIcon size={40} className="text-white/20" />
          </div>
        )}
        {/* Caption strip */}
        <div className="text-center">
          {item.note && <p className="text-white font-semibold text-sm mb-0.5">{item.note}</p>}
          {item.jobName && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-300 bg-violet-900/50 border border-violet-700/40 rounded-full px-2.5 py-0.5">
              <Briefcase size={9} /> {item.jobName}
            </span>
          )}
          <p className="text-white/30 text-xs mt-1">{index + 1} / {items.length}</p>
        </div>
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Compact capture row
// ─────────────────────────────────────────────────────────────────────────────

function CaptureRow({
  item, selected, selectMode, notesEnabled,
  onToggleSelect, onDelete, onAttachJob, onAddNote, onTapPhoto,
}: {
  item: CaptureItem;
  selected: boolean;
  selectMode: boolean;
  notesEnabled: boolean;
  onToggleSelect: (clientId: string) => void;
  onDelete: (clientId: string) => void;
  onAttachJob: (clientId: string) => void;
  onAddNote: (clientId: string) => void;
  onTapPhoto: (clientId: string) => void;
}) {
  const imgUrl = item.serverUrl ?? item.localUrl;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -24, transition: { duration: 0.18 } }}
      className={`flex items-center gap-2.5 rounded-2xl px-2.5 py-2 transition-colors ${
        selected ? 'bg-violet-50 border border-violet-200' : 'bg-white border border-gray-100'
      }`}
      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
    >
      <button
        onClick={() => onToggleSelect(item.clientId)}
        className="shrink-0 w-5 h-5 flex items-center justify-center"
        aria-label={selected ? 'Deselect' : 'Select'}
      >
        {selected
          ? <CheckSquare size={16} className="text-violet-600" />
          : <Square size={16} className="text-gray-300" />}
      </button>

      {/* Thumbnail — tappable to open lightbox */}
      <button
        onClick={() => onTapPhoto(item.clientId)}
        className="w-11 h-11 rounded-xl overflow-hidden bg-gray-100 shrink-0 relative group"
        aria-label="View photo"
      >
        {imgUrl ? (
          <img src={imgUrl} alt="Captured" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon size={16} className="text-gray-300" />
          </div>
        )}
        {item.status === 'uploading' && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <Loader2 size={14} className="text-white animate-spin" />
          </div>
        )}
        {item.status === 'error' && (
          <div className="absolute inset-0 bg-red-900/50 flex items-center justify-center">
            <AlertCircle size={14} className="text-red-300" />
          </div>
        )}
        {item.status === 'done' && (
          <div className="absolute inset-0 bg-black/0 group-active:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-active:opacity-100">
            <ZoomIn size={14} className="text-white" />
          </div>
        )}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {item.status === 'uploading' && (
            <span className="text-[10px] font-semibold text-blue-500 bg-blue-50 border border-blue-100 rounded-md px-1.5 py-0.5">Saving…</span>
          )}
          {item.status === 'error' && (
            <span className="text-[10px] font-semibold text-red-500 bg-red-50 border border-red-100 rounded-md px-1.5 py-0.5">Failed</span>
          )}
          {item.status === 'done' && item.jobId && (
            <span className="text-[10px] font-semibold text-violet-600 bg-violet-50 border border-violet-100 rounded-md px-1.5 py-0.5 truncate max-w-[120px]">
              {item.jobName ?? 'Attached'}
            </span>
          )}
          {item.status === 'done' && !item.jobId && (
            <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-1.5 py-0.5">Needs job</span>
          )}
          <span className="text-[10px] text-gray-400">{formatTime(item.capturedAt)}</span>
        </div>
        {item.note && <p className="text-gray-500 text-[11px] mt-0.5 truncate">{item.note}</p>}
        {item.errorMsg && <p className="text-red-400 text-[10px] mt-0.5 truncate">{item.errorMsg}</p>}
      </div>

      {!selectMode && item.status !== 'uploading' && (
        <div className="flex items-center gap-1 shrink-0">
          {/* Assign to job */}
          <button
            onClick={() => onAttachJob(item.clientId)}
            className={`h-8 rounded-xl flex items-center gap-1 px-2 transition-colors ${
              item.jobId
                ? 'bg-violet-100 border border-violet-200 text-violet-700'
                : 'bg-violet-50 border border-violet-100 text-violet-600 hover:bg-violet-100'
            }`}
            title={item.jobId ? 'Change job' : 'Assign to job'}
            aria-label={item.jobId ? 'Change job assignment' : 'Assign to job'}
          >
            <Briefcase size={12} />
            <span className="text-[10px] font-bold">Job</span>
          </button>
          {notesEnabled && (
            <button
              onClick={() => onAddNote(item.clientId)}
              className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
                item.note
                  ? 'bg-yellow-100 border border-yellow-200 text-yellow-700'
                  : 'bg-yellow-50 border border-yellow-100 text-yellow-600 hover:bg-yellow-100'
              }`}
              title={item.note ? 'Edit note' : 'Add note'}
              aria-label={item.note ? 'Edit note' : 'Add note'}
            >
              <StickyNote size={13} />
            </button>
          )}
          {/* Edit photo — only available once uploaded */}
          {item.id && (
            <button
              onClick={() => onTapPhoto(item.clientId)}
              className="w-8 h-8 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-100 active:bg-gray-200 transition-colors"
              title="View / edit photo"
              aria-label="View or edit photo"
            >
              <Pencil size={13} />
            </button>
          )}
          <button
            onClick={() => onDelete(item.clientId)}
            className="w-8 h-8 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center text-red-400 hover:bg-red-100 active:bg-red-200 transition-colors"
            title="Delete photo"
            aria-label="Delete photo"
          >
            <Trash2 size={13} />
          </button>
        </div>
      )}
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function CameraPage() {
  const navigate = useNavigate();

  // Settings ref — keeps handleFileFromPicker stable while always reading
  // the latest settings. Required because the picker callback is passed to
  // useIosMediaPicker before settings state is declared.
  const settingsRef = useRef<CameraSettings>(DEFAULT_SETTINGS);

  // ── Permission-safe media picker ──────────────────────────────────────────
  const picker = useIosMediaPicker(handleFileFromPicker);
  const pickerExt = picker as typeof picker & {
    _cameraInputRef: React.RefObject<HTMLInputElement>;
    _libraryInputRef: React.RefObject<HTMLInputElement>;
    _handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  };

  const [captures, setCaptures] = useState<CaptureItem[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true);

  // Settings
  const [settings, setSettings] = useState<CameraSettings>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Camera roll permission state
  const [backupPermDenied, setBackupPermDenied] = useState(false);
  const [backupUnavailable, setBackupUnavailable] = useState(false);

  // ── Workflow B: active job (pre-selected before capture) ──────────────────
  // Stored in a ref so handleFileFromPicker always reads the latest value
  // without needing to be re-created on every job change.
  const [activeJob, setActiveJob] = useState<JobOption | null>(null);
  const activeJobRef = useRef<JobOption | null>(null);
  const [jobBarPickerOpen, setJobBarPickerOpen] = useState(false);

  function setActiveJobBoth(job: JobOption | null) {
    setActiveJob(job);
    activeJobRef.current = job;
  }

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectMode = selectedIds.size > 0;

  // Sheets
  const [jobPickerForClientId, setJobPickerForClientId] = useState<string | null>(null);
  const [bulkJobPickerOpen, setBulkJobPickerOpen] = useState(false);
  const [noteForClientId, setNoteForClientId] = useState<string | null>(null);

  // ── Lightbox + Edit ───────────────────────────────────────────────────────
  const [lightboxClientId, setLightboxClientId] = useState<string | null>(null);
  const [editClientId, setEditClientId] = useState<string | null>(null);

  const lightboxIndex = lightboxClientId
    ? captures.findIndex(c => c.clientId === lightboxClientId)
    : -1;
  const editItem = editClientId ? captures.find(c => c.clientId === editClientId) ?? null : null;

  // ── Network ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // ── Load settings ─────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/camera-settings', { credentials: 'include' })
      .then(r => r.json())
      .then((d: { settings?: CameraSettings }) => {
        if (d.settings) {
          const merged = { ...DEFAULT_SETTINGS, ...d.settings };
          setSettings(merged);
          settingsRef.current = merged;
        }
      })
      .catch(() => {})
      .finally(() => setSettingsLoaded(true));
  }, []);

  // ── Debounced settings save ───────────────────────────────────────────────
  const saveSettings = useCallback((patch: Partial<CameraSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      // Keep ref in sync so handleFileFromPicker always reads current settings
      settingsRef.current = next;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(async () => {
        setSettingsSaving(true);
        try {
          await fetch('/api/camera-settings', {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(next),
          });
        } catch { /* silently ignore */ }
        finally { setSettingsSaving(false); }
      }, 600);
      return next;
    });
  }, []);

  // ── Load existing captures ────────────────────────────────────────────────
  const loadCaptures = useCallback(async () => {
    try {
      const res = await fetch('/api/camera-captures', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json() as {
        captures: Array<{
          id: number; url: string; note: string | null;
          jobId: number | null; jobName: string | null;
          status: string; capturedAt: string;
        }>;
      };
      setCaptures(
        (data.captures ?? []).map(c => ({
          clientId: `srv_${c.id}`,
          id: c.id,
          localUrl: null,
          serverUrl: c.url,
          note: c.note,
          jobId: c.jobId,
          jobName: c.jobName,
          status: 'done' as UploadStatus,
          errorMsg: null,
          capturedAt: c.capturedAt,
        }))
      );
    } catch { /* silently ignore */ }
    finally { setLoadingInitial(false); }
  }, []);

  useEffect(() => { void loadCaptures(); }, [loadCaptures]);

  // ── Upload a single processed blob ───────────────────────────────────────
  async function uploadBlob(blob: Blob, clientId: string, capturedAt: string, jobId?: number | null) {
    setCaptures(prev => prev.map(c =>
      c.clientId === clientId ? { ...c, status: 'uploading' } : c
    ));
    try {
      const fd = new FormData();
      fd.append('photos', blob, 'capture.jpg');
      fd.append('capturedAt', capturedAt);
      if (jobId) fd.append('jobId', String(jobId));

      const res = await fetch('/api/camera-captures', {
        method: 'POST', credentials: 'include', body: fd,
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? 'Upload failed');
      }
      const d = await res.json() as { captures: Array<{ id: number; url: string }> };
      const saved = d.captures[0];

      setCaptures(prev => prev.map(c => {
        if (c.clientId !== clientId) return c;
        if (c.localUrl) URL.revokeObjectURL(c.localUrl);
        return { ...c, id: saved.id, serverUrl: saved.url, localUrl: null, status: 'done', errorMsg: null };
      }));
    } catch (e) {
      setCaptures(prev => prev.map(c =>
        c.clientId === clientId
          ? { ...c, status: 'error', errorMsg: e instanceof Error ? e.message : 'Upload failed' }
          : c
      ));
    }
  }

  // ── Handle a file from the picker (called by useIosMediaPicker) ───────────
  // Uses settingsRef.current and activeJobRef.current — not state — so this
  // function never closes over stale values even though it's defined before
  // those state declarations in the component body.
  function handleFileFromPicker(file: File) {
    const clientId = makeClientId();
    const capturedAt = new Date().toISOString();
    const capturedDate = new Date(capturedAt);
    const currentSettings = settingsRef.current;
    // Snapshot active job at capture time — offline-safe: stored on item,
    // sent to server when upload completes (or retried when back online)
    const job = activeJobRef.current;

    // Optimistic item — use blob URL for preview (safe, no HEIC decode)
    const localUrl = URL.createObjectURL(file);
    setCaptures(prev => [{
      clientId, id: null, localUrl, serverUrl: null,
      note: null,
      jobId: job?.id ?? null,
      jobName: job?.name ?? null,
      status: 'pending', errorMsg: null, capturedAt,
    }, ...prev]);

    void (async () => {
      try {
        const blob = await processImage(file, currentSettings, capturedDate);

        // Camera roll backup — non-blocking, failure never stops capture
        if (currentSettings.backupToRoll) {
          const result = await saveToDeviceCameraRoll(blob);
          if (result === 'permission_denied') {
            setBackupPermDenied(true);
          } else if (result === 'unavailable' && isNative()) {
            setBackupUnavailable(true);
          }
        }

        await uploadBlob(blob, clientId, capturedAt, job?.id ?? null);
      } catch {
        // processImage failed — fall back to raw file
        await uploadBlob(file, clientId, capturedAt, job?.id ?? null);
      }
    })();
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  async function handleDelete(clientId: string) {
    let serverId: number | null = null;
    let localUrl: string | null = null;
    setCaptures(prev => {
      const item = prev.find(c => c.clientId === clientId);
      serverId = item?.id ?? null;
      localUrl = item?.localUrl ?? null;
      return prev.filter(c => c.clientId !== clientId);
    });
    setSelectedIds(prev => { const s = new Set(prev); s.delete(clientId); return s; });
    if (localUrl) URL.revokeObjectURL(localUrl);
    if (serverId) {
      await fetch(`/api/camera-captures/${serverId}`, {
        method: 'DELETE', credentials: 'include',
      }).catch(() => {});
    }
  }

  // ── Attach single job ─────────────────────────────────────────────────────
  async function handleAttachJob(clientId: string, job: JobOption) {
    let serverId: number | null = null;
    setCaptures(prev => {
      const item = prev.find(c => c.clientId === clientId);
      serverId = item?.id ?? null;
      return prev.map(c =>
        c.clientId === clientId ? { ...c, jobId: job.id, jobName: job.name } : c
      );
    });
    if (serverId) {
      await fetch(`/api/camera-captures/${serverId}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.id }),
      }).catch(() => {});
    }
  }

  // ── Bulk attach ───────────────────────────────────────────────────────────
  async function handleBulkAttachJob(job: JobOption) {
    const ids = Array.from(selectedIds);
    // Snapshot current captures inside the state updater to avoid stale closure
    let serverItems: CaptureItem[] = [];
    setCaptures(prev => {
      serverItems = prev.filter(c => ids.includes(c.clientId) && c.id != null);
      return prev.map(c =>
        ids.includes(c.clientId) ? { ...c, jobId: job.id, jobName: job.name } : c
      );
    });
    setSelectedIds(new Set());
    // Fire PATCHes after state update — serverItems captured above
    setTimeout(async () => {
      await Promise.allSettled(
        serverItems.map(c =>
          fetch(`/api/camera-captures/${c.id}`, {
            method: 'PATCH', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobId: job.id }),
          })
        )
      );
    }, 0);
  }

  // ── Save note ─────────────────────────────────────────────────────────────
  async function handleSaveNote(clientId: string, note: string) {
    let serverId: number | null = null;
    setCaptures(prev => {
      const item = prev.find(c => c.clientId === clientId);
      serverId = item?.id ?? null;
      return prev.map(c =>
        c.clientId === clientId ? { ...c, note: note || null } : c
      );
    });
    if (serverId) {
      await fetch(`/api/camera-captures/${serverId}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: note || null }),
      }).catch(() => {});
    }
  }

  function toggleSelect(clientId: string) {
    setSelectedIds(prev => {
      const s = new Set(prev);
      if (s.has(clientId)) s.delete(clientId); else s.add(clientId);
      return s;
    });
  }

  // ── Edit saved callback ───────────────────────────────────────────────────
  function handleEditSaved(clientId: string, patch: Partial<CaptureItem>) {
    setCaptures(prev => prev.map(c =>
      c.clientId === clientId ? { ...c, ...patch } : c
    ));
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const unassigned = captures.filter(c => c.status === 'done' && !c.jobId).length;
  const attached = captures.filter(c => c.status === 'done' && c.jobId).length;
  const uploading = captures.filter(c => c.status === 'uploading' || c.status === 'pending').length;

  // ── Tray overlay state ────────────────────────────────────────────────────
  const [trayCollapsed, setTrayCollapsed] = useState(true);
  const prevCapturesLenRef = useRef(captures.length);

  // ── Flash / flip state (UI toggles — passed to native picker when supported) ─
  const [flashOn, setFlashOn] = useState(false);
  const [frontCamera, setFrontCamera] = useState(false);

  // Auto-expand tray when a new capture is added
  useEffect(() => {
    if (captures.length > prevCapturesLenRef.current) {
      setTrayCollapsed(false);
    }
    prevCapturesLenRef.current = captures.length;
  }, [captures.length]);

  if (!settingsLoaded) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: '#0d0d12' }}>
        <Loader2 size={24} className="animate-spin text-violet-400" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0" style={{ background: '#0d0d12' }}>
      <Helmet>
        <title>Camera — IWILLBUILD</title>
        <meta name="description" content="Field camera — capture job site photos instantly, then attach to jobs." />
        <meta name="robots" content="noindex" />
        <link rel="canonical" href="https://iwillbuild.com/camera" />
      </Helmet>
      <h1 className="sr-only">Camera Inbox</h1>

      {/* Hidden file inputs — managed by useIosMediaPicker */}
      <IosMediaInputs picker={pickerExt} />

      {/* ═══ FULL SCREEN DARK VIEWFINDER ═══ */}
      <div className="fixed inset-0 z-0 flex flex-col" style={{ background: '#0d0d12' }}>

        {/* Offline banner — top of screen below safe area */}
        <AnimatePresence>
          {!isOnline && (
            <motion.div
              initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden shrink-0 z-10"
              style={{
                paddingTop: 'env(safe-area-inset-top, 0px)',
                paddingLeft: 'env(safe-area-inset-left, 0px)',
                paddingRight: 'env(safe-area-inset-right, 0px)',
              }}
            >
              <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/20 border-b border-amber-500/30">
                <WifiOff size={12} className="text-amber-400 shrink-0" />
                <span className="text-amber-300 text-xs font-medium">Offline — photos will upload when you reconnect</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Top bar — respects safe areas on all sides (portrait notch top, landscape notch left/right) */}
        <div
          className="flex items-center justify-between shrink-0"
          style={{
            paddingTop: 'calc(max(env(safe-area-inset-top, 0px), 44px) + 12px)',
            paddingBottom: '12px',
            paddingLeft: 'calc(env(safe-area-inset-left, 0px) + 16px)',
            paddingRight: 'calc(env(safe-area-inset-right, 0px) + 16px)',
          }}
        >
          <button
            onClick={() => navigate('/home')}
            className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white/70 hover:bg-white/20 transition-colors"
            aria-label="Back"
          >
            <ChevronLeft size={18} />
          </button>

          <div className="flex flex-col items-center gap-1 min-w-0 flex-1 px-2">
            {/* Active job bar — Workflow B */}
            <button
              onClick={() => setJobBarPickerOpen(true)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 transition-colors max-w-full ${
                activeJob
                  ? 'bg-violet-600/30 border border-violet-500/50 text-violet-200'
                  : 'bg-white/8 border border-white/15 text-white/40 hover:bg-white/12'
              }`}
              aria-label={activeJob ? `Active job: ${activeJob.name}` : 'Select job for capture'}
            >
              <Briefcase size={11} className={activeJob ? 'text-violet-300 shrink-0' : 'text-white/30 shrink-0'} />
              <span className="text-[11px] font-semibold truncate max-w-[140px]">
                {activeJob ? activeJob.name : 'No job selected'}
              </span>
              {activeJob && (
                <button
                  onClick={e => { e.stopPropagation(); setActiveJobBoth(null); }}
                  className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-white/60 hover:bg-white/30 shrink-0 ml-0.5"
                  aria-label="Clear active job"
                >
                  <X size={9} />
                </button>
              )}
            </button>
            {/* Status subtitle */}
            {uploading > 0 && (
              <p className="text-white/40 text-[10px]">
                Saving {uploading} photo{uploading !== 1 ? 's' : ''}…
              </p>
            )}
            {uploading === 0 && unassigned > 0 && (
              <p className="text-amber-400/80 text-[10px]">
                {unassigned} need{unassigned === 1 ? 's' : ''} a job
              </p>
            )}
            {uploading === 0 && unassigned === 0 && attached > 0 && (
              <p className="text-white/25 text-[10px]">
                {attached} assigned
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Flash toggle */}
            <motion.button
              whileTap={{ scale: 0.88 }}
              onClick={() => setFlashOn(f => !f)}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                flashOn ? 'bg-amber-400/20 text-amber-300' : 'bg-white/10 text-white/50'
              }`}
              aria-label={flashOn ? 'Flash on' : 'Flash off'}
            >
              {flashOn ? <Zap size={16} /> : <ZapOff size={16} />}
            </motion.button>
            {/* Flip camera */}
            <motion.button
              whileTap={{ scale: 0.88 }}
              onClick={() => setFrontCamera(f => !f)}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                frontCamera ? 'bg-violet-400/20 text-violet-300' : 'bg-white/10 text-white/50'
              }`}
              aria-label={frontCamera ? 'Switch to rear camera' : 'Switch to front camera'}
            >
              <FlipHorizontal2 size={16} />
            </motion.button>
            {selectMode && (
              <button
                onClick={() => setSelectedIds(new Set())}
                className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white/70 hover:bg-white/20 transition-colors"
                aria-label="Clear selection"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Active settings pills */}
        <AnimatePresence>
          {(settings.overlayEnabled || settings.backupToRoll || settings.quality !== 'high' || backupPermDenied) && (
            <motion.div
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-1.5 px-4 pb-3 flex-wrap overflow-hidden shrink-0"
            >
              {settings.overlayEnabled && (
                <span className="flex items-center gap-1 text-[10px] font-semibold text-violet-300 bg-violet-900/40 border border-violet-700/40 rounded-full px-2 py-0.5">
                  <Check size={9} />
                  Overlay on
                </span>
              )}
              {settings.backupToRoll && !backupPermDenied && (
                <span className="flex items-center gap-1 text-[10px] font-semibold text-green-300 bg-green-900/40 border border-green-700/40 rounded-full px-2 py-0.5">
                  <Check size={9} />
                  Backup on
                </span>
              )}
              {settings.backupToRoll && backupPermDenied && (
                <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-300 bg-amber-900/40 border border-amber-700/40 rounded-full px-2 py-0.5">
                  <AlertCircle size={9} />
                  Backup unavailable
                </span>
              )}
              {settings.quality !== 'high' && (
                <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-300 bg-amber-900/40 border border-amber-700/40 rounded-full px-2 py-0.5">
                  {settings.quality === 'low' ? 'Low quality' : 'Med quality'}
                </span>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Permission checking spinner — centre of screen */}
        {picker.checkingPermission && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="flex items-center gap-2 bg-black/50 rounded-2xl px-4 py-3">
              <Loader2 size={16} className="animate-spin text-white/70" />
              <span className="text-white/70 text-xs font-medium">Checking permissions…</span>
            </div>
          </div>
        )}
      </div>

      {/* ═══ CAPTURED TRAY OVERLAY ═══ */}
      {/* z-20, fixed bottom-0, height 70dvh. Slides up/down via translateY */}
      <motion.div
        className="fixed bottom-0 left-0 right-0 z-20 flex flex-col bg-white rounded-t-3xl"
        style={{ height: '70dvh', boxShadow: '0 -4px 40px rgba(0,0,0,0.28)' }}
        animate={{ y: trayCollapsed ? 'calc(70dvh - 120px)' : '0px' }}
        transition={{ type: 'spring', damping: 32, stiffness: 340 }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0.12}
        onDragEnd={(_e, info) => {
          if (info.velocity.y < -40 || info.offset.y < -40) {
            setTrayCollapsed(false);
          } else if (info.velocity.y > 40 || info.offset.y > 40) {
            setTrayCollapsed(true);
          }
        }}
      >
        {/* Drag handle area — tapping toggles collapsed/expanded */}
        <button
          className="w-full flex flex-col items-center pt-3 pb-2 shrink-0 cursor-pointer"
          onClick={() => setTrayCollapsed(c => !c)}
          aria-label={trayCollapsed ? 'Expand captures tray' : 'Collapse captures tray'}
        >
          <div className="w-10 h-1 rounded-full bg-gray-200 mb-2" />
          {/* Count chip */}
          <div className="flex items-center gap-2">
            <span className="text-gray-700 font-bold text-sm">
              {captures.length === 0 ? 'Captured' : `${captures.length} photo${captures.length !== 1 ? 's' : ''}`}
            </span>
            {unassigned > 0 && (
              <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                {unassigned} need a job
              </span>
            )}
            {unassigned === 0 && attached > 0 && (
              <span className="text-[10px] font-bold text-green-600 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
                All assigned
              </span>
            )}
          </div>
        </button>

        {/* Permission denied banner */}
        {picker.permissionDenied && (
          <div className="px-3 pb-2 shrink-0">
            <IosPermissionBanner
              type={picker.permissionDenied}
              onDismiss={() => {
                // Banner clears naturally on next successful open
              }}
            />
          </div>
        )}

        {/* Tray header (select-all) */}
        <div className="px-4 pb-2 flex items-center justify-between shrink-0">
          <div>
            {captures.length > 0 && (
              <p className="text-gray-400 text-[11px]">
                {unassigned > 0
                  ? `${unassigned} need${unassigned === 1 ? 's' : ''} a job · ${attached} assigned`
                  : captures.length === 0
                  ? 'Tap the shutter — assign to a job later'
                  : `All ${attached} photo${attached !== 1 ? 's' : ''} assigned`}
              </p>
            )}
            {captures.length === 0 && !loadingInitial && (
              <p className="text-gray-400 text-[11px]">
                {activeJob ? `Tap the shutter — photos go to ${activeJob.name}` : 'Tap the shutter — assign to a job later'}
              </p>
            )}
          </div>
          {captures.length > 1 && (
            <button
              onClick={() => {
                if (selectedIds.size === captures.length) setSelectedIds(new Set());
                else setSelectedIds(new Set(captures.map(c => c.clientId)));
              }}
              className="text-[11px] font-semibold text-violet-600 hover:text-violet-800 transition-colors"
            >
              {selectedIds.size === captures.length ? 'Deselect all' : 'Select all'}
            </button>
          )}
        </div>

        {/* Scrollable list */}
        <div
          className="flex-1 overflow-y-auto px-3 space-y-1.5"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 120px)' }}
        >
          {loadingInitial ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 size={20} className="animate-spin text-violet-400" />
            </div>
          ) : captures.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center px-6">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                style={{ background: 'linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%)' }}
              >
                <Camera size={28} className="text-violet-400" />
              </div>
              <p className="text-gray-800 font-bold text-base">Ready to capture</p>
              <p className="text-gray-400 text-sm mt-1.5 leading-snug max-w-[220px]">
                {activeJob
                  ? `Photos will auto-attach to ${activeJob.name}. Tap the job pill above to change.`
                  : 'Tap the shutter to take a photo. Assign it to a job whenever you\'re ready — no rush.'}
              </p>
              <div className="mt-5 flex items-center gap-4">
                <div className="flex flex-col items-center gap-1">
                  <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center">
                    <Camera size={16} className="text-gray-400" />
                  </div>
                  <span className="text-[10px] text-gray-400 font-medium">Capture</span>
                </div>
                <ChevronRight size={12} className="text-gray-300" />
                <div className="flex flex-col items-center gap-1">
                  <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center">
                    <FolderOpen size={16} className="text-gray-400" />
                  </div>
                  <span className="text-[10px] text-gray-400 font-medium">Assign</span>
                </div>
                <ChevronRight size={12} className="text-gray-300" />
                <div className="flex flex-col items-center gap-1">
                  <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center">
                    <CheckCircle2 size={16} className="text-gray-400" />
                  </div>
                  <span className="text-[10px] text-gray-400 font-medium">Done</span>
                </div>
              </div>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {captures.map(item => (
                <CaptureRow
                  key={item.clientId}
                  item={item}
                  selected={selectedIds.has(item.clientId)}
                  selectMode={selectMode}
                  notesEnabled={settings.notesEnabled}
                  onToggleSelect={toggleSelect}
                  onDelete={handleDelete}
                  onAttachJob={(id) => setJobPickerForClientId(id)}
                  onAddNote={(id) => setNoteForClientId(id)}
                  onTapPhoto={(id) => setLightboxClientId(id)}
                />
              ))}
            </AnimatePresence>
          )}
        </div>
      </motion.div>

      {/* ═══ SHUTTER BAND ═══ */}
      {/* z-30 — always above tray */}
      <div
        className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-center gap-8"
        style={{
          height: 'calc(100px + env(safe-area-inset-bottom, 0px))',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          paddingLeft: 'env(safe-area-inset-left, 0px)',
          paddingRight: 'env(safe-area-inset-right, 0px)',
          background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
        }}
      >
        {/* Upload from library */}
        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={() => void picker.openLibrary()}
          className="flex flex-col items-center gap-1.5"
          aria-label="Upload from photo library"
          disabled={!settingsLoaded}
        >
          <div className="w-[58px] h-[58px] rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center active:bg-white/20 transition-colors">
            <Upload size={22} className="text-white/70" />
          </div>
          <span className="text-white/40 text-[10px] font-semibold tracking-wide">Upload</span>
        </motion.button>

        {/* Main shutter */}
        <motion.button
          whileTap={{ scale: 0.90 }}
          whileHover={{ scale: 1.03 }}
          transition={{ type: 'spring', stiffness: 420, damping: 22 }}
          onClick={() => void picker.openCamera()}
          className="relative flex items-center justify-center"
          aria-label="Take photo"
          disabled={picker.checkingPermission || !settingsLoaded}
        >
          <div className={`w-[80px] h-[80px] rounded-full border-[3px] flex items-center justify-center transition-colors ${
            (picker.checkingPermission || !settingsLoaded) ? 'border-white/15' : 'border-white/35'
          }`}>
            <div
              className={`w-[66px] h-[66px] rounded-full flex items-center justify-center transition-colors ${
                (picker.checkingPermission || !settingsLoaded) ? 'bg-white/50' : 'bg-white'
              }`}
              style={{ boxShadow: '0 0 28px rgba(255,255,255,0.22)' }}
            >
              {(picker.checkingPermission || !settingsLoaded)
                ? <Loader2 size={24} className="text-gray-400 animate-spin" />
                : <Camera size={28} className="text-gray-900" />
              }
            </div>
          </div>
        </motion.button>

        {/* Settings */}
        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={() => setSettingsOpen(true)}
          className="flex flex-col items-center gap-1.5"
          aria-label="Camera settings"
        >
          <div className="w-[58px] h-[58px] rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center active:bg-white/20 transition-colors relative">
            <Settings size={22} className="text-white/70" />
            {(settings.overlayEnabled || settings.backupToRoll || settings.quality !== 'high' || backupPermDenied) && (
              <div className={`absolute top-2 right-2 w-2 h-2 rounded-full ${
                backupPermDenied ? 'bg-amber-400' : 'bg-violet-400'
              }`} />
            )}
          </div>
          <span className="text-white/40 text-[10px] font-semibold tracking-wide">Settings</span>
        </motion.button>
      </div>

      {/* ═══ BULK ACTION BAR ═══ */}
      {/* z-25 — above tray (z-20), below shutter band (z-30) */}
      <AnimatePresence>
        {selectMode && (
          <motion.div
            initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="fixed left-0 right-0 px-4"
            style={{
              bottom: 'calc(100px + env(safe-area-inset-bottom, 0px) + 0.5rem)',
              zIndex: 25,
            }}
          >
            <div
              className="flex items-center gap-3 bg-gray-900 rounded-2xl px-4 py-3"
              style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.35)' }}
            >
              <div className="flex-1">
                <p className="text-white font-bold text-sm">{selectedIds.size} selected</p>
                <p className="text-white/40 text-[11px]">Choose an action</p>
              </div>
              <button
                onClick={() => setBulkJobPickerOpen(true)}
                className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl px-3.5 py-2 text-xs font-bold transition-colors"
              >
                <Briefcase size={12} />
                Move to Job
                <ArrowRight size={11} />
              </button>
              <button
                onClick={async () => {
                  const ids = Array.from(selectedIds);
                  setSelectedIds(new Set());
                  for (const cid of ids) await handleDelete(cid);
                }}
                className="w-8 h-8 rounded-xl bg-red-500/20 flex items-center justify-center text-red-400 hover:bg-red-500/30 transition-colors"
                aria-label="Delete selected"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ PERMISSION EXPLAINER MODAL ═══ */}
      {picker.explainer && (
        <PermissionExplainerModal
          type={picker.explainer.type}
          open
          denied={picker.explainer.denied}
          onNotNow={picker.explainer.onNotNow}
          onEnable={() => void picker.explainer!.onEnable()}
        />
      )}

      {/* ═══ SHEETS ═══ */}
      <SettingsSheet
        open={settingsOpen}
        settings={settings}
        saving={settingsSaving}
        backupPermDenied={backupPermDenied}
        backupUnavailable={backupUnavailable}
        onClose={() => setSettingsOpen(false)}
        onChange={saveSettings}
      />

      {/* Job bar picker — Workflow B: select job before capture */}
      <JobPickerSheet
        open={jobBarPickerOpen}
        title="Capture to Job"
        onClose={() => setJobBarPickerOpen(false)}
        onSelect={(job) => {
          setActiveJobBoth(job);
          setJobBarPickerOpen(false);
        }}
      />

      <JobPickerSheet
        open={jobPickerForClientId !== null}
        title="Attach to Job"
        onClose={() => setJobPickerForClientId(null)}
        onSelect={(job) => {
          if (jobPickerForClientId) void handleAttachJob(jobPickerForClientId, job);
          setJobPickerForClientId(null);
        }}
      />

      <JobPickerSheet
        open={bulkJobPickerOpen}
        title={`Move ${selectedIds.size} photo${selectedIds.size !== 1 ? 's' : ''} to Job`}
        onClose={() => setBulkJobPickerOpen(false)}
        onSelect={(job) => {
          void handleBulkAttachJob(job);
          setBulkJobPickerOpen(false);
        }}
      />

      <NoteSheet
        open={noteForClientId !== null}
        initialNote={captures.find(c => c.clientId === noteForClientId)?.note ?? null}
        onClose={() => setNoteForClientId(null)}
        onSave={(note) => {
          if (noteForClientId) void handleSaveNote(noteForClientId, note);
          setNoteForClientId(null);
        }}
      />

      {/* ═══ LIGHTBOX ═══ */}
      <AnimatePresence>
        {lightboxClientId !== null && lightboxIndex >= 0 && (
          <motion.div
            key="lightbox"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <CaptureLightbox
              items={captures}
              index={lightboxIndex}
              onClose={() => setLightboxClientId(null)}
              onNavigate={(i) => setLightboxClientId(captures[i]?.clientId ?? null)}
              onEdit={(item) => {
                setLightboxClientId(null);
                setEditClientId(item.clientId);
              }}
              onDelete={(clientId) => {
                void handleDelete(clientId);
                setLightboxClientId(null);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ EDIT MODAL ═══ */}
      <AnimatePresence>
        {editItem && (
          <CaptureEditModal
            key={editItem.clientId}
            item={editItem}
            onClose={() => setEditClientId(null)}
            onSaved={(patch) => {
              if (editClientId) handleEditSaved(editClientId, patch);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
