import { Media } from '@capacitor-community/media';
import {
  FilesystemDirectory,
  getFilesystemPlugin,
  getSharePlugin,
  isNative,
} from '@/lib/capacitor-plugins';

export type ImageShareResult = 'shared' | 'saved' | 'downloaded' | 'cancelled';

function bytesToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return window.btoa(binary);
}

async function fileToDataUrl(file: File): Promise<string> {
  const mimeType = file.type || 'image/jpeg';
  return `data:${mimeType};base64,${bytesToBase64(await file.arrayBuffer())}`;
}

function safeFilename(name: string, index: number): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
  return `${index + 1}-${cleaned || `photo-${index + 1}.jpg`}`;
}

function isDismissed(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes('cancel') || message.includes('dismiss') || message.includes('user did not share');
}

async function shareWithWebFiles(files: File[], title: string): Promise<ImageShareResult | null> {
  if (typeof navigator.share !== 'function') return null;

  const data = { title, files };
  if (typeof navigator.canShare === 'function' && !navigator.canShare(data)) return null;

  try {
    await navigator.share(data);
    return 'shared';
  } catch (error) {
    if (isDismissed(error)) return 'cancelled';
    throw error;
  }
}

function downloadWebFiles(files: File[]): void {
  files.forEach((file, index) => {
    window.setTimeout(() => {
      const objectUrl = URL.createObjectURL(file);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = file.name;
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
    }, index * 250);
  });
}

async function saveToCameraRoll(files: File[]): Promise<boolean> {
  let saved = 0;
  for (const file of files) {
    try {
      await Media.savePhoto({ path: await fileToDataUrl(file) });
      saved += 1;
    } catch {
      // Continue so one rejected image does not prevent the other backups.
    }
  }
  return saved === files.length;
}

/**
 * Shares real image attachments. Native builds write temporary cache files for
 * Capacitor Share; web builds use Web Share files or downloads. No portal URL is
 * ever passed to a share sheet.
 */
export async function shareImageFiles(files: File[], title: string): Promise<ImageShareResult> {
  if (files.length === 0) throw new Error('Select at least one photo to send.');

  if (!isNative()) {
    const shared = await shareWithWebFiles(files, title);
    if (shared) return shared;
    downloadWebFiles(files);
    return 'downloaded';
  }

  const Filesystem = getFilesystemPlugin();
  const Share = getSharePlugin();
  let primaryError: unknown;

  if (Filesystem && Share) {
    const directory = `iwb-share/photos-${Date.now()}`;
    const writtenPaths: string[] = [];
    try {
      await Filesystem.mkdir({
        path: directory,
        directory: FilesystemDirectory.Cache,
        recursive: true,
      });

      const fileUris: string[] = [];
      for (const [index, file] of files.entries()) {
        const path = `${directory}/${safeFilename(file.name, index)}`;
        const result = await Filesystem.writeFile({
          path,
          data: bytesToBase64(await file.arrayBuffer()),
          directory: FilesystemDirectory.Cache,
        });
        writtenPaths.push(path);
        fileUris.push(result.uri);
      }

      await Share.share({
        title,
        files: fileUris,
        dialogTitle: 'Share selected photos',
      });
      return 'shared';
    } catch (error) {
      if (isDismissed(error)) return 'cancelled';
      primaryError = error;
    } finally {
      for (const path of writtenPaths) {
        try {
          await Filesystem.deleteFile({ path, directory: FilesystemDirectory.Cache });
        } catch {
          // Cache cleanup is best-effort.
        }
      }
    }
  }

  // Spare path: retain the pictures in Photos, then try the Web Share API with
  // the same File objects so Mail, Messages and AirDrop still receive images.
  const savedAll = await saveToCameraRoll(files);
  try {
    const shared = await shareWithWebFiles(files, title);
    if (shared) return shared;
  } catch (error) {
    primaryError = error;
  }

  if (savedAll) return 'saved';
  throw primaryError instanceof Error
    ? primaryError
    : new Error('The selected photos could not be shared.');
}
