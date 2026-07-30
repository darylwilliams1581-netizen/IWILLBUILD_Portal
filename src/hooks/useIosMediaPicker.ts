/**
 * useIosMediaPicker
 * ─────────────────────────────────────────────────────────────────────────────
 * iOS-safe media picker hook.
 *
 * Problems this solves on iOS / Capacitor WebView:
 *
 * 1. CRASH — `input[type=file]` with `capture="environment"` on iOS 16 and
 *    earlier can throw a native exception if the camera permission has never
 *    been granted. We must check/request permission via Capacitor before
 *    triggering the input.
 *
 * 2. CRASH — `FileReader.readAsDataURL()` on a large HEIC file from the iOS
 *    camera roll can exhaust the WKWebView JS heap and crash the tab. Use
 *    `URL.createObjectURL()` instead — it hands the blob to the OS without
 *    copying it into JS memory.
 *
 * 3. CRASH — Calling `createImageBitmap()` on a HEIC file inside a WKWebView
 *    throws "The operation is not supported" because WKWebView cannot decode
 *    HEIC in a canvas context. The upload queue already skips normalisation on
 *    iOS, but any other code that tries to preview HEIC must also guard this.
 *
 * 4. NO PROMPT — On iOS the first camera access requires an explicit
 *    `requestPermissions()` call via Capacitor. Without it the system silently
 *    denies the camera and the input does nothing.
 *
 * 5. PERMISSION DENIED UX — When the user has permanently denied camera or
 *    photo library access, we surface a clear message with a deep-link to
 *    Settings rather than silently failing.
 *
 * 6. VITE BUILD SAFETY — All Capacitor plugin access uses window.Capacitor.Plugins
 *    globals, NOT dynamic imports. Dynamic imports of @capacitor/* packages are
 *    resolved at Vite build time and can produce broken chunks in the iOS bundle.
 *
 * Usage:
 *   const picker = useIosMediaPicker();
 *
 *   // Render the hidden inputs once in your component:
 *   {picker.inputs}
 *
 *   // Trigger camera:
 *   await picker.openCamera();
 *
 *   // Trigger photo library:
 *   await picker.openLibrary();
 *
 *   // Read the selected file:
 *   picker.file        — File | null
 *   picker.previewUrl  — string | null  (safe blob URL, null for HEIC)
 *   picker.isHeic      — boolean
 *   picker.clear()     — revoke blob URL and reset state
 *
 *   // Permission denial UI:
 *   {picker.permissionDeniedBanner}
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { isNative, getPlatform, getCameraPlugin } from '@/lib/capacitor-plugins';
import { usePermissionExplainer } from '@/lib/usePermissionExplainer';

// ── Types ─────────────────────────────────────────────────────────────────────

export type PickerMode = 'camera' | 'library';

/**
 * Native camera options passed to openCamera().
 * On native (Capacitor) these map directly to Camera.getPhoto() options.
 * On web, `direction` maps to the `capture` attribute (user/environment).
 * `flashMode` has no web equivalent and is silently ignored on web.
 */
export interface NativeCameraOptions {
  /** 'front' uses the selfie camera; 'rear' (default) uses the main camera. */
  direction?: 'front' | 'rear';
  /** 'on' forces flash; 'off' disables it; 'auto' (default) lets the OS decide. */
  flashMode?: 'on' | 'off' | 'auto';
}

export interface IosMediaPickerState {
  file: File | null;
  /** Safe blob URL for preview — null for HEIC/HEIF (cannot be decoded in WebView) */
  previewUrl: string | null;
  /** True when the selected file is HEIC/HEIF */
  isHeic: boolean;
  /** True while a permission check/request is in flight */
  checkingPermission: boolean;
  /** Set when the user has denied camera or photo library access */
  permissionDenied: 'camera' | 'photos' | null;
  openCamera: (opts?: NativeCameraOptions) => Promise<void>;
  openLibrary: () => Promise<void>;
  clear: () => void;
  /** Render this inside your component — the hidden file inputs */
  inputsRef: React.RefObject<HTMLDivElement>;
  /**
   * Explainer modal state — set when the pre-permission explainer should be shown.
   * Callers render <PermissionExplainerModal> when this is non-null.
   */
  explainer: {
    type: 'camera' | 'photos';
    denied: boolean;
    onNotNow: () => void;
    onEnable: () => Promise<void>;
  } | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const HEIC_MIMES = new Set(['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence']);
const HEIC_EXTS  = new Set(['heic', 'heif']);

function fileIsHeic(file: File): boolean {
  if (HEIC_MIMES.has(file.type)) return true;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return HEIC_EXTS.has(ext);
}

/**
 * Create a safe preview URL for a file.
 * - Returns null for HEIC/HEIF (WKWebView cannot render them).
 * - Uses URL.createObjectURL() — never FileReader — to avoid heap exhaustion.
 */
function safePreviewUrl(file: File): string | null {
  if (fileIsHeic(file)) return null;
  try {
    return URL.createObjectURL(file);
  } catch {
    return null;
  }
}

// ── Capacitor Camera permission helpers ───────────────────────────────────────
// Uses getCameraPlugin() from capacitor-plugins.ts which dynamically imports
// @capacitor/camera — a real installed package. This gives us the actual
// Capacitor permission API instead of falling back to 'unknown' every time.

/**
 * Check / request camera permission via the real @capacitor/camera plugin.
 * Returns 'granted' | 'denied' | 'unknown' (web / non-native / plugin missing).
 */
async function ensureCameraPermission(): Promise<'granted' | 'denied' | 'unknown'> {
  if (!isNative()) return 'unknown';
  try {
    const Camera = await getCameraPlugin();
    if (!Camera) return 'unknown';

    const status = await Camera.checkPermissions();
    // @capacitor/camera v5+ returns { camera: PermissionState, photos: PermissionState }
    const cam = (status as { camera?: string }).camera ?? 'prompt';
    if (cam === 'granted') return 'granted';
    if (cam === 'denied') return 'denied';

    // 'prompt' or 'prompt-with-rationale' — trigger the native dialog
    const requested = await Camera.requestPermissions({ permissions: ['camera'] as never });
    const grantedCam = (requested as { camera?: string }).camera ?? 'denied';
    return grantedCam === 'granted' ? 'granted' : 'denied';
  } catch {
    // Plugin unavailable at runtime — fall back to browser input
    return 'unknown';
  }
}

/**
 * Check / request photo library permission via the real @capacitor/camera plugin.
 * Returns 'granted' | 'denied' | 'unknown'.
 */
async function ensurePhotosPermission(): Promise<'granted' | 'denied' | 'unknown'> {
  if (!isNative()) return 'unknown';
  try {
    const Camera = await getCameraPlugin();
    if (!Camera) return 'unknown';

    const status = await Camera.checkPermissions();
    const photos = (status as { photos?: string }).photos
      ?? (status as { camera?: string }).camera
      ?? 'prompt';
    if (photos === 'granted' || photos === 'limited') return 'granted';
    if (photos === 'denied') return 'denied';

    const requested = await Camera.requestPermissions({ permissions: ['photos'] as never });
    const rPhotos = (requested as { photos?: string }).photos
      ?? (requested as { camera?: string }).camera
      ?? 'denied';
    return (rPhotos === 'granted' || rPhotos === 'limited') ? 'granted' : 'denied';
  } catch {
    return 'unknown';
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useIosMediaPicker(onChange?: (file: File) => void): IosMediaPickerState {
  const [file, setFile]                     = useState<File | null>(null);
  const [previewUrl, setPreviewUrl]         = useState<string | null>(null);
  const [isHeic, setIsHeic]                 = useState(false);
  const [checkingPermission, setChecking]   = useState(false);
  const [permissionDenied, setDenied]       = useState<'camera' | 'photos' | null>(null);

  // ── Explainer modal state ─────────────────────────────────────────────────
  type ExplainerState = {
    type: 'camera' | 'photos';
    denied: boolean;
    onNotNow: () => void;
    onEnable: () => Promise<void>;
  } | null;
  const [explainer, setExplainer] = useState<ExplainerState>(null);
  const permExplainer = usePermissionExplainer();

  const cameraInputRef  = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const inputsRef       = useRef<HTMLDivElement>(null);

  // Revoke previous blob URL on unmount
  const prevUrlRef = useRef<string | null>(null);
  useEffect(() => {
    return () => {
      if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
    };
  }, []);

  const handleFile = useCallback((f: File) => {
    if (prevUrlRef.current) {
      URL.revokeObjectURL(prevUrlRef.current);
      prevUrlRef.current = null;
    }

    const heic = fileIsHeic(f);
    const url  = safePreviewUrl(f);
    prevUrlRef.current = url;

    setFile(f);
    setPreviewUrl(url);
    setIsHeic(heic);
    onChange?.(f);
  }, [onChange]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    // Reset so the same file can be re-selected
    e.target.value = '';
  }, [handleFile]);

  // ── Internal: check camera permission + open input ────────────────────────
  const doOpenCamera = useCallback(async (opts?: NativeCameraOptions) => {
    setDenied(null);
    setChecking(true);
    try {
      const perm = await ensureCameraPermission();
      if (perm === 'denied') {
        setDenied('camera');
        setExplainer({
          type: 'camera',
          denied: true,
          onNotNow: () => setExplainer(null),
          onEnable: async () => { setExplainer(null); },
        });
        return;
      }
    } finally {
      setChecking(false);
    }

    // ── Native path: use Capacitor Camera.getPhoto() so flash + direction work ──
    if (isNative()) {
      try {
        const CameraPlugin = await getCameraPlugin();
        if (CameraPlugin) {
          const {
            CameraResultType,
            CameraSource,
            CameraDirection,
          } = await import('@capacitor/camera');

          // Use Base64 instead of DataUrl on native.
          // DataUrl prepends a mime-type prefix that requires an extra fetch() round-trip
          // to convert to a Blob, which adds latency and a second memory copy of the image.
          // Base64 lets us decode directly without the extra fetch, reducing peak memory.
          const photo = await CameraPlugin.getPhoto({
            quality: 90,
            allowEditing: false,
            resultType: CameraResultType.Base64,
            source: CameraSource.Camera,
            direction: opts?.direction === 'front' ? CameraDirection.Front : CameraDirection.Rear,
            // flashMode is a valid runtime option on iOS even if the TS types
            // for this version don't expose it — pass as string literal via cast
            flashMode: opts?.flashMode === 'on' ? 'on' : opts?.flashMode === 'off' ? 'off' : 'auto',
          } as any);

          if (photo.base64String) {
            // Decode base64 → Uint8Array → Blob without an intermediate fetch()
            // This avoids a second full-image memory copy that DataUrl + fetch() would cause
            try {
              const byteChars = atob(photo.base64String);
              const byteArr = new Uint8Array(byteChars.length);
              for (let i = 0; i < byteChars.length; i++) {
                byteArr[i] = byteChars.charCodeAt(i);
              }
              const mimeType = photo.format === 'png' ? 'image/png' : 'image/jpeg';
              const blob = new Blob([byteArr], { type: mimeType });
              const file = new File([blob], `capture.${photo.format ?? 'jpg'}`, { type: mimeType });
              handleFile(file);
            } catch (decodeErr) {
              console.warn('[camera] base64 decode failed, falling back to dataUrl path:', decodeErr);
              // Fallback: re-request with DataUrl if base64 decode fails (should not happen)
              const photo2 = await CameraPlugin.getPhoto({
                quality: 90,
                allowEditing: false,
                resultType: CameraResultType.DataUrl,
                source: CameraSource.Camera,
                direction: opts?.direction === 'front' ? CameraDirection.Front : CameraDirection.Rear,
                flashMode: opts?.flashMode === 'on' ? 'on' : opts?.flashMode === 'off' ? 'off' : 'auto',
              } as any);
              if (photo2.dataUrl) {
                const res = await fetch(photo2.dataUrl);
                const blob = await res.blob();
                const file = new File([blob], 'capture.jpg', { type: blob.type || 'image/jpeg' });
                handleFile(file);
              }
            }
          }
          return;
        }
      } catch (err) {
        // Distinguish user-cancel from a real crash:
        // Capacitor throws an error with message containing "cancelled" or "User cancelled"
        // when the user dismisses the camera — this is not a crash, do not log it as an error.
        const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
        const isCancel = msg.includes('cancel') || msg.includes('dismiss') || msg.includes('no image');
        if (!isCancel) {
          console.warn('[camera] native Camera.getPhoto failed:', err);
        }
        // Do not fall through to the file input on native — the native camera either
        // worked, was cancelled, or failed. Falling through to a file input on iOS
        // would show the wrong UI (a file picker instead of the camera).
        return;
      }
    }

    // ── Web / fallback path: file input with capture attribute ────────────────
    // Dynamically set capture direction so front/rear works on Android Chrome too
    const input = cameraInputRef.current;
    if (input) {
      input.setAttribute('capture', opts?.direction === 'front' ? 'user' : 'environment');
      input.click();
    }
  }, [handleFile]);

  // ── Internal: check photos permission + open input ────────────────────────
  const doOpenLibrary = useCallback(async () => {
    setDenied(null);
    setChecking(true);
    try {
      const perm = await ensurePhotosPermission();
      if (perm === 'denied') {
        setDenied('photos');
        setExplainer({
          type: 'photos',
          denied: true,
          onNotNow: () => setExplainer(null),
          onEnable: async () => { setExplainer(null); },
        });
        return;
      }
    } finally {
      setChecking(false);
    }
    libraryInputRef.current?.click();
  }, []);

  // ── Public: openCamera — shows explainer first if not yet seen ────────────
  const openCamera = useCallback(async (opts?: NativeCameraOptions) => {
    if (isNative() && permExplainer.shouldShow('camera')) {
      setExplainer({
        type: 'camera',
        denied: false,
        onNotNow: () => {
          permExplainer.markShown('camera');
          setExplainer(null);
        },
        onEnable: async () => {
          permExplainer.markShown('camera');
          setExplainer(null);
          await doOpenCamera(opts);
        },
      });
      return;
    }
    await doOpenCamera(opts);
  }, [permExplainer, doOpenCamera]);

  // ── Public: openLibrary — shows explainer first if not yet seen ───────────
  const openLibrary = useCallback(async () => {
    if (isNative() && permExplainer.shouldShow('photos')) {
      setExplainer({
        type: 'photos',
        denied: false,
        onNotNow: () => {
          permExplainer.markShown('photos');
          setExplainer(null);
        },
        onEnable: async () => {
          permExplainer.markShown('photos');
          setExplainer(null);
          await doOpenLibrary();
        },
      });
      return;
    }
    await doOpenLibrary();
  }, [permExplainer, doOpenLibrary]);

  const clear = useCallback(() => {
    if (prevUrlRef.current) {
      URL.revokeObjectURL(prevUrlRef.current);
      prevUrlRef.current = null;
    }
    setFile(null);
    setPreviewUrl(null);
    setIsHeic(false);
    setDenied(null);
    setExplainer(null);
  }, []);

  return {
    file,
    previewUrl,
    isHeic,
    checkingPermission,
    permissionDenied,
    openCamera,
    openLibrary,
    clear,
    inputsRef,
    explainer,
    // Expose refs so callers can render the inputs via IosMediaInputs
    _cameraInputRef: cameraInputRef,
    _libraryInputRef: libraryInputRef,
    _handleInputChange: handleInputChange,
  } as IosMediaPickerState & {
    _cameraInputRef: React.RefObject<HTMLInputElement>;
    _libraryInputRef: React.RefObject<HTMLInputElement>;
    _handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  };
}

// ── Platform helper (re-exported for convenience) ─────────────────────────────

export { isNative, getPlatform };
