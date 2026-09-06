/**
 * Local-only native camera capture and durable photo storage.
 * This module deliberately performs no network operations.
 */

import { isNative } from '@/lib/capacitor-plugins';

export interface LocalCaptureResult {
  localId: string;
  localPath: string;
  localUri: string;
  previewUrl: string;
  idempotencyKey: string;
}

type NativePhoto = { uri?: string; webPath?: string };
type CameraBridge = {
  takePhoto: (options: Record<string, unknown>) => Promise<NativePhoto>;
};
type FilesystemBridge = {
  mkdir: (options: { path: string; directory: string; recursive?: boolean }) => Promise<void>;
  copy: (options: { from: string; to: string; toDirectory: string }) => Promise<{ uri: string }>;
  readFile: (options: { path: string; directory: string }) => Promise<{ data: string }>;
  deleteFile: (options: { path: string; directory: string }) => Promise<void>;
};
type CapacitorBridge = {
  Plugins?: Record<string, unknown>;
  convertFileSrc?: (path: string) => string;
};

const DIRECTORY_DATA = 'DATA';
const PHOTO_FOLDER = 'iwb-photos';

function bridge(): CapacitorBridge | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { Capacitor?: CapacitorBridge }).Capacitor ?? null;
}

function cameraPlugin(): CameraBridge | null {
  const camera = bridge()?.Plugins?.Camera as Partial<CameraBridge> | undefined;
  return camera && typeof camera.takePhoto === 'function' ? camera as CameraBridge : null;
}

function filesystemPlugin(): FilesystemBridge | null {
  const filesystem = bridge()?.Plugins?.Filesystem as Partial<FilesystemBridge> | undefined;
  if (!filesystem) return null;
  const valid = ['mkdir', 'copy', 'readFile', 'deleteFile'].every(
    (name) => typeof (filesystem as Record<string, unknown>)[name] === 'function',
  );
  return valid ? filesystem as FilesystemBridge : null;
}

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function base64ToFile(data: string, name: string): File {
  const decoded = atob(data);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return new File([bytes], name, { type: 'image/jpeg', lastModified: Date.now() });
}

export async function capturePhotoLocally(): Promise<LocalCaptureResult> {
  if (!isNative()) throw new Error('Native camera is unavailable');
  const camera = cameraPlugin();
  const filesystem = filesystemPlugin();
  if (!camera) throw new Error('Camera.takePhoto is unavailable');
  if (!filesystem) throw new Error('Native filesystem is unavailable');

  const photo = await camera.takePhoto({
    quality: 88,
    targetWidth: 3072,
    targetHeight: 3072,
    correctOrientation: true,
    encodingType: 0,
    saveToGallery: false,
    cameraDirection: 'REAR',
    editable: 'no',
    presentationStyle: 'fullscreen',
    includeMetadata: false,
  });
  const sourcePath = photo.uri ?? photo.webPath;
  if (!sourcePath) throw new Error('Camera returned no local photo path');

  const localId = createId();
  const localPath = `${PHOTO_FOLDER}/${localId}.jpg`;
  try {
    await filesystem.mkdir({ path: PHOTO_FOLDER, directory: DIRECTORY_DATA, recursive: true });
  } catch {
    // Existing directory is expected after the first capture.
  }
  const stored = await filesystem.copy({
    from: sourcePath,
    to: localPath,
    toDirectory: DIRECTORY_DATA,
  });
  const localUri = stored.uri;
  if (!localUri) throw new Error('Photo was not persisted to device storage');
  const previewUrl = bridge()?.convertFileSrc?.(localUri) ?? localUri;
  return { localId, localPath, localUri, previewUrl, idempotencyKey: localId };
}

export async function readLocalPhoto(
  localPath: string,
  fileName = localPath.split('/').pop() ?? 'photo.jpg',
  mimeType = 'image/jpeg',
): Promise<File | null> {
  if (!localPath) return null;
  const filesystem = filesystemPlugin();
  if (!filesystem) return null;
  try {
    const result = await filesystem.readFile({ path: localPath, directory: DIRECTORY_DATA });
    if (!result.data) return null;
    const file = base64ToFile(result.data, fileName);
    return file.type === mimeType ? file : new File([file], fileName, { type: mimeType });
  } catch {
    return null;
  }
}

export async function deleteLocalPhoto(localPath: string): Promise<void> {
  if (!localPath) return;
  const filesystem = filesystemPlugin();
  if (!filesystem) return;
  try {
    await filesystem.deleteFile({ path: localPath, directory: DIRECTORY_DATA });
  } catch {
    // Missing files require no cleanup.
  }
}
