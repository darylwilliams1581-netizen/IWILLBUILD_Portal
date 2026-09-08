import {
  FilesystemDirectory,
  getFilesystemPlugin,
  getSharePlugin,
  isNative,
} from '@/lib/capacitor-plugins';
import { resolveDownloadUrl } from '@/lib/native-api';

export type ExportFileType = 'csv' | 'pdf';

interface SaveAuthenticatedExportOptions {
  url: string;
  filename: string;
  fileType: ExportFileType;
  title: string;
}

async function responseError(response: Response): Promise<string> {
  const fallback = `Export failed (${response.status})`;
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';

  if (contentType.includes('application/json')) {
    const body = await response.json().catch(() => null) as { error?: unknown; message?: unknown } | null;
    const message = body?.error ?? body?.message;
    return typeof message === 'string' && message.trim() ? message : fallback;
  }

  if (contentType.startsWith('text/plain')) {
    const message = await response.text().catch(() => '');
    return message.trim() || fallback;
  }

  return fallback;
}

function bytesToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return window.btoa(binary);
}

async function validateExportBlob(blob: Blob, response: Response, fileType: ExportFileType) {
  if (blob.size === 0) throw new Error('The export was empty. Please try again.');

  const contentType = (response.headers.get('content-type') || blob.type).toLowerCase();
  if (contentType.includes('application/json') || contentType.includes('text/html')) {
    throw new Error('The server did not return a valid export. Please sign in and try again.');
  }

  if (fileType === 'pdf' && !contentType.includes('application/pdf')) {
    const signature = new window.TextDecoder().decode(await blob.slice(0, 5).arrayBuffer());
    if (signature !== '%PDF-') {
      throw new Error('The server did not return a valid PDF. Please try again.');
    }
  }
}

async function shareNativeFile(blob: Blob, filename: string, title: string) {
  const Filesystem = getFilesystemPlugin();
  const Share = getSharePlugin();
  if (!Filesystem || !Share) {
    throw new Error('File sharing is not available on this device.');
  }

  const directory = 'iwb-share';
  const path = `${directory}/${filename}`;

  try {
    await Filesystem.mkdir({
      path: directory,
      directory: FilesystemDirectory.Cache,
      recursive: true,
    });
  } catch {
    // The cache directory may already exist.
  }

  const result = await Filesystem.writeFile({
    path,
    data: bytesToBase64(await blob.arrayBuffer()),
    directory: FilesystemDirectory.Cache,
  });

  try {
    await Share.share({
      title,
      files: [result.uri],
      dialogTitle: `Save or share ${title}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (!message.includes('cancel') && !message.includes('dismiss')) throw error;
  } finally {
    try {
      await Filesystem.deleteFile({ path, directory: FilesystemDirectory.Cache });
    } catch {
      // Cache cleanup is best-effort.
    }
  }
}

function downloadWebFile(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
}

export async function saveAuthenticatedExport({
  url,
  filename,
  fileType,
  title,
}: SaveAuthenticatedExportOptions): Promise<void> {
  const response = await fetch(resolveDownloadUrl(url), { credentials: 'include' });
  if (!response.ok) throw new Error(await responseError(response));

  const blob = await response.blob();
  await validateExportBlob(blob, response, fileType);

  if (isNative()) {
    await shareNativeFile(blob, filename, title);
    return;
  }

  downloadWebFile(blob, filename);
}
