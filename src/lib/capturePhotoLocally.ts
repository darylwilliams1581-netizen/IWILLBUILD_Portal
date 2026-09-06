/**
 * capturePhotoLocally.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Offline-first photo capture helpers for the Capacitor native shell.
 *
 * DESIGN RULES:
 *   - Zero fetch/XHR — all operations are local filesystem only.
 *   - Uses window.Capacitor.Plugins.Camera (takePhoto) and
 *     window.Capacitor.Plugins.Filesystem (copy, readFile, deleteFile).
 *   - Safe to import on web — all native calls are guarded by isNative().
 *   - Never dynamic import('@capacitor/*') — access via bridge globals only.
 *
 * EXPORTS:
 *   capturePhotoLocally() — take a photo and persist it to Directory.Data
 *   readLocalPhoto()      — read a locally-stored photo as a File
 *   deleteLocalPhoto()    — delete a locally-stored photo from Directory.Data
 */

import { isNative } from '@/lib/capacitor-plugins';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LocalCaptureResult {
  /** Stable local identifier (UUID-style, used as idempotency key) */
  localId: string;
  /** Path within Directory.Data, e.g. "iwb-photos/abc123.jpg" */
  localPath: string;
  /** capacitor:// URI for the stored file */
  localUri: string;
  /** Blob URL suitable for <img src> preview — revoke after use */
  previewUrl: string;
  /** Same as localId — used as X-Idempotency-Key on upload */
  idempotencyKey: string;
}

// ── Bridge accessors ──────────────────────────────────────────────────────────

type CameraPluginBridge = {
  takePhoto: (opts: Record<string, unknown>) => Promise<{
    path?: string;
    webPath?: string;
    format?: string;
    base64String?: string;
    dataUrl?: string;
  }>;
  getPhoto: (opts: Record<string, unknown>) => Promise<{
    path?: string;
    webPath?: string;
    format?: string;
    base64String?: string;
    dataUrl?: string;
  }>;
};

type FilesystemPluginBridge = {
  copy: (opts: {
    from: string;
    to: string;
    toDirectory: string;
  }) => Promise<{ uri: string }>;
  readFile: (opts: {
    path: string;
    directory: string;
    encoding?: string;
  }) => Promise<{ data: string }>;
  deleteFile: (opts: {
    path: string;
    directory: string;
  }) => Promise<void>;
  mkdir: (opts: {
    path: string;
    directory: string;
    recursive?: boolean;
  }) => Promise<void>;
};

function getCameraBridge(): CameraPluginBridge | null {
  if (typeof window === 'undefined') return null;
  const cap = (window as { Capacitor?: { isNativePlatform?: () => boolean; Plugins?: Record<string, unknown> } }).Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  const plugin = cap.Plugins?.['Camera'] as CameraPluginBridge | undefined;
  if (!plugin) return null;
  // Prefer takePhoto (Capacitor 8.1+), fall back to getPhoto
  if (typeof plugin.takePhoto === 'function' || typeof plugin.getPhoto === 'function') {
    return plugin;
  }
  return null;
}

function getFilesystemBridge(): FilesystemPluginBridge | null {
  if (typeof window === 'undefined') return null;
  const cap = (window as { Capacitor?: { isNativePlatform?: () => boolean; Plugins?: Record<string, unknown> } }).Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  const plugin = cap.Plugins?.['Filesystem'] as FilesystemPluginBridge | undefined;
  if (!plugin) return null;
  if (typeof plugin.readFile !== 'function') return null;
  return plugin;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const PHOTO_DIR = 'DATA' as const; // Capacitor Directory.Data
const PHOTO_FOLDER = 'iwb-photos';

function generateId(): string {
  // crypto.randomUUID() is available in WKWebView on iOS 15.4+
  // Fall back to a timestamp+random string for older devices
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const BASE64_CHUNK = 65536;

function base64ToBlob(base64: string, mimeType: string): Blob {
  const decoded = atob(base64);
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

// ── capturePhotoLocally ───────────────────────────────────────────────────────

/**
 * Take a photo using the native camera and persist it to Directory.Data.
 * Returns a LocalCaptureResult with a stable localId and a preview blob URL.
 *
 * Zero fetch/XHR — airplane-mode safe by design.
 * Throws if the camera is unavailable or the user cancels.
 */
export async function capturePhotoLocally(): Promise<LocalCaptureResult> {
  if (!isNative()) {
    throw new Error('capturePhotoLocally: not running in native shell');
  }

  const Camera = getCameraBridge();
  if (!Camera) {
    throw new Error('capturePhotoLocally: Camera plugin not available');
  }

  const Filesystem = getFilesystemBridge();
  const localId = generateId();
  const fileName = `${localId}.jpg`;
  const localPath = `${PHOTO_FOLDER}/${fileName}`;

  // Ensure the photo folder exists
  if (Filesystem) {
    try {
      await Filesystem.mkdir({ path: PHOTO_FOLDER, directory: PHOTO_DIR, recursive: true });
    } catch {
      // Already exists — ignore
    }
  }

  // Use takePhoto (Capacitor 8.1+) or fall back to getPhoto
  const captureMethod = typeof Camera.takePhoto === 'function' ? 'takePhoto' : 'getPhoto';
  const photo = await Camera[captureMethod]({
    quality: 88,
    allowEditing: false,
    resultType: 'uri',
    source: 'CAMERA',
    direction: 'REAR',
    saveToGallery: false,
    width: 3072,
    height: 3072,
  });

  const webPath = photo.webPath ?? photo.path;

  // Copy to persistent Directory.Data storage
  let localUri = '';
  if (Filesystem && (photo.path || webPath)) {
    try {
      const copyResult = await Filesystem.copy({
        from: photo.path ?? webPath ?? '',
        to: localPath,
        toDirectory: PHOTO_DIR,
      });
      localUri = copyResult.uri;
    } catch {
      // Copy failed — use the temp webPath as fallback
      localUri = webPath ?? '';
    }
  } else {
    localUri = webPath ?? '';
  }

  // Build a preview blob URL from the webPath (capacitor:// URL).
  // Use XHR instead of fetch — the global fetch patch in main.tsx routes
  // capacitor:// and file:// URLs through CapacitorHttp which can't return
  // a Blob, causing a hang. XHR bypasses the patch and works correctly.
  let previewUrl = '';
  if (webPath) {
    try {
      const blob = await new Promise<Blob | null>(resolve => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', webPath, true);
        xhr.responseType = 'blob';
        xhr.onload = () => resolve(xhr.response as Blob);
        xhr.onerror = () => resolve(null);
        xhr.ontimeout = () => resolve(null);
        xhr.timeout = 8000;
        xhr.send();
      });
      if (blob) previewUrl = URL.createObjectURL(blob);
    } catch {
      // Preview unavailable — not fatal
    }
  }

  // Fallback: read from filesystem as base64
  if (!previewUrl && Filesystem && localPath) {
    try {
      const read = await Filesystem.readFile({ path: localPath, directory: PHOTO_DIR });
      if (read?.data) {
        const blob = base64ToBlob(read.data, 'image/jpeg');
        previewUrl = URL.createObjectURL(blob);
      }
    } catch {
      // Preview unavailable — not fatal
    }
  }

  return {
    localId,
    localPath,
    localUri,
    previewUrl,
    idempotencyKey: localId,
  };
}

// ── readLocalPhoto ────────────────────────────────────────────────────────────

/**
 * Read a locally-stored photo from Directory.Data and return it as a File.
 * Returns null if the file cannot be read (e.g. already deleted, path missing).
 *
 * Used by usePhotoUploadQueue to re-read a photo for upload after the app
 * was closed and reopened (IDB restore path).
 */
export async function readLocalPhoto(localPath: string): Promise<File | null> {
  if (!localPath) return null;

  const Filesystem = getFilesystemBridge();
  if (!Filesystem) return null;

  try {
    const result = await Filesystem.readFile({ path: localPath, directory: PHOTO_DIR });
    if (!result?.data) return null;

    const header = result.data.slice(0, 8);
    const mimeType = header.startsWith('/9j') ? 'image/jpeg'
      : header.startsWith('iVBOR') ? 'image/png'
      : 'image/jpeg';

    const blob = base64ToBlob(result.data, mimeType);
    const ext = mimeType === 'image/png' ? 'png' : 'jpg';
    const fileName = localPath.split('/').pop() ?? `photo_${Date.now()}.${ext}`;
    return new File([blob], fileName, { type: mimeType });
  } catch {
    return null;
  }
}

// ── deleteLocalPhoto ──────────────────────────────────────────────────────────

/**
 * Delete a locally-stored photo from Directory.Data.
 * Silent no-op if the file doesn't exist or Filesystem is unavailable.
 *
 * Called by usePhotoUploadQueue after a photo is confirmed synced to the server.
 */
export async function deleteLocalPhoto(localPath: string): Promise<void> {
  if (!localPath) return;

  const Filesystem = getFilesystemBridge();
  if (!Filesystem) return;

  try {
    await Filesystem.deleteFile({ path: localPath, directory: PHOTO_DIR });
  } catch {
    // File already deleted or path invalid — ignore silently
  }
}
