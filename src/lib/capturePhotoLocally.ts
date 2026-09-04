/**
 * capturePhotoLocally
 * ─────────────────────────────────────────────────────────────────────────────
 * Stage 1 of the offline-first camera architecture.
 *
 * WHY THIS EXISTS:
 *   The old camera page used getUserMedia (WebRTC) which requires an active
 *   network context and is fragile on capacitor://localhost. Taking a photo
 *   and uploading a photo are NOT the same operation.
 *
 * WHAT THIS DOES:
 *   1. Opens the native iPhone camera via @capacitor/camera Camera.getPhoto()
 *   2. Copies the returned temporary URI into protected app storage
 *      (Filesystem Directory.Data) so it survives app restarts
 *   3. Returns lightweight metadata — the caller enqueues for upload separately
 *
 * WHAT THIS DOES NOT DO:
 *   - Upload anything
 *   - Hold the image as base64 or a data URL
 *   - Require network connectivity
 *   - Require an active login session
 *
 * REQUIRED XCODE PIECES (already in place after npx cap sync):
 *   - CAPCameraPlugin registered
 *   - NSCameraUsageDescription in Info.plist
 *   - NSPhotoLibraryUsageDescription in Info.plist
 *   - NSPhotoLibraryAddUsageDescription in Info.plist
 *
 * CAPACITOR 8 NOTE:
 *   Use Camera.getPhoto() with CameraResultType.Uri and CameraSource.Camera.
 *   Import directly from @capacitor/camera — never via window.Capacitor.Plugins.Camera bridge.
 */

import { Camera, CameraDirection, CameraResultType, CameraSource } from '@capacitor/camera';
import { Filesystem, Directory } from '@capacitor/filesystem';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LocalCapturedPhoto {
  /** Stable UUID for this capture — used as IDB key and idempotency key */
  localId: string;
  /** Path relative to Directory.Data, e.g. pending-photos/42/99/uuid.jpg */
  localPath: string;
  /** Absolute file:// URI returned by Filesystem.copy() — for reading back */
  localUri: string;
  /**
   * URL suitable for <img src> preview.
   * On native: the webPath from Camera (temporary but valid until next capture).
   * Falls back to localUri if webPath is absent.
   */
  previewUrl: string;
  mimeType: 'image/jpeg' | 'image/png';
  /** ISO 8601 timestamp */
  createdAt: string;
  status: 'pending';
  /** Sent as X-Idempotency-Key on upload — prevents duplicate photos on retry */
  idempotencyKey: string;
}

// ── Implementation ────────────────────────────────────────────────────────────

/**
 * Open the native camera, capture one photo, copy it to protected app storage,
 * and return lightweight metadata. Returns null if the user cancels.
 *
 * @param companyId  Used to namespace the storage path (tenant isolation)
 * @param jobId      Used to namespace the storage path
 */
export async function capturePhotoLocally(
  companyId: string,
  jobId: string,
): Promise<LocalCapturedPhoto | null> {
  // ── 1. Check / request camera permission ──────────────────────────────────
  const permission = await Camera.checkPermissions();

  if (permission.camera !== 'granted') {
    const requested = await Camera.requestPermissions({ permissions: ['camera'] });
    if (requested.camera !== 'granted') {
      throw new Error('camera_permission_denied');
    }
  }

  // ── 2. Open native camera ─────────────────────────────────────────────────
  let captured: Awaited<ReturnType<typeof Camera.getPhoto>>;
  try {
    captured = await Camera.getPhoto({
      quality: 85,
      allowEditing: false,
      resultType: CameraResultType.Uri,
      source: CameraSource.Camera,
      direction: CameraDirection.Rear,
      saveToGallery: false,
    });
  } catch (error) {
    // User cancelled — return null so the caller can ignore gracefully
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    if (
      message.includes('cancel') ||
      message.includes('dismiss') ||
      message.includes('user cancelled') ||
      message.includes('no image picked')
    ) {
      return null;
    }
    throw error;
  }

  if (!captured.path && !captured.webPath) {
    throw new Error('camera_returned_no_uri');
  }

  // ── 3. Copy to protected app storage ─────────────────────────────────────
  const localId = crypto.randomUUID();
  const idempotencyKey = crypto.randomUUID();

  // Determine extension from format metadata or default to jpg
  const ext = (captured.format ?? 'jpeg').toLowerCase() === 'png' ? 'png' : 'jpg';
  const mimeType: 'image/jpeg' | 'image/png' = ext === 'png' ? 'image/png' : 'image/jpeg';

  const dirPath = `pending-photos/${companyId}/${jobId}`;
  const localPath = `${dirPath}/${localId}.${ext}`;

  // Ensure directory exists
  try {
    await Filesystem.mkdir({
      path: dirPath,
      directory: Directory.Data,
      recursive: true,
    });
  } catch {
    // mkdir throws if directory already exists — that's fine
  }

  // Copy from the temporary camera URI to our durable storage
  const sourceUri = captured.path ?? captured.webPath!;

  const saved = await Filesystem.copy({
    from: sourceUri,
    to: localPath,
    toDirectory: Directory.Data,
  });

  return {
    localId,
    localPath,
    localUri: saved.uri,
    previewUrl: captured.webPath ?? saved.uri,
    mimeType,
    createdAt: new Date().toISOString(),
    status: 'pending',
    idempotencyKey,
  };
}

/**
 * Read a previously saved photo back as a File object.
 * Used by the upload queue when restoring after a force-close (IDB blob may
 * be gone but the Filesystem copy persists).
 *
 * Returns null if the file cannot be read (e.g. user cleared app data).
 */
export async function readLocalPhoto(
  localPath: string,
  fileName: string,
  mimeType: string,
): Promise<File | null> {
  try {
    const result = await Filesystem.readFile({
      path: localPath,
      directory: Directory.Data,
    });

    // result.data is a base64 string on native
    const base64 = typeof result.data === 'string' ? result.data : '';
    if (!base64) return null;

    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    return new File([bytes], fileName, { type: mimeType, lastModified: Date.now() });
  } catch {
    return null;
  }
}

/**
 * Delete a photo from protected app storage after confirmed server sync.
 * Non-throwing — if the file is already gone, that's fine.
 */
export async function deleteLocalPhoto(localPath: string): Promise<void> {
  try {
    await Filesystem.deleteFile({
      path: localPath,
      directory: Directory.Data,
    });
  } catch {
    // Already deleted or path invalid — ignore
  }
}
