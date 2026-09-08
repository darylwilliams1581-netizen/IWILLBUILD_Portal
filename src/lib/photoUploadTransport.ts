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

async function uploadNative({
  jobId,
  file,
  clientId,
  onProgress,
  uploadEndpoint,
}: UploadOptions): Promise<{ id: number }> {
  const endpoint = resolveDownloadUrl(uploadEndpoint ?? `/api/jobs/${jobId}/photos`);
  onProgress(5);

  let uploadFile: File;
  try {
    const buffer = await file.arrayBuffer();
    uploadFile = new File(
      [buffer],
      file.name || `job-${jobId}-photo.jpg`,
      { type: 'image/jpeg', lastModified: file.lastModified || Date.now() },
    );
  } catch {
    throw new Error('Photo file could not be read — saved on this device');
  }

  onProgress(20);
  const form = new FormData();
  form.append('photos', uploadFile);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-Client-Id': clientId },
      body: form,
    });
  } catch {
    throw new Error('No connection — saved on device');
  }

  const data = parseResponse(await response.text());
  if (response.ok && data?.photos?.[0]) {
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
