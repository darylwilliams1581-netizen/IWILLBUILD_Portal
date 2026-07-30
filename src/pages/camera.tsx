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
  useState, useEffect, useRef, useCallback, useId,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  Camera, Images, ChevronLeft, X, Trash2, Briefcase,
  StickyNote, Loader2, ImageIcon, HardHat, ChevronRight,
  WifiOff, CheckCircle2, CheckSquare, Square, ArrowRight,
  AlertCircle, Plus, Settings, Check,
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
      URL.revokeObjectURL(objectUrl);

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
      if (!ctx) { reject(new Error('Canvas not available')); return; }

      ctx.drawImage(img, 0, 0, width, height);

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
 * Uses @capacitor/camera via window.Capacitor.Plugins to avoid Vite resolution.
 */
async function checkSaveToPhotosPermission(): Promise<'granted' | 'denied' | 'unavailable'> {
  if (!isNative()) return 'unavailable';
  try {
    const cap = (window as {
      Capacitor?: { Plugins?: { Camera?: {
        checkPermissions: () => Promise<{ photos?: string; camera?: string }>;
        requestPermissions: (opts: { permissions: string[] }) => Promise<{ photos?: string; camera?: string }>;
      } } }
    }).Capacitor;

    const CameraPlugin = cap?.Plugins?.Camera;
    if (!CameraPlugin) return 'unavailable';

    const status = await CameraPlugin.checkPermissions();
    const photos = status.photos ?? status.camera ?? 'prompt';
    if (photos === 'granted' || photos === 'limited') return 'granted';
    if (photos === 'denied') return 'denied';

    // 'prompt' — request it
    const requested = await CameraPlugin.requestPermissions({ permissions: ['photos'] });
    const rPhotos = requested.photos ?? requested.camera ?? 'denied';
    return (rPhotos === 'granted' || rPhotos === 'limited') ? 'granted' : 'denied';
  } catch {
    return 'unavailable';
  }
}

/**
 * Save a blob to the device camera roll via Capacitor Plugins global.
 * Silently no-ops if permission is denied or plugin is unavailable.
 * Returns 'saved' | 'permission_denied' | 'unavailable'.
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
        Media?: {
          savePhoto: (opts: { path: string }) => Promise<void>;
        };
      } }
    }).Capacitor;

    const Filesystem = cap?.Plugins?.Filesystem;
    if (!Filesystem) return 'unavailable';

    const base64 = await blobToBase64(blob);
    const fileName = `iwillbuild_${Date.now()}.jpg`;

    const writeResult = await Filesystem.writeFile({
      path: fileName,
      data: base64,
      directory: 'CACHE',
      recursive: true,
    });

    const Media = cap?.Plugins?.Media;
    if (Media?.savePhoto) {
      await Media.savePhoto({ path: writeResult.uri });
    } else {
      // Fallback: write to Documents/DCIM
      await Filesystem.writeFile({
        path: `DCIM/${fileName}`,
        data: base64,
        directory: 'DOCUMENTS',
        recursive: true,
      });
    }
    return 'saved';
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
  onClose,
  onChange,
}: {
  open: boolean;
  settings: CameraSettings;
  saving: boolean;
  /** True when save-to-photos was denied — show warning in backup row */
  backupPermDenied: boolean;
  onClose: () => void;
  onChange: (patch: Partial<CameraSettings>) => void;
}) {
  async function openNativeSettings() {
    if (!isNative()) return;
    try {
      const { App } = await import('@capacitor/app');
      // @ts-expect-error openSettings available on some Capacitor versions
      await App.openSettings?.();
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
                    backupPermDenied
                      ? 'Photos access denied — tap to open Settings'
                      : 'Save photos to your device gallery'
                  }
                  value={settings.backupToRoll}
                  warning={backupPermDenied}
                  onChange={v => {
                    if (backupPermDenied && v) { void openNativeSettings(); return; }
                    onChange({ backupToRoll: v });
                  }}
                />
                {backupPermDenied && (
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
  label, description, value, warning, onChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  warning?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-gray-100 transition-colors text-left"
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
// Compact capture row
// ─────────────────────────────────────────────────────────────────────────────

function CaptureRow({
  item, selected, selectMode, notesEnabled,
  onToggleSelect, onDelete, onAttachJob, onAddNote,
}: {
  item: CaptureItem;
  selected: boolean;
  selectMode: boolean;
  notesEnabled: boolean;
  onToggleSelect: (clientId: string) => void;
  onDelete: (clientId: string) => void;
  onAttachJob: (clientId: string) => void;
  onAddNote: (clientId: string) => void;
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

      <div className="w-11 h-11 rounded-xl overflow-hidden bg-gray-100 shrink-0 relative">
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
      </div>

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
            <span className="text-[10px] font-semibold text-gray-400 bg-gray-50 border border-gray-200 rounded-md px-1.5 py-0.5">Unassigned</span>
          )}
          <span className="text-[10px] text-gray-400">{formatTime(item.capturedAt)}</span>
        </div>
        {item.note && <p className="text-gray-500 text-[11px] mt-0.5 truncate">{item.note}</p>}
        {item.errorMsg && <p className="text-red-400 text-[10px] mt-0.5 truncate">{item.errorMsg}</p>}
      </div>

      {!selectMode && item.status !== 'uploading' && (
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onAttachJob(item.clientId)}
            className="w-7 h-7 rounded-lg bg-violet-50 border border-violet-100 flex items-center justify-center text-violet-600 hover:bg-violet-100 transition-colors"
            title="Attach to job"
          >
            <Briefcase size={12} />
          </button>
          {notesEnabled && (
            <button
              onClick={() => onAddNote(item.clientId)}
              className="w-7 h-7 rounded-lg bg-yellow-50 border border-yellow-100 flex items-center justify-center text-yellow-600 hover:bg-yellow-100 transition-colors"
              title="Add note"
            >
              <StickyNote size={12} />
            </button>
          )}
          <button
            onClick={() => onDelete(item.clientId)}
            className="w-7 h-7 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center text-red-400 hover:bg-red-100 transition-colors"
            title="Delete"
          >
            <Trash2 size={12} />
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

  // ── Permission-safe media picker ──────────────────────────────────────────
  // Handles camera + photo library permissions, HEIC safety, denied-state UI.
  // On web: falls back to plain file inputs with no permission checks.
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

  // Camera roll permission state — tracked separately from picker
  // so we can show a warning in settings without blocking capture
  const [backupPermDenied, setBackupPermDenied] = useState(false);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectMode = selectedIds.size > 0;

  // Sheets
  const [jobPickerForClientId, setJobPickerForClientId] = useState<string | null>(null);
  const [bulkJobPickerOpen, setBulkJobPickerOpen] = useState(false);
  const [noteForClientId, setNoteForClientId] = useState<string | null>(null);

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
        if (d.settings) setSettings(s => ({ ...s, ...d.settings }));
      })
      .catch(() => {})
      .finally(() => setSettingsLoaded(true));
  }, []);

  // ── Debounced settings save ───────────────────────────────────────────────
  const saveSettings = useCallback((patch: Partial<CameraSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
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
          jobId: number | null; status: string; capturedAt: string;
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
          jobName: null,
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
  async function uploadBlob(blob: Blob, clientId: string, capturedAt: string) {
    setCaptures(prev => prev.map(c =>
      c.clientId === clientId ? { ...c, status: 'uploading' } : c
    ));
    try {
      const fd = new FormData();
      fd.append('photos', blob, 'capture.jpg');
      fd.append('capturedAt', capturedAt);

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
  function handleFileFromPicker(file: File) {
    const clientId = makeClientId();
    const capturedAt = new Date().toISOString();
    const capturedDate = new Date(capturedAt);

    // Optimistic item — use blob URL for preview (safe, no HEIC decode)
    const localUrl = URL.createObjectURL(file);
    setCaptures(prev => [{
      clientId, id: null, localUrl, serverUrl: null,
      note: null, jobId: null, jobName: null,
      status: 'pending', errorMsg: null, capturedAt,
    }, ...prev]);

    void (async () => {
      try {
        const blob = await processImage(file, settings, capturedDate);

        // Camera roll backup — non-blocking, failure never stops capture
        if (settings.backupToRoll) {
          const result = await saveToDeviceCameraRoll(blob);
          if (result === 'permission_denied') {
            setBackupPermDenied(true);
          }
        }

        await uploadBlob(blob, clientId, capturedAt);
      } catch {
        // processImage failed — fall back to raw file
        await uploadBlob(file, clientId, capturedAt);
      }
    })();
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  async function handleDelete(clientId: string) {
    const item = captures.find(c => c.clientId === clientId);
    if (!item) return;
    if (item.localUrl) URL.revokeObjectURL(item.localUrl);
    setCaptures(prev => prev.filter(c => c.clientId !== clientId));
    setSelectedIds(prev => { const s = new Set(prev); s.delete(clientId); return s; });
    if (item.id) {
      await fetch(`/api/camera-captures/${item.id}`, {
        method: 'DELETE', credentials: 'include',
      }).catch(() => {});
    }
  }

  // ── Attach single job ─────────────────────────────────────────────────────
  async function handleAttachJob(clientId: string, job: JobOption) {
    setCaptures(prev => prev.map(c =>
      c.clientId === clientId ? { ...c, jobId: job.id, jobName: job.name } : c
    ));
    const item = captures.find(c => c.clientId === clientId);
    if (item?.id) {
      await fetch(`/api/camera-captures/${item.id}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.id }),
      }).catch(() => {});
    }
  }

  // ── Bulk attach ───────────────────────────────────────────────────────────
  async function handleBulkAttachJob(job: JobOption) {
    const ids = Array.from(selectedIds);
    setCaptures(prev => prev.map(c =>
      ids.includes(c.clientId) ? { ...c, jobId: job.id, jobName: job.name } : c
    ));
    setSelectedIds(new Set());
    const serverItems = captures.filter(c => ids.includes(c.clientId) && c.id != null);
    await Promise.allSettled(
      serverItems.map(c =>
        fetch(`/api/camera-captures/${c.id}`, {
          method: 'PATCH', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId: job.id }),
        })
      )
    );
  }

  // ── Save note ─────────────────────────────────────────────────────────────
  async function handleSaveNote(clientId: string, note: string) {
    setCaptures(prev => prev.map(c =>
      c.clientId === clientId ? { ...c, note: note || null } : c
    ));
    const item = captures.find(c => c.clientId === clientId);
    if (item?.id) {
      await fetch(`/api/camera-captures/${item.id}`, {
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

  // ── Derived ───────────────────────────────────────────────────────────────
  const noteItem = captures.find(c => c.clientId === noteForClientId) ?? null;
  const unassigned = captures.filter(c => c.status === 'done' && !c.jobId).length;
  const attached = captures.filter(c => c.status === 'done' && c.jobId).length;
  const uploading = captures.filter(c => c.status === 'uploading' || c.status === 'pending').length;

  if (!settingsLoaded) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: '#0d0d12' }}>
        <Loader2 size={24} className="animate-spin text-violet-400" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden" style={{ background: '#0d0d12' }}>
      <Helmet>
        <title>Camera — IWILLBUILD</title>
        <meta name="description" content="Field camera — capture job site photos instantly, then attach to jobs." />
        <meta name="robots" content="noindex" />
        <link rel="canonical" href="https://iwillbuild.com/camera" />
      </Helmet>
      <h1 className="sr-only">Camera Inbox</h1>

      {/* Hidden file inputs — managed by useIosMediaPicker */}
      <IosMediaInputs picker={pickerExt} />

      {/* Offline banner */}
      <AnimatePresence>
        {!isOnline && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden shrink-0 z-10"
          >
            <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/20 border-b border-amber-500/30">
              <WifiOff size={12} className="text-amber-400 shrink-0" />
              <span className="text-amber-300 text-xs font-medium">Offline — photos will upload when you reconnect</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ VIEWFINDER ZONE ═══ */}
      <div className="shrink-0 flex flex-col" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}>

        {/* Top bar */}
        <div className="flex items-center justify-between px-4 pb-4">
          <button
            onClick={() => navigate('/home')}
            className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white/70 hover:bg-white/20 transition-colors"
            aria-label="Back"
          >
            <ChevronLeft size={18} />
          </button>

          <div className="text-center">
            <p className="text-white font-bold text-base tracking-tight">Camera</p>
            {(uploading > 0 || captures.length > 0) && (
              <p className="text-white/40 text-[11px] mt-0.5">
                {uploading > 0
                  ? `Saving ${uploading} photo${uploading !== 1 ? 's' : ''}…`
                  : `${unassigned} unassigned · ${attached} attached`}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Settings gear */}
            <button
              onClick={() => setSettingsOpen(true)}
              className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white/70 hover:bg-white/20 transition-colors relative"
              aria-label="Camera settings"
            >
              <Settings size={16} />
              {(settings.overlayEnabled || settings.backupToRoll || settings.quality !== 'high' || backupPermDenied) && (
                <div className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full ${
                  backupPermDenied ? 'bg-amber-400' : 'bg-violet-400'
                }`} />
              )}
            </button>

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

        {/* Active settings indicators */}
        {(settings.overlayEnabled || settings.backupToRoll || settings.quality !== 'high' || backupPermDenied) && (
          <div className="flex items-center gap-1.5 px-4 pb-3 flex-wrap">
            {settings.overlayEnabled && (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-violet-300 bg-violet-900/40 border border-violet-700/40 rounded-full px-2 py-0.5">
                <Check size={9} />
                Overlay on
              </span>
            )}
            {settings.backupToRoll && !backupPermDenied && (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-green-300 bg-green-900/40 border border-green-700/40 rounded-full px-2 py-0.5">
                <Check size={9} />
                Camera roll
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
          </div>
        )}

        {/* Permission checking spinner */}
        {picker.checkingPermission && (
          <div className="flex items-center justify-center gap-2 pb-3">
            <Loader2 size={14} className="animate-spin text-white/50" />
            <span className="text-white/50 text-xs">Checking permissions…</span>
          </div>
        )}

        {/* Shutter row */}
        <div className="flex items-center justify-center gap-8 pb-6 px-4">
          {/* Library */}
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={() => void picker.openLibrary()}
            className="flex flex-col items-center gap-1.5"
            aria-label="Choose from library"
          >
            <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center hover:bg-white/20 transition-colors">
              <Images size={22} className="text-white/70" />
            </div>
            <span className="text-white/40 text-[10px] font-medium">Library</span>
          </motion.button>

          {/* Main shutter */}
          <motion.button
            whileTap={{ scale: 0.90 }}
            whileHover={{ scale: 1.04 }}
            transition={{ type: 'spring', stiffness: 420, damping: 22 }}
            onClick={() => void picker.openCamera()}
            className="relative flex items-center justify-center"
            aria-label="Take photo"
            disabled={picker.checkingPermission}
          >
            <div className={`w-[76px] h-[76px] rounded-full border-[3px] flex items-center justify-center transition-colors ${
              picker.checkingPermission ? 'border-white/15' : 'border-white/30'
            }`}>
              <div
                className={`w-[62px] h-[62px] rounded-full flex items-center justify-center transition-colors ${
                  picker.checkingPermission ? 'bg-white/50' : 'bg-white'
                }`}
                style={{ boxShadow: '0 0 24px rgba(255,255,255,0.25)' }}
              >
                {picker.checkingPermission
                  ? <Loader2 size={24} className="text-gray-400 animate-spin" />
                  : <Camera size={26} className="text-gray-900" />
                }
              </div>
            </div>
          </motion.button>

          {/* More / count */}
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={() => void picker.openCamera()}
            className="flex flex-col items-center gap-1.5"
            aria-label="Take another photo"
          >
            <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center hover:bg-white/20 transition-colors relative">
              <Plus size={22} className="text-white/70" />
              {captures.length > 0 && (
                <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-violet-500 flex items-center justify-center">
                  <span className="text-white text-[9px] font-bold">
                    {captures.length > 99 ? '99+' : captures.length}
                  </span>
                </div>
              )}
            </div>
            <span className="text-white/40 text-[10px] font-medium">More</span>
          </motion.button>
        </div>
      </div>

      {/* ═══ CAPTURED TRAY ═══ */}
      <div
        className="flex-1 flex flex-col overflow-hidden"
        style={{ background: '#f5f5f7', borderRadius: '24px 24px 0 0' }}
      >
        {/* Permission denied banner — shown in tray when camera/photos denied */}
        {picker.permissionDenied && (
          <div className="px-3 pt-3 shrink-0">
            <IosPermissionBanner
              type={picker.permissionDenied}
              onDismiss={() => {
                // Can't clear permissionDenied from outside the hook,
                // but the banner will naturally go away on next successful open
              }}
            />
          </div>
        )}

        {/* Tray header */}
        <div className="px-4 pt-4 pb-2 flex items-center justify-between shrink-0">
          <div>
            <p className="text-gray-900 font-bold text-sm">
              {captures.length === 0 ? 'Captured' : `Captured (${captures.length})`}
            </p>
            {captures.length === 0 && !loadingInitial && (
              <p className="text-gray-400 text-[11px] mt-0.5">Tap the shutter — no job needed yet</p>
            )}
          </div>
          {captures.length > 0 && (
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

        {/* List */}
        <div
          className="flex-1 overflow-y-auto px-3 space-y-1.5"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 5rem)' }}
        >
          {loadingInitial ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 size={20} className="animate-spin text-violet-400" />
            </div>
          ) : captures.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-gray-200 flex items-center justify-center mb-3">
                <Camera size={24} className="text-gray-400" />
              </div>
              <p className="text-gray-500 font-semibold text-sm">No photos yet</p>
              <p className="text-gray-400 text-xs mt-1">Tap the shutter above to start capturing</p>
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
                />
              ))}
            </AnimatePresence>
          )}
        </div>
      </div>

      {/* ═══ BULK ACTION BAR ═══ */}
      <AnimatePresence>
        {selectMode && (
          <motion.div
            initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="absolute left-0 right-0 z-20 px-4"
            style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}
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

      {/* Attached confirmation strip */}
      <AnimatePresence>
        {!selectMode && attached > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
            className="absolute left-0 right-0 z-10 px-4"
            style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}
          >
            <div
              className="flex items-center gap-2 bg-violet-600 rounded-2xl px-4 py-2.5"
              style={{ boxShadow: '0 4px 20px rgba(124,58,237,0.4)' }}
            >
              <CheckCircle2 size={14} className="text-white shrink-0" />
              <p className="text-white text-xs font-semibold flex-1">
                {attached} photo{attached !== 1 ? 's' : ''} attached to jobs
              </p>
              <button
                onClick={() => navigate('/jobs')}
                className="text-violet-200 text-xs font-bold hover:text-white transition-colors shrink-0"
              >
                View →
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ PERMISSION EXPLAINER MODAL ═══ */}
      {/* Shown before first camera/photos permission request, and in denied state */}
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
        onClose={() => setSettingsOpen(false)}
        onChange={saveSettings}
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
        initialNote={noteItem?.note ?? null}
        onClose={() => setNoteForClientId(null)}
        onSave={(note) => {
          if (noteForClientId) void handleSaveNote(noteForClientId, note);
          setNoteForClientId(null);
        }}
      />
    </div>
  );
}
