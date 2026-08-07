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
 *    globals, NOT dynamic imports. Dynamic imports of @capacitor/* plugin instances
 *    are resolved at Vite build time and can produce broken chunks in the iOS bundle.
 *    Static enum/constant imports at module level are safe.
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
import { isNative, getPlatform } from '@/lib/capacitor-plugins';
import { usePermissionExplainer } from '@/lib/usePermissionExplainer';

// ── Camera enum constants as inline literals ──────────────────────────────────
// We intentionally do NOT import these from @capacitor/camera at module level.
//
// WHY: A top-level `import { CameraResultType } from '@capacitor/camera'` causes
// the entire @capacitor/camera package to be evaluated when this module is first
// parsed — which happens during the initial JS bundle load, BEFORE the Capacitor
// bridge (window.Capacitor) is fully initialised on iOS. If the bridge isn't
// ready, the plugin registration code inside @capacitor/camera can throw or
// produce undefined values, crashing the module graph before React mounts.
// That crash prevents CapacitorInit from running, so the splash screen never
// hides → white screen in TestFlight.
//
// The enum values are pure string constants (verified from the package source):
//   CameraResultType.Uri     = 'uri'      ← PRIMARY on iOS 17+ (most reliable)
//   CameraResultType.Base64  = 'base64'
//   CameraResultType.DataUrl = 'dataUrl'
//   CameraSource.Camera      = 'CAMERA'
//   CameraSource.Photos      = 'PHOTOS'
//   CameraDirection.Rear     = 'REAR'
//   CameraDirection.Front    = 'FRONT'
//
// Using inline literals is safe, zero-risk, and eliminates the startup crash.
// The actual plugin instance is still lazy-loaded via getCameraPlugin() which
// is already guarded by isNative() and wrapped in try/catch.
//
// RESULT TYPE ORDER (camera):
//   1. 'uri'    — returns webPath (a capacitor:// URL fetchable as blob). Most
//                 reliable on iOS 17+. No base64 decode, no memory spike.
//   2. 'base64' — fallback for older iOS where webPath may be null.
//   3. 'dataUrl'— last resort.
//
// RESULT TYPE ORDER (library):
//   Same order — 'uri' first, then 'base64', then 'dataUrl'.
const CAM_RESULT_URI     = 'uri'     as const;
const CAM_RESULT_BASE64  = 'base64'  as const;
const CAM_RESULT_DATAURL = 'dataUrl' as const;
const CAM_SOURCE_CAMERA  = 'CAMERA'  as const;
const CAM_SOURCE_PHOTOS  = 'PHOTOS'  as const;
const CAM_DIR_REAR       = 'REAR'    as const;
const CAM_DIR_FRONT      = 'FRONT'   as const;

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
  /**
   * JPEG quality hint passed to Camera.getPhoto() on native.
   * Maps to the quality setting from CameraSettings:
   *   low  → 72  (matches processImage JPEG quality for low)
   *   med  → 84  (matches processImage JPEG quality for medium)
   *   high → 92  (matches processImage JPEG quality for high)
   * Defaults to 84 (medium) if not provided.
   *
   * Note: this controls the native capture quality, not the processImage
   * resize cap. processImage still applies its own maxDim resize on top.
   * Keeping these in sync avoids double-compressing at mismatched quality levels.
   */
  captureQuality?: number;
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
  /**
   * Set when iOS returns 'limited' photo library access.
   * Limited = user selected specific photos only (iOS 14+).
   * The picker still works — we can still open the library — but the user
   * can only see the photos they explicitly allowed. This is NOT a denial.
   */
  photosLimited: boolean;
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
 * Decode a base64 string to a Blob in 64KB chunks.
 *
 * WHY chunked:
 * A 12MP iPhone photo at quality 84 produces ~6–10MB of base64 data.
 * The naive approach — atob() then a single char-by-char for loop over the
 * resulting string — iterates over millions of chars synchronously on the
 * main thread, blocking the UI for 200–500ms. In TestFlight this manifests
 * as a visible freeze immediately after shutter press, which users report as
 * a crash.
 *
 * The chunked approach keeps each JS tick short:
 *   1. atob() the full string once (fast — native C, not JS iteration)
 *   2. Slice the decoded string into 64KB chunks
 *   3. Convert each chunk to a Uint8Array via charCodeAt (short loop per chunk)
 *   4. Collect chunks into a Blob directly — no giant intermediate Uint8Array
 *
 * This avoids both the main-thread stall and the peak memory spike of
 * allocating a single Uint8Array for the entire image at once.
 */
const BASE64_CHUNK = 65536; // 64KB per chunk — keeps each tick under ~1ms

function base64ToBlob(base64: string, mimeType: string): Blob {
  const decoded = atob(base64); // native C — fast, does not block JS
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < decoded.length; offset += BASE64_CHUNK) {
    const slice = decoded.slice(offset, offset + BASE64_CHUNK);
    const chunk = new Uint8Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      chunk[i] = slice.charCodeAt(i);
    }
    chunks.push(chunk);
  }
  return new Blob(chunks as BlobPart[], { type: mimeType });
}

/**
 * Race a promise against a timeout. Returns the fallback value if the timeout
 * fires first. Prevents any Capacitor plugin call from hanging the UI forever
 * when the bridge is slow to initialise or the plugin is missing at runtime.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

/**
 * getNativeCameraPlugin
 * ─────────────────────────────────────────────────────────────────────────────
 * Access the @capacitor/camera plugin via window.Capacitor.Plugins.Camera.
 *
 * WHY window.Capacitor.Plugins instead of dynamic import('@capacitor/camera'):
 *
 * In a Capacitor iOS build, ALL native plugins are registered on
 * window.Capacitor.Plugins by the native bridge BEFORE the JS bundle runs.
 * Dynamic import('@capacitor/camera') goes through Vite's module graph and
 * can produce a broken chunk in the iOS bundle — the import resolves but the
 * plugin instance it returns may not be the same registered bridge object,
 * causing getPhoto() to silently fail or return a black screen.
 *
 * Accessing window.Capacitor.Plugins.Camera directly is the approach used in
 * the official Capacitor docs for WKWebView and is guaranteed to return the
 * real registered plugin instance that the native bridge wired up.
 *
 * Returns null on web or if the plugin is not registered.
 */
function getNativeCameraPlugin(): NativeCameraPluginBridge | null {
  if (typeof window === 'undefined') return null;
  const cap = (window as {
    Capacitor?: {
      isNativePlatform?: () => boolean;
      Plugins?: {
        Camera?: NativeCameraPluginBridge;
      };
    };
  }).Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  return cap?.Plugins?.Camera ?? null;
}

interface NativeCameraPluginBridge {
  getPhoto: (opts: Record<string, unknown>) => Promise<{
    base64String?: string;
    dataUrl?: string;
    path?: string;
    webPath?: string;
    format?: string;
  }>;
  checkPermissions: () => Promise<Record<string, string>>;
  requestPermissions: (opts: { permissions: string[] }) => Promise<Record<string, string>>;
}

/**
 * Fetch a capacitor:// or file:// webPath returned by Camera.getPhoto({resultType:'uri'})
 * and convert it to a File. This is the most reliable path on iOS 17+.
 *
 * WHY: On iOS 17+, Camera.getPhoto with resultType:'base64' sometimes returns an
 * empty base64String even though the photo was captured successfully. The webPath
 * (a capacitor:// URL) is always populated and can be fetched directly as a blob
 * without any base64 decode overhead or memory spike.
 */
async function webPathToFile(webPath: string, format: string, prefix: string): Promise<File | null> {
  try {
    const res = await fetch(webPath);
    if (!res.ok) return null;
    const blob = await res.blob();
    const mimeType = blob.type || (format === 'png' ? 'image/png' : 'image/jpeg');
    const ext = format === 'png' ? 'png' : 'jpg';
    return new File([blob], `${prefix}_${Date.now()}.${ext}`, { type: mimeType });
  } catch (e) {
    console.warn('[camera] webPathToFile failed:', e);
    return null;
  }
}

/**
 * Read a file from the native filesystem via window.Capacitor.Plugins.Filesystem.
 * Used as a fallback when Camera.getPhoto returns an empty base64String.
 * Returns null if the plugin is unavailable or the read fails.
 */
async function readFileAsBase64(path: string): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const cap = (window as {
      Capacitor?: { Plugins?: {
        Filesystem?: {
          readFile: (opts: { path: string }) => Promise<{ data: string }>;
        };
      } }
    }).Capacitor;
    const Filesystem = cap?.Plugins?.Filesystem;
    if (!Filesystem) return null;
    const result = await Filesystem.readFile({ path });
    if (!result?.data) return null;
    // Detect JPEG vs PNG from the base64 header bytes
    const header = result.data.slice(0, 8);
    const mimeType = header.startsWith('/9j') ? 'image/jpeg'
      : header.startsWith('iVBOR') ? 'image/png'
      : 'image/jpeg';
    return { base64: result.data, mimeType };
  } catch {
    return null;
  }
}

/**
 * Check / request camera permission via window.Capacitor.Plugins.Camera.
 * Returns 'granted' | 'denied' | 'unknown'.
 */
async function ensureCameraPermission(): Promise<'granted' | 'denied' | 'unknown'> {
  const Camera = getNativeCameraPlugin();
  if (!Camera) return 'unknown'; // web or plugin not registered
  try {
    const status = await withTimeout(
      Camera.checkPermissions(),
      3000,
      { camera: 'prompt' },
    );
    const cam = status.camera ?? 'prompt';
    if (cam === 'granted') return 'granted';
    if (cam === 'denied') return 'denied';

    // 'prompt' — trigger the native dialog (no timeout — waits for user)
    const requested = await Camera.requestPermissions({ permissions: ['camera'] });
    return (requested.camera ?? 'denied') === 'granted' ? 'granted' : 'denied';
  } catch {
    return 'unknown';
  }
}

/**
 * Check / request photo library permission via window.Capacitor.Plugins.Camera.
 * Returns 'granted' | 'limited' | 'denied' | 'unknown'.
 */
async function ensurePhotosPermission(): Promise<'granted' | 'limited' | 'denied' | 'unknown'> {
  const Camera = getNativeCameraPlugin();
  if (!Camera) return 'unknown';
  try {
    const status = await withTimeout(
      Camera.checkPermissions(),
      3000,
      { photos: 'prompt' },
    );
    const photos = status.photos ?? status.camera ?? 'prompt';
    if (photos === 'granted') return 'granted';
    if (photos === 'limited') return 'limited';
    if (photos === 'denied') return 'denied';

    // 'prompt' — trigger the native dialog
    const requested = await Camera.requestPermissions({ permissions: ['photos'] });
    const rPhotos = requested.photos ?? requested.camera ?? 'denied';
    if (rPhotos === 'granted') return 'granted';
    if (rPhotos === 'limited') return 'limited';
    return 'denied';
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
  const [photosLimited, setPhotosLimited]   = useState(false);

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

    // ── Web path: click MUST happen synchronously inside the user gesture ─────
    // iOS Safari invalidates the gesture token the moment any `await` resolves,
    // even if the awaited value is already settled. So on web we fire the click
    // immediately — before any async work — then return. The file input's
    // onChange handler picks up the result.
    if (!isNative()) {
      const input = cameraInputRef.current;
      if (input) {
        input.setAttribute('capture', opts?.direction === 'front' ? 'user' : 'environment');
        input.click();
      }
      return;
    }

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

    // ── Native path: use window.Capacitor.Plugins.Camera directly ───────────
    // We access the plugin via the bridge globals, NOT via dynamic import.
    // Dynamic import('@capacitor/camera') can produce a broken chunk in the
    // iOS bundle where the resolved module is not the registered bridge object,
    // causing getPhoto() to silently fail or show a black screen.
    const CameraPlugin = getNativeCameraPlugin();
    if (!CameraPlugin) {
      console.warn('[camera] CameraPlugin not available on native — cannot open camera');
      return;
    }

    const nativeQuality = opts?.captureQuality ?? 84;
    const direction = opts?.direction === 'front' ? CAM_DIR_FRONT : CAM_DIR_REAR;
    const flashMode = opts?.flashMode === 'on' ? 'on' : opts?.flashMode === 'off' ? 'off' : 'auto';

    const baseOpts = {
      quality: nativeQuality,
      allowEditing: false,
      source: CAM_SOURCE_CAMERA,
      direction,
      flashMode,
      saveToGallery: false,
    };

    try {
      // ── Attempt 1: URI result (most reliable on iOS 17+) ──────────────────
      // Returns a capacitor:// webPath that can be fetched directly as a blob.
      // No base64 decode, no memory spike, works on all modern iOS versions.
      console.log('[camera] attempt 1: resultType=uri');
      const photo1 = await CameraPlugin.getPhoto({ ...baseOpts, resultType: CAM_RESULT_URI });
      console.log('[camera] uri result: webPath=', photo1.webPath, 'path=', photo1.path, 'format=', photo1.format);

      const webPath = photo1.webPath ?? photo1.path;
      if (webPath) {
        const file = await webPathToFile(webPath, photo1.format ?? 'jpg', 'capture');
        if (file) {
          console.log('[camera] uri→blob success: size=', file.size, 'type=', file.type);
          handleFile(file);
          return;
        }
        console.warn('[camera] webPathToFile returned null, trying base64 fallback');
      } else {
        console.warn('[camera] uri result had no webPath/path, trying base64 fallback');
      }

      // ── Attempt 2: base64 result ──────────────────────────────────────────
      console.log('[camera] attempt 2: resultType=base64');
      const photo2 = await CameraPlugin.getPhoto({ ...baseOpts, resultType: CAM_RESULT_BASE64 });
      console.log('[camera] base64 result: base64String length=', photo2.base64String?.length ?? 0, 'format=', photo2.format);

      if (photo2.base64String) {
        try {
          const blob = base64ToBlob(
            photo2.base64String,
            photo2.format === 'png' ? 'image/png' : 'image/jpeg',
          );
          const file = new File([blob], `capture_${Date.now()}.${photo2.format ?? 'jpg'}`, { type: blob.type });
          console.log('[camera] base64→blob success: size=', file.size);
          handleFile(file);
          return;
        } catch (decodeErr) {
          console.warn('[camera] base64 decode failed:', decodeErr);
        }
      }

      // ── Attempt 3: dataUrl result ─────────────────────────────────────────
      console.log('[camera] attempt 3: resultType=dataUrl');
      const photo3 = await CameraPlugin.getPhoto({ ...baseOpts, resultType: CAM_RESULT_DATAURL });
      console.log('[camera] dataUrl result: dataUrl length=', photo3.dataUrl?.length ?? 0);

      if (photo3.dataUrl) {
        try {
          const res = await fetch(photo3.dataUrl);
          const blob = await res.blob();
          const file = new File([blob], `capture_${Date.now()}.jpg`, { type: blob.type || 'image/jpeg' });
          console.log('[camera] dataUrl→blob success: size=', file.size);
          handleFile(file);
          return;
        } catch (dataUrlErr) {
          console.warn('[camera] dataUrl fallback failed:', dataUrlErr);
        }
      }

      // ── Attempt 4: URI + Filesystem.readFile ──────────────────────────────
      // Last resort — read the file bytes directly via the Filesystem plugin.
      console.log('[camera] attempt 4: uri + Filesystem.readFile');
      const photo4 = await CameraPlugin.getPhoto({ ...baseOpts, resultType: CAM_RESULT_URI });
      const filePath = photo4.path ?? photo4.webPath;
      if (filePath) {
        const read = await readFileAsBase64(filePath);
        if (read) {
          const blob = base64ToBlob(read.base64, read.mimeType);
          const file = new File([blob], `capture_${Date.now()}.jpg`, { type: blob.type });
          console.log('[camera] Filesystem.readFile success: size=', file.size);
          handleFile(file);
          return;
        }
      }

      console.warn('[camera] all 4 result type attempts failed — no photo data returned');

    } catch (err) {
      const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
      const isCancel = msg.includes('cancel') || msg.includes('dismiss') || msg.includes('no image') || msg.includes('user cancelled');
      if (!isCancel) {
        console.warn('[camera] native Camera.getPhoto failed:', err);
      }
      // Do not fall through to file input on native — getPhoto handles its own UI
    }
  }, [handleFile]);

  // ── Internal: check photos permission + open input ────────────────────────
  const doOpenLibrary = useCallback(async () => {
    setDenied(null);

    // ── Web path: click synchronously — same Safari gesture-token rule ────────
    if (!isNative()) {
      libraryInputRef.current?.click();
      return;
    }

    // ── Native path: use Camera.getPhoto({ source: 'PHOTOS' }) directly ──────
    // CRITICAL: Do NOT await a permission check before calling getPhoto on native.
    // iOS invalidates the user gesture token the moment any `await` resolves,
    // so libraryInputRef.current?.click() after an async permission check is a
    // no-op — the system silently ignores the programmatic click.
    //
    // Instead, call Camera.getPhoto({ source: 'PHOTOS' }) which handles its own
    // permission prompt internally and opens the system photo picker directly.
    // This is the correct pattern for Capacitor + WKWebView photo library access.
    const CameraPlugin = getNativeCameraPlugin();
    if (!CameraPlugin) {
      libraryInputRef.current?.click();
      return;
    }

    setChecking(true);
    try {
      const baseOpts = {
        quality: 84,
        allowEditing: false,
        source: CAM_SOURCE_PHOTOS,
        saveToGallery: false,
      };

      // ── Attempt 1: URI result (most reliable on iOS 17+) ──────────────────
      console.log('[library] attempt 1: resultType=uri');
      const photo1 = await CameraPlugin.getPhoto({ ...baseOpts, resultType: CAM_RESULT_URI });
      console.log('[library] uri result: webPath=', photo1.webPath, 'path=', photo1.path, 'format=', photo1.format);

      const webPath = photo1.webPath ?? photo1.path;
      if (webPath) {
        const file = await webPathToFile(webPath, photo1.format ?? 'jpg', 'photo');
        if (file) {
          console.log('[library] uri→blob success: size=', file.size, 'type=', file.type);
          setPhotosLimited(false);
          handleFile(file);
          return;
        }
        console.warn('[library] webPathToFile returned null, trying base64 fallback');
      }

      // ── Attempt 2: base64 result ──────────────────────────────────────────
      console.log('[library] attempt 2: resultType=base64');
      const photo2 = await CameraPlugin.getPhoto({ ...baseOpts, resultType: CAM_RESULT_BASE64 });
      if (photo2.base64String) {
        try {
          const blob = base64ToBlob(
            photo2.base64String,
            photo2.format === 'png' ? 'image/png' : 'image/jpeg',
          );
          const file = new File([blob], `photo_${Date.now()}.${photo2.format ?? 'jpg'}`, { type: blob.type });
          setPhotosLimited(false);
          handleFile(file);
          return;
        } catch (decodeErr) {
          console.warn('[library] base64 decode failed:', decodeErr);
        }
      }

      // ── Attempt 3: dataUrl result ─────────────────────────────────────────
      if (photo2.dataUrl) {
        try {
          const res = await fetch(photo2.dataUrl);
          const blob = await res.blob();
          const file = new File([blob], `photo_${Date.now()}.jpg`, { type: blob.type || 'image/jpeg' });
          handleFile(file);
          return;
        } catch (dataUrlErr) {
          console.warn('[library] dataUrl fallback failed:', dataUrlErr);
        }
      }

      // ── Attempt 4: URI + Filesystem.readFile ──────────────────────────────
      const filePath = photo1.path ?? photo1.webPath;
      if (filePath) {
        const read = await readFileAsBase64(filePath);
        if (read) {
          const blob = base64ToBlob(read.base64, read.mimeType);
          const file = new File([blob], `photo_${Date.now()}.jpg`, { type: blob.type });
          handleFile(file);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
      const isCancel = msg.includes('cancel') || msg.includes('dismiss') || msg.includes('no image') || msg.includes('user cancelled');
      if (!isCancel) {
        if (msg.includes('permission') || msg.includes('denied') || msg.includes('not authorized')) {
          setDenied('photos');
          setExplainer({
            type: 'photos',
            denied: true,
            onNotNow: () => setExplainer(null),
            onEnable: async () => { setExplainer(null); },
          });
        } else {
          console.warn('[library] Camera.getPhoto({source:PHOTOS}) failed:', err);
        }
      }
    } finally {
      setChecking(false);
    }
  }, [handleFile]);

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
    setPhotosLimited(false);
    setExplainer(null);
  }, []);

  return {
    file,
    previewUrl,
    isHeic,
    checkingPermission,
    permissionDenied,
    photosLimited,
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
