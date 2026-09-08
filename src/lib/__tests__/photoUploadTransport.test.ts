import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  isNative: vi.fn(() => true),
}));

vi.mock('@capacitor/core', () => ({
  CapacitorHttp: { request: mocks.request },
}));

vi.mock('@/lib/capacitor-plugins', () => ({ isNative: mocks.isNative }));
vi.mock('@/lib/native-api', () => ({
  resolveDownloadUrl: (url: string) => `https://iwillbuild.com${url}`,
}));

import { fileToBase64, uploadPhotoFile } from '@/lib/photoUploadTransport';

describe('native photo upload transport', () => {
  beforeEach(() => {
    mocks.request.mockReset();
    mocks.isNative.mockReturnValue(true);
  });

  it('encodes binary bytes without FileReader', async () => {
    const file = new File([new Uint8Array([0, 1, 2, 253, 254, 255])], 'site.jpg', {
      type: 'image/jpeg',
    });

    await expect(fileToBase64(file)).resolves.toBe('AAEC/f7/');
  });

  it('sends the native form-data shape supported by CapacitorHttp', async () => {
    mocks.request.mockResolvedValue({
      status: 201,
      data: { photos: [{ id: 72 }] },
      headers: {},
      url: 'https://iwillbuild.com/api/jobs/9/photos',
    });
    const progress: number[] = [];
    const file = new File(['jpeg'], 'capture.jpg', { type: 'image/jpeg' });

    await expect(uploadPhotoFile({
      jobId: 9,
      file,
      clientId: 'client-9',
      onProgress: (value) => progress.push(value),
    })).resolves.toEqual({ id: 72 });

    expect(mocks.request).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://iwillbuild.com/api/jobs/9/photos',
      method: 'POST',
      dataType: 'formData',
      headers: expect.objectContaining({ 'X-Client-Id': 'client-9' }),
      data: [expect.objectContaining({
        key: 'photos',
        type: 'base64File',
        fileName: 'capture.jpg',
        contentType: 'image/jpeg',
      })],
    }));
    expect(progress).toEqual([5, 20, 100]);
  });

  it('keeps the server error for the retry card', async () => {
    mocks.request.mockResolvedValue({
      status: 401,
      data: { error: 'Session expired' },
      headers: {},
      url: 'https://iwillbuild.com/api/jobs/9/photos',
    });

    await expect(uploadPhotoFile({
      jobId: 9,
      file: new File(['jpeg'], 'capture.jpg', { type: 'image/jpeg' }),
      clientId: 'client-9',
      onProgress: () => undefined,
    })).rejects.toThrow('Session expired');
  });
});
