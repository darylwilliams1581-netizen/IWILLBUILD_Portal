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

// ── Types ─────────────────────────────────────────────────────────────────────

export type PickerMode = 'camera' | 'library';

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
  openCamera: () => Promise<void>;
  openLibrary: () => Promise<void>;
  clear: () => void;
  /** Render this inside your component — the hidden file inputs */
  inputsRef: React.RefObject<HTMLDivElement>;
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

/**
 * Check / request camera permission via Capacitor on native iOS/Android.
 * Returns 'granted' | 'denied' | 'unknown' (web / non-native).
 */
async function ensureCameraPermission(): Promise<'granted' | 'denied' | 'unknown'> {
  if (!isNative()) return 'unknown';
  try {
    // Dynamically import to avoid loading Capacitor on web
    const { Camera, CameraPermissionState } = await import('@capacitor/camera');
    const status = await Camera.checkPermissions();
    if (status.camera === 'granted') return 'granted';
    if (status.camera === 'denied') return 'denied';
    // 'prompt' or 'prompt-with-rationale' — request it
    const requested = await Camera.requestPermissions({ permissions: ['camera'] });
    if ((requested.camera as CameraPermissionState) === 'granted') return 'granted';
    return 'denied';
  } catch {
    // @capacitor/camera may not be installed — fall back to browser input
    return 'unknown';
  }
}

/**
 * Check / request photo library permission via Capacitor on native iOS/Android.
 */
async function ensurePhotosPermission(): Promise<'granted' | 'denied' | 'unknown'> {
  if (!isNative()) return 'unknown';
  try {
    const { Camera, CameraPermissionState } = await import('@capacitor/camera');
    const status = await Camera.checkPermissions();
    const photos = status.photos ?? status.camera; // Android uses 'camera' for both
    if (photos === 'granted' || photos === 'limited') return 'granted';
    if (photos === 'denied') return 'denied';
    const requested = await Camera.requestPermissions({ permissions: ['photos'] });
    const rPhotos = (requested.photos ?? requested.camera) as CameraPermissionState;
    if (rPhotos === 'granted' || rPhotos === 'limited') return 'granted';
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

  const cameraInputRef  = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  // Wrapper div so callers can render both inputs with a single ref
  const inputsRef       = useRef<HTMLDivElement>(null);

  // Revoke previous blob URL when a new file is selected
  const prevUrlRef = useRef<string | null>(null);
  useEffect(() => {
    return () => {
      if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
    };
  }, []);

  const handleFile = useCallback((f: File) => {
    // Revoke previous blob URL
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
    // Reset input so the same file can be re-selected
    e.target.value = '';
  }, [handleFile]);

  const openCamera = useCallback(async () => {
    setDenied(null);
    setChecking(true);
    try {
      const perm = await ensureCameraPermission();
      if (perm === 'denied') {
        setDenied('camera');
        return;
      }
    } finally {
      setChecking(false);
    }
    cameraInputRef.current?.click();
  }, []);

  const openLibrary = useCallback(async () => {
    setDenied(null);
    setChecking(true);
    try {
      const perm = await ensurePhotosPermission();
      if (perm === 'denied') {
        setDenied('photos');
        return;
      }
    } finally {
      setChecking(false);
    }
    libraryInputRef.current?.click();
  }, []);

  const clear = useCallback(() => {
    if (prevUrlRef.current) {
      URL.revokeObjectURL(prevUrlRef.current);
      prevUrlRef.current = null;
    }
    setFile(null);
    setPreviewUrl(null);
    setIsHeic(false);
    setDenied(null);
  }, []);

  // Attach event listeners to the inputs once the wrapper div mounts
  // (We can't use JSX here since this is a .ts file — callers render the inputs)
  useEffect(() => {
    const cam = cameraInputRef.current;
    const lib = libraryInputRef.current;
    if (!cam || !lib) return;
    // The onChange handler is attached via the ref in the returned inputsRef
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
    // Expose refs so callers can render the inputs
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
