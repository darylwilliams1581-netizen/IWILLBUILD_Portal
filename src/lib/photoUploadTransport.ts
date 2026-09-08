import { CapacitorHttp } from '@capacitor/core';
import { isNative } from '@/lib/capacitor-plugins';
import { resolveDownloadUrl } from '@/lib/native-api';

interface UploadResponse {
  photos?: Array<{ id: number }>;
  error?: string;
  code?: string;
}

interface UploadOptions {
  jobId: number;
  file: File;
  clientId: string;
  onProgress: (percent: number) => void;
  uploadEndpoint?: string;
}

function uploadError(status: number, data: UploadResponse | null): Error {
  const serverMessage = data?.error ?? data?.code;
  if (serverMessage) return new Error(serverMessage);
  if (status === 413) return new Error('File too large for upload');
  if (status === 502 || status === 503) return new Error('Server unavailable — will retry');
  if (status === 401) return new Error('Session expired — please log in again');
  return new Error(`Upload failed (${status})`);
}

function parseResponse(value: unknown): UploadResponse | null {
  if (value && typeof value === 'object') return value as UploadResponse;
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value) as UploadResponse;
  } catch {
    return null;
  }
}

/**
 * Encode a File without FileReader.readAsBinaryString(). Capacitor's patched
 * XMLHttpRequest uses that legacy API for FormData files; WKWebView can reject
 * native-backed camera/library Files with "The object could not be found".
 */
export async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const chunkSize = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return globalThis.btoa(binary);
}

async function uploadNative({
  jobId,
  file,
  clientId,
  onProgress,
  uploadEndpoint,
}: UploadOptions): Promise<{ id: number }> {
  const endpoint = resolveDownloadUrl(uploadEndpoint ?? `/api/jobs/${jobId}/photos`);
  onProgress(5);

  let base64: string;
  try {
    base64 = await fileToBase64(file);
  } catch {
    throw new Error('Photo file could not be read — saved on this device');
  }

  onProgress(20);
  const response = await CapacitorHttp.request({
    url: endpoint,
    method: 'POST',
    headers: {
      'Content-Type': 'multipart/form-data',
      'X-Client-Id': clientId,
    },
    dataType: 'formData',
    data: [{
      key: 'photos',
      value: base64,
      type: 'base64File',
      contentType: file.type || 'image/jpeg',
      fileName: file.name || `job-${jobId}-photo.jpg`,
    }],
    connectTimeout: 20_000,
    readTimeout: 120_000,
    responseType: 'json',
  });

  const data = parseResponse(response.data);
  if (response.status >= 200 && response.status < 300 && data?.photos?.[0]) {
    onProgress(100);
    return data.photos[0];
  }
  throw uploadError(response.status, data);
}

function uploadWeb({
  jobId,
  file,
  clientId,
  onProgress,
  uploadEndpoint,
}: UploadOptions): Promise<{ id: number }> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('photos', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', uploadEndpoint ?? `/api/jobs/${jobId}/photos`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('X-Client-Id', clientId);
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });
    xhr.addEventListener('load', () => {
      const data = parseResponse(xhr.responseText);
      if (xhr.status >= 200 && xhr.status < 300 && data?.photos?.[0]) {
        resolve(data.photos[0]);
      } else {
        reject(uploadError(xhr.status, data));
      }
    });
    xhr.addEventListener('error', () => reject(new Error('No connection — saved on device')));
    xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));
    xhr.send(formData);
  });
}

export function uploadPhotoFile(options: UploadOptions): Promise<{ id: number }> {
  return isNative() ? uploadNative(options) : uploadWeb(options);
}
