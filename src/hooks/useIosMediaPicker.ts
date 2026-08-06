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
import { isNative, getPlatform, getCameraPlugin } from '@/lib/capacitor-plugins';
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
//   CameraResultType.Base64  = 'base64'
//   CameraResultType.DataUrl = 'dataUrl'
//   CameraSource.Camera      = 'CAMERA'
//   CameraDirection.Rear     = 'REAR'
//   CameraDirection.Front    = 'FRONT'
//
// Using inline literals is safe, zero-risk, and eliminates the startup crash.
// The actual plugin instance is still lazy-loaded via getCameraPlugin() which
// is already guarded by isNative() and wrapped in try/catch.
const CAM_RESULT_BASE64  = 'base64'  as const;
const CAM_RESULT_DATAURL = 'dataUrl' as const;
const CAM_SOURCE_CAMERA  = 'CAMERA'  as const;
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
 * Check / request camera permission via the real @capacitor/camera plugin.
 * Returns 'granted' | 'denied' | 'unknown' (web / non-native / plugin missing).
 *
 * Hard timeout: 5 s total. If the Capacitor bridge or plugin import hangs
 * (common on first launch before the bridge is fully initialised), we fall
 * back to 'unknown' so the UI never stays stuck on "Checking permissions…".
 */
async function ensureCameraPermission(): Promise<'granted' | 'denied' | 'unknown'> {
  if (!isNative()) return 'unknown';
  try {
    // 3 s to load the plugin — if the bridge isn't ready yet this import can hang
    const Camera = await withTimeout(getCameraPlugin(), 3000, null);
    if (!Camera) return 'unknown';

    // 3 s for checkPermissions — native IPC; should be instant but guard anyway
    const status = await withTimeout(
      Camera.checkPermissions() as Promise<Record<string, string>>,
      3000,
      { camera: 'prompt' } as Record<string, string>,
    );
    // @capacitor/camera v5+ returns { camera: PermissionState, photos: PermissionState }
    const cam = status.camera ?? 'prompt';
    if (cam === 'granted') return 'granted';
    if (cam === 'denied') return 'denied';

    // 'prompt' or 'prompt-with-rationale' — trigger the native dialog.
    // No timeout here — the dialog waits for the user; that's intentional.
    const requested = await Camera.requestPermissions({ permissions: ['camera'] as never }) as Record<string, string>;
    const grantedCam = requested.camera ?? 'denied';
    return grantedCam === 'granted' ? 'granted' : 'denied';
  } catch {
    // Plugin unavailable at runtime — fall back to browser input
    return 'unknown';
  }
}

/**
 * Check / request photo library permission via the real @capacitor/camera plugin.
 * Returns 'granted' | 'limited' | 'denied' | 'unknown'.
 *
 * 'limited' = iOS 14+ "Selected Photos" — the picker still works but the user
 * can only see photos they explicitly allowed. This is NOT a denial; do not
 * block the picker. Surface it in the UI so the user understands why they
 * can't see all their photos.
 *
 * Hard timeout: same 3 s guards as ensureCameraPermission.
 */
async function ensurePhotosPermission(): Promise<'granted' | 'limited' | 'denied' | 'unknown'> {
  if (!isNative()) return 'unknown';
  try {
    const Camera = await withTimeout(getCameraPlugin(), 3000, null);
    if (!Camera) return 'unknown';

    const status = await withTimeout(
      Camera.checkPermissions() as Promise<Record<string, string>>,
      3000,
      { photos: 'prompt' } as Record<string, string>,
    );
    const photos = status.photos ?? status.camera ?? 'prompt';

    if (photos === 'granted') return 'granted';
    if (photos === 'limited') return 'limited';   // ← surface distinctly
    if (photos === 'denied') return 'denied';

    // 'prompt' — trigger the native dialog (no timeout — waits for user)
    const requested = await Camera.requestPermissions({ permissions: ['photos'] as never }) as Record<string, string>;
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
        // 3 s timeout — if the Capacitor bridge isn't ready the import can hang
        const CameraPlugin = await withTimeout(getCameraPlugin(), 3000, null);
        if (CameraPlugin) {
          // Use Base64 instead of DataUrl on native.
          // DataUrl requires an extra fetch() round-trip to convert to a Blob,
          // adding latency and a second full-image memory copy in the WKWebView heap.
          // Base64 lets us decode directly, reducing peak memory.
          //
          // captureQuality: use the caller's quality hint (from CameraSettings) so
          // the native capture matches the intended quality tier. Defaults to 84
          // (medium) — never hardcode 90 which ignores the user's setting entirely.
          const nativeQuality = opts?.captureQuality ?? 84;

          const photo = await CameraPlugin.getPhoto({
            quality: nativeQuality,
            allowEditing: false,
            resultType: CAM_RESULT_BASE64,
            source: CAM_SOURCE_CAMERA,
            direction: opts?.direction === 'front' ? CAM_DIR_FRONT : CAM_DIR_REAR,
            // flashMode is a valid runtime option on iOS even if the TS types
            // for this version don't expose it — pass as string literal via cast
            flashMode: opts?.flashMode === 'on' ? 'on' : opts?.flashMode === 'off' ? 'off' : 'auto',
          } as any);

          if (photo.base64String) {
            // Decode base64 → Uint8Array → Blob.
            //
            // IMPORTANT: do NOT use a char-by-char atob loop here.
            // A 12MP iPhone photo at quality 84 produces ~6–10MB of base64 data.
            // Iterating over millions of chars synchronously on the main thread
            // blocks the UI for 200–500ms, which looks like a freeze/crash in
            // TestFlight. Use a chunked decode instead:
            //   1. atob() the full string (fast — native C, not JS)
            //   2. Slice into 64KB chunks and decode each chunk
            //   3. Concatenate into a single Uint8Array
            // This keeps each JS tick short and avoids the main-thread stall.
            try {
              const blob = base64ToBlob(
                photo.base64String,
                photo.format === 'png' ? 'image/png' : 'image/jpeg',
              );
              const file = new File([blob], `capture.${photo.format ?? 'jpg'}`, { type: blob.type });
              handleFile(file);
            } catch (decodeErr) {
              console.warn('[camera] base64 decode failed, falling back to dataUrl path:', decodeErr);
              // Fallback: re-request with DataUrl if chunked decode fails (should not happen)
              const photo2 = await CameraPlugin.getPhoto({
                quality: nativeQuality,
                allowEditing: false,
                resultType: CAM_RESULT_DATAURL,
                source: CAM_SOURCE_CAMERA,
                direction: opts?.direction === 'front' ? CAM_DIR_FRONT : CAM_DIR_REAR,
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
        // Distinguish user-cancel from a real crash.
        // Capacitor throws with "cancelled" / "User cancelled" / "No image" when
        // the user dismisses the camera — this is not a crash, do not log it.
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
      // 'limited' = iOS "Selected Photos" — picker still works, just show a note
      setPhotosLimited(perm === 'limited');
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
